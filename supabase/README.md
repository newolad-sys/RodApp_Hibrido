# Backend (Supabase)

Este proyecto usa **Supabase** como unico backend (Auth + Postgres + Storage).
El unico codigo de servidor propio es la Edge Function `consulta-runt` (ver
seccion "Consulta RUNT"); el resto es configuracion y migraciones SQL.

> Estado actual: migracion inicial en
> `migrations/20260911000000_esquema_inicial.sql` con las 9 tablas, RLS y el
> trigger de perfil, **ya aplicada** al proyecto en la nube (verificado con
> `npx supabase migration list`). El frontend ya esta preparado para
> consumirla.

## Estructura

| Ruta | Para que sirve |
|---|---|
| `config.toml` | Configuracion de la CLI de Supabase (puertos, Auth, redirects, Google OAuth). |
| `migrations/` | Migraciones SQL versionadas. Una por archivo, con prefijo de timestamp. |
| `functions/consulta-runt/` | Edge Function (Deno) que consulta el RUNT via PlacApi. |
| `seed.sql` | Datos de prueba para el entorno local. |

## Puesta en marcha

La CLI ya está instalada como `devDependency` del proyecto (`npm install
supabase --save-dev`), no hace falta instalarla global. Se usa con `npx
supabase ...` o con los scripts de `package.json`:

```bash
# 1. Login. `npm run db:login` abre el navegador, pero eso requiere una
#    terminal interactiva (TTY) — si estas en un entorno sin eso (p.ej.
#    Claude Code), usa un access token en su lugar:
#    genera uno en supabase.com/dashboard/account/tokens y corre:
npx supabase login --token TU_TOKEN --no-browser

# 2. Enlazar con el proyecto en la nube (pide la contraseña de la BD si no
#    se pasa por flag; resetearla en Project Settings > Database si hace falta)
npx supabase link --project-ref smkhwldylnztluitsciz --password TU_PASSWORD

# 3. Aplicar las migraciones pendientes de migrations/
npm run db:push

# 4. Crear una migracion nueva
npx supabase migration new nombre_de_la_migracion

# 5. (Opcional, requiere Docker Desktop) entorno local con Postgres/Auth/Storage
npm run db:start   # levanta los contenedores
npm run db:diff    # compara el esquema local contra las migraciones
npm run db:stop    # los apaga
```

> `db:push`/`db:link`/`db:login` hablan directo con el proyecto en la nube y
> **no necesitan Docker**. Docker solo hace falta para `db:start` (replica
> local de Supabase) — ver el porque en la seccion de abajo.

## Autenticacion — configuracion en el panel

En **Dashboard > Authentication**:

1. **URL Configuration > Redirect URLs**: agregar
   - `http://localhost:8100/auth/callback` (web dev)
   - la URL de produccion `/auth/callback`
   - `com.rodapp.hibrido://auth/callback` (deep link movil)
2. **Providers > Google**: habilitar y pegar el *Client ID* y *Client Secret*
   de Google Cloud Console. En Google, el "Authorized redirect URI" debe ser
   `https://smkhwldylnztluitsciz.supabase.co/auth/v1/callback`.
3. **Email**: `enable_confirmations` esta en `false` para agilizar pruebas;
   activarlo en produccion.

## Esquema (`20260911000000_esquema_inicial.sql`)

El cliente (`src/app/core/services/supabase.service.ts`) ya referencia estas
tablas. Todas tienen **RLS activado**, con politicas que limitan cada fila a
su `user_id` / `auth.uid()` (para `soat`, `rtm`, `documentos` y los registros
de operacion, la propiedad se resuelve via `es_dueno_de_moto(moto_id)`, que
comprueba que la moto sea del usuario autenticado):

| Tabla | Uso desde el frontend |
|---|---|
| `users` | Perfil de negocio (1:1 con `auth.users.id`): `name`, `lastname`, `correo`, `avatar_url`, `rol`. |
| `motos` | Motocicletas del usuario (`user_id`, `marca`, `modelo`, `placa`, `odometro_inicial`, `activa`). |
| `soat` | Polizas SOAT por moto (`moto_id`, fechas de vigencia). |
| `rtm` | Revision tecnico-mecanica por moto. |
| `documentos` | Otros documentos legales por moto. |
| `registros_combustible` | Tanqueadas (`moto_id`, `costo`, `kilometraje`, `lugar`, `latitud`/`longitud`). |
| `registros_mantenimiento` | Mantenimientos (`moto_id`, `tipo`, `fecha`, `kilometraje`, `costo`). |
| `notificaciones` | Alertas del usuario (vencimientos, recordatorios) — hoy consumidas como datos de ejemplo en `/app/notificaciones`. |
| `consejos` | Contenido tipo blog, lectura publica para autenticados, escritura solo `rol = 'admin'` — hoy datos de ejemplo en `/app/consejos`. |

Trigger `on_auth_user_created` (`handle_new_user()`) crea automaticamente la
fila en `users` al registrarse. Es un respaldo: `AuthService` tambien la crea
desde el cliente (`upsertPerfil`) tras el registro o el primer login con
Google, por lo que el trigger usa `on conflict (id) do nothing`.

Para aplicarla ver "Puesta en marcha" arriba (`npm run db:link` + `npm run
db:push`).

**Migracion `20260912000000_ajustes_formularios.sql`:** agrega `costo` a
`registros_mantenimiento` y `lugar` a `registros_combustible` — columnas que
los formularios ya mostraban en la UI pero la migracion inicial no tenia.

Los 4 formularios (combustible, mantenimiento, SOAT, RTM) y el alta de moto
(`/app/garaje/nueva`, prerequisito: todos requieren un `moto_id`) ya estan
conectados a estas tablas. Pendiente: las vistas con estado "con datos"
(Inicio, Historial) y hacer dinamico `moto-detail`/`documentos/detalle`
(hoy siguen con datos de ejemplo).

## Consulta RUNT (Edge Function `consulta-runt`)

Autocompleta el registro de moto con la ficha del RUNT usando
[PlacApi](https://placapi.com/docs/consulta-vehicular) (`POST /api/consulta`,
1 credito por consulta con datos). Pasa por una Edge Function porque PlacApi
**no habilita CORS** y su API key **no puede ir en el frontend**.

- **Entrada** (desde `RuntService.consultar`): `placa`, `docType` (CC, CE,
  NIT, PA, TI, CD, PPT, RC), `docNumber`, `refresh` opcional.
- **Salida:** un resumen (`RuntResumen` en `src/app/core/models/models.ts`):
  datos del vehiculo, el SOAT y la RTM mas recientes, y alertas.
- **Cache 24 h y tope diario** por usuario en la tabla `consultas_runt`
  (migracion `20261110000000_consultas_runt.sql`). El numero de documento
  **no se guarda**.

### Secretos

| Secreto | Valor | Default |
|---|---|---|
| `PLACAPI_MODE` | `mock` (datos ficticios, sin red ni creditos) o `live` | `mock` |
| `PLACAPI_KEY` | API key de PlacApi (`pk_live_...`), solo para `live` | — |
| `PLACAPI_BASE_URL` | Host de la API | `https://placapi.com` |
| `PLACAPI_LIMITE_DIARIO` | Consultas reales por usuario cada 24 h | `3` |

### Desplegar

```bash
npm run db:push                                   # crea la tabla consultas_runt
npx supabase functions deploy consulta-runt       # sube la funcion
# Para pasar a datos reales (gasta creditos):
npx supabase secrets set PLACAPI_MODE=live PLACAPI_KEY=pk_live_...
```

La API key se crea en https://placapi.com/integracion. **Nunca** la pongas en
`environment*.ts` ni en un archivo commiteado. La primera consulta es gratis;
despues se compran creditos (minimo 30). El saldo se ve con
`GET https://placapi.com/api/me` (no cobra).

## Docker (opcional, solo para desarrollo local)

Docker empaqueta un programa junto con todo lo que necesita para correr
(sistema de archivos, librerias, configuracion) en un **contenedor**: una
unidad aislada y reproducible que corre igual en cualquier maquina, sin
"en mi PC funciona" y sin instalar Postgres/Auth/Storage a mano. Es mas
liviano que una maquina virtual completa porque comparte el kernel del
sistema operativo en vez de emular hardware.

La CLI de Supabase usa Docker para `supabase start`: levanta contenedores
con **Postgres + Auth (GoTrue) + Storage + Studio**, una copia local del
proyecto de la nube. Sirve para:

- Probar esta migracion (o una nueva) contra una base de datos real antes
  de aplicarla al proyecto en produccion.
- Desarrollar sin conexion y sin arriesgar los datos reales.
- Ejecutar `supabase db diff` para generar el SQL de una migracion nueva
  automaticamente, comparando el estado local contra las migraciones ya
  aplicadas.

**No es obligatorio**: `db:push`, `db:link` y `db:login` hablan directo con
el proyecto en la nube (`smkhwldylnztluitsciz`) via su API, asi que se puede
seguir trabajando sin Docker. Instalar Docker Desktop (Windows, con backend
WSL2) solo vale la pena si el equipo quiere ese ciclo de prueba local antes
de tocar produccion.
