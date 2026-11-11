// Edge Function `consulta-runt` (Deno).
//
// Puente entre la app y PlacApi (https://placapi.com/docs/consulta-vehicular).
// Existe porque PlacApi NO habilita CORS y su API key no puede ir en el
// frontend: cualquiera que la viera gastaria los creditos de la cuenta.
//
// Flujo:
//   1. Exige sesion de Supabase (JWT del usuario).
//   2. Valida placa / tipo y numero de documento.
//   3. Cache: si el usuario ya consulto esa placa en las ultimas 24 h,
//      devuelve el resumen guardado en `consultas_runt` (0 creditos).
//   4. Tope: corta si el usuario ya hizo PLACAPI_LIMITE_DIARIO consultas
//      reales en 24 h.
//   5. Llama a POST /api/consulta (1 credito si devuelve datos), recorta la
//      respuesta a lo que usa la app y la guarda en `consultas_runt`.
//
// Secretos (supabase secrets set ...):
//   PLACAPI_MODE           'mock' (default, datos ficticios) | 'live'
//   PLACAPI_KEY            pk_live_...  (obligatorio en modo live)
//   PLACAPI_BASE_URL       default https://placapi.com
//   PLACAPI_LIMITE_DIARIO  default 3
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta Supabase automaticamente.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/* ============================== Tipos ================================= */

/** Lo que devuelve esta funcion a la app (mismo shape en `models.ts`). */
interface RuntResumen {
  placa: string;
  vehiculo: {
    marca: string | null;
    linea: string | null;
    modelo: string | null; // ano modelo, ej. "2023"
    cilindraje: number | null;
    color: string | null;
    clase: string | null;
    servicio: string | null;
    combustible: string | null;
    estado: string | null;
    fechaMatricula: string | null; // YYYY-MM-DD
    organismoTransito: string | null;
  };
  soat: {
    numeroPoliza: string;
    aseguradora: string;
    fechaInicio: string; // YYYY-MM-DD
    fechaVencimiento: string;
    vigente: boolean;
  } | null;
  rtm: {
    numeroCertificado: string;
    cda: string;
    fechaExpedicion: string;
    fechaVencimiento: string;
    vigente: boolean;
  } | null;
  /** Avisos legibles: vehiculo inactivo, desintegrado, con gravamenes... */
  alertas: string[];
  fuente: 'placapi' | 'cache' | 'mock';
  consultadoAt: string; // ISO
}

type Json = Record<string, unknown>;

/* ============================ Constantes ============================== */

const TIPOS_DOC = ['CC', 'CE', 'NIT', 'PA', 'TI', 'CD', 'PPT', 'RC'] as const;
const CACHE_HORAS = 24;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Codigos de error de PlacApi (`code` del body, ver /docs/errores) traducidos
 * a mensajes para el usuario. Lo que no esta aqui cae en `error_fuente`.
 */
const ERRORES_PLACAPI: Record<string, { status: number; mensaje: string }> = {
  bad_request: { status: 400, mensaje: 'La placa o el documento no tienen un formato valido.' },
  tipo_documento_no_soportado: { status: 400, mensaje: 'Ese tipo de documento no se puede consultar.' },
  consulta_invalida: { status: 400, mensaje: 'La consulta no es valida. Revisa los datos.' },
  propietario_no_coincide: {
    status: 404,
    mensaje: 'El documento no corresponde al propietario actual de esa placa.',
  },
  vehiculo_no_registrado: { status: 404, mensaje: 'Esa placa no aparece registrada en el RUNT.' },
  consulta_sin_resultado: { status: 404, mensaje: 'El RUNT no devolvio informacion para esa placa.' },
  rate_limited: { status: 503, mensaje: 'El servicio esta ocupado. Intenta en unos segundos.' },
  source_error: { status: 503, mensaje: 'El RUNT no respondio a tiempo. Intenta mas tarde.' },
  fuente_saturada: { status: 503, mensaje: 'El RUNT esta saturado. Intenta mas tarde.' },
  // Problemas de NUESTRA cuenta: el usuario no puede hacer nada, se registra en logs.
  unauthorized: { status: 503, mensaje: 'La consulta al RUNT no esta disponible en este momento.' },
  no_credits: { status: 503, mensaje: 'La consulta al RUNT no esta disponible en este momento.' },
};

/* ============================= Handler ================================ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return error(405, 'metodo_no_permitido', 'Usa POST.');

  // --- 1. Sesion -------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return error(401, 'sin_sesion', 'Inicia sesion para consultar el RUNT.');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return error(401, 'sin_sesion', 'Inicia sesion para consultar el RUNT.');

  // --- 2. Validacion ---------------------------------------------------
  let body: Json;
  try {
    body = await req.json();
  } catch {
    return error(400, 'cuerpo_invalido', 'El cuerpo debe ser JSON.');
  }

  const placa = String(body.placa ?? '').toUpperCase().replace(/[\s-]/g, '');
  const docType = String(body.docType ?? '').toUpperCase().trim();
  const docNumber = String(body.docNumber ?? '').replace(/[\s.]/g, '');
  const refresh = body.refresh === true;

  if (!/^[A-Z0-9]{5,7}$/.test(placa)) {
    return error(400, 'placa_invalida', 'La placa debe tener de 5 a 7 letras o numeros.');
  }
  if (!(TIPOS_DOC as readonly string[]).includes(docType)) {
    return error(400, 'tipo_documento_invalido', 'Tipo de documento no valido.');
  }
  if (!/^[A-Z0-9]{3,20}$/i.test(docNumber)) {
    return error(400, 'documento_invalido', 'El numero de documento no es valido.');
  }

  const modo = (Deno.env.get('PLACAPI_MODE') ?? 'mock').toLowerCase();
  const desde = new Date(Date.now() - CACHE_HORAS * 3600_000).toISOString();

  // --- 3. Cache --------------------------------------------------------
  if (!refresh) {
    const { data: previa } = await supabase
      .from('consultas_runt')
      .select('resumen')
      .eq('user_id', userId)
      .eq('placa', placa)
      .eq('fuente', modo === 'live' ? 'placapi' : 'mock')
      .gte('consultado_at', desde)
      .order('consultado_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previa?.resumen) {
      return ok({ ...(previa.resumen as RuntResumen), fuente: 'cache' });
    }
  }

  // --- Modo mock: datos ficticios, sin red ni creditos -----------------
  if (modo !== 'live') {
    const resumen = resumenMock(placa);
    await guardar(supabase, userId, placa, 'mock', resumen);
    return ok(resumen);
  }

  // --- 4. Tope diario --------------------------------------------------
  const limite = Number(Deno.env.get('PLACAPI_LIMITE_DIARIO') ?? '3');
  const { count } = await supabase
    .from('consultas_runt')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('fuente', 'placapi')
    .gte('consultado_at', desde);
  if ((count ?? 0) >= limite) {
    return error(
      429,
      'limite_diario',
      `Alcanzaste el limite de ${limite} consultas al RUNT por dia. Intenta manana.`,
    );
  }

  // --- 5. PlacApi ------------------------------------------------------
  const apiKey = Deno.env.get('PLACAPI_KEY');
  if (!apiKey) {
    console.error('[consulta-runt] PLACAPI_MODE=live pero falta el secreto PLACAPI_KEY');
    return error(503, 'no_configurado', 'La consulta al RUNT no esta disponible en este momento.');
  }
  const baseUrl = (Deno.env.get('PLACAPI_BASE_URL') ?? 'https://placapi.com').replace(/\/$/, '');

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/consulta`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ placa, docType, docNumber, refresh }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error('[consulta-runt] fallo de red con PlacApi', e);
    return error(503, 'source_error', ERRORES_PLACAPI.source_error.mensaje);
  }

  const payload = (await res.json().catch(() => ({}))) as Json;

  if (!res.ok) {
    const code = String(payload.code ?? payload.errorCode ?? '');
    // Nunca se registra el documento: solo placa, status y code.
    console.error(`[consulta-runt] PlacApi ${res.status} code=${code} placa=${placa}`);
    const conocido = ERRORES_PLACAPI[code];
    const retryAfter = res.headers.get('Retry-After');
    return error(
      conocido?.status ?? 502,
      code || 'error_fuente',
      conocido?.mensaje ?? 'No se pudo consultar el RUNT. Intenta mas tarde.',
      retryAfter ? { 'Retry-After': retryAfter } : undefined,
    );
  }

  const resumen = resumir(placa, (payload.data ?? {}) as Json, String(payload.fetchedAt ?? ''));
  await guardar(supabase, userId, placa, 'placapi', resumen);
  return ok(resumen);
});

/* ========================== Transformacion ============================ */

/** Recorta la ficha del RUNT (cientos de campos) a lo que usa la app. */
function resumir(placa: string, data: Json, fetchedAt: string): RuntResumen {
  const g = (data.informacionGeneral ?? {}) as Json;
  const soats = (Array.isArray(data.soat) ? data.soat : []) as Json[];
  const rtms = (Array.isArray(data.tecnoMecanica) ? data.tecnoMecanica : []) as Json[];

  const soat = masReciente(soats);
  const rtm = masReciente(rtms);

  const alertas: string[] = [];
  const estado = texto(g.estadoDelVehiculo);
  if (estado && estado !== 'ACTIVO') alertas.push(`El vehiculo figura como ${estado} en el RUNT.`);
  if (data.certificadoDesintegracion) {
    alertas.push('El vehiculo tiene certificado de desintegracion: no puede circular.');
  }
  if (texto(g.tieneGravamenes) === 'SI' || texto(g.prendas) === 'SI') {
    alertas.push('El vehiculo tiene gravamenes o prendas registradas.');
  }
  if (Array.isArray(data.limitacionPropiedad) && data.limitacionPropiedad.length > 0) {
    alertas.push('El vehiculo tiene limitaciones a la propiedad.');
  }

  const cil = Number.parseInt(String(g.cilindraje ?? ''), 10);

  return {
    placa,
    vehiculo: {
      marca: texto(g.marca),
      linea: texto(g.linea),
      modelo: texto(g.modelo),
      cilindraje: Number.isFinite(cil) ? cil : null,
      color: texto(g.color),
      clase: texto(g.claseVehiculo),
      servicio: texto(g.tipoServicio),
      combustible: texto(g.tipoCombustible),
      estado,
      fechaMatricula: fechaIso(g.fechaMatricula),
      organismoTransito: texto(g.organismoTransito),
    },
    soat: soat
      ? {
          numeroPoliza: texto(soat.noPoliza) ?? '',
          aseguradora: texto(soat.entidadExpideSoat) ?? '',
          fechaInicio: fechaIso(soat.fechaVigencia ?? soat.fechaExpedicion) ?? '',
          fechaVencimiento: fechaIso(soat.fechaVencimiento) ?? '',
          vigente: texto(soat.estado) === 'VIGENTE',
        }
      : null,
    rtm: rtm
      ? {
          numeroCertificado: texto(rtm.nroCertificado) ?? '',
          cda: texto(rtm.cdaExpide) ?? '',
          fechaExpedicion: fechaIso(rtm.fechaExpedicion) ?? '',
          fechaVencimiento: fechaIso(rtm.fechaVencimiento) ?? '',
          vigente: texto(rtm.vigente) === 'SI',
        }
      : null,
    alertas,
    fuente: 'placapi',
    consultadoAt: fetchedAt || new Date().toISOString(),
  };
}

/** El registro con la fecha de vencimiento mas lejana (el historico trae todos). */
function masReciente(lista: Json[]): Json | null {
  let mejor: Json | null = null;
  let mejorFecha = '';
  for (const item of lista) {
    const f = fechaIso(item.fechaVencimiento) ?? '';
    if (!mejor || f > mejorFecha) {
      mejor = item;
      mejorFecha = f;
    }
  }
  return mejor;
}

/** "DD/MM/YYYY" -> "YYYY-MM-DD" (formato de las columnas `date`). */
function fechaIso(valor: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function texto(valor: unknown): string | null {
  const s = String(valor ?? '').trim();
  return s ? s : null;
}

/** Datos ficticios para desarrollar sin gastar creditos (PLACAPI_MODE=mock). */
function resumenMock(placa: string): RuntResumen {
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const mas = (dias: number) => new Date(hoy.getTime() + dias * 86400_000);
  return {
    placa,
    vehiculo: {
      marca: 'YAMAHA',
      linea: 'FZ 2.0',
      modelo: '2022',
      cilindraje: 149,
      color: 'NEGRO',
      clase: 'MOTOCICLETA',
      servicio: 'Particular',
      combustible: 'GASOLINA',
      estado: 'ACTIVO',
      fechaMatricula: '2022-03-15',
      organismoTransito: 'SECRETARIA DISTRITAL DE MOVILIDAD DE BOGOTA (MOCK)',
    },
    soat: {
      numeroPoliza: 'MOCK-0000001',
      aseguradora: 'ASEGURADORA DE PRUEBA',
      fechaInicio: iso(mas(-300)),
      fechaVencimiento: iso(mas(65)),
      vigente: true,
    },
    rtm: {
      numeroCertificado: 'MOCK-RTM-0001',
      cda: 'CDA DE PRUEBA',
      fechaExpedicion: iso(mas(-200)),
      fechaVencimiento: iso(mas(165)),
      vigente: true,
    },
    alertas: ['Datos ficticios (modo mock): no provienen del RUNT.'],
    fuente: 'mock',
    consultadoAt: hoy.toISOString(),
  };
}

/* ============================ Utilidades ============================== */

async function guardar(
  supabase: SupabaseClient,
  userId: string,
  placa: string,
  fuente: 'placapi' | 'mock',
  resumen: RuntResumen,
): Promise<void> {
  const { error: e } = await supabase
    .from('consultas_runt')
    .insert({ user_id: userId, placa, fuente, resumen });
  // Si falla solo se pierde la cache: la respuesta al usuario sigue siendo valida.
  if (e) console.error('[consulta-runt] no se pudo guardar la consulta', e.message);
}

function ok(resumen: RuntResumen): Response {
  return new Response(JSON.stringify(resumen), {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function error(
  status: number,
  code: string,
  mensaje: string,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ code, mensaje }), {
    status,
    headers: { ...CORS, ...extra, 'content-type': 'application/json' },
  });
}
