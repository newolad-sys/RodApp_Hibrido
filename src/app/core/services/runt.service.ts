import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { SupabaseService } from './supabase.service';
import { RuntResumen, TipoDocumentoRunt } from '../models/models';

/** Error de la consulta con un mensaje ya listo para mostrar al usuario. */
export class RuntError extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'RuntError';
  }
}

/**
 * Consulta la ficha de un vehiculo en el RUNT.
 *
 * No llama a PlacApi directamente (no tiene CORS y su API key no puede ir en
 * el frontend): pasa por la Edge Function `consulta-runt`, que guarda la
 * clave, aplica cache de 24 h y un tope diario de consultas por usuario.
 */
@Injectable({ providedIn: 'root' })
export class RuntService {
  private readonly supabase = inject(SupabaseService);

  async consultar(
    placa: string,
    docType: TipoDocumentoRunt,
    docNumber: string,
    refresh = false,
  ): Promise<RuntResumen> {
    const { data, error } = await this.supabase.client.functions.invoke<RuntResumen>(
      'consulta-runt',
      { body: { placa, docType, docNumber, refresh } },
    );

    if (error) {
      // La funcion responde { code, mensaje } en los errores HTTP.
      if (error instanceof FunctionsHttpError) {
        const cuerpo = await (error.context as Response).json().catch(() => null);
        if (cuerpo?.mensaje) throw new RuntError(cuerpo.code ?? 'error', cuerpo.mensaje);
      }
      throw new RuntError('sin_conexion', 'No se pudo consultar el RUNT. Revisa tu conexion.');
    }
    if (!data) throw new RuntError('sin_datos', 'El RUNT no devolvio informacion.');
    return data;
  }
}
