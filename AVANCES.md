# RodApp Híbrido — Avances

Documento de continuidad. Resume **todo** lo hecho para poder retomar tras
reiniciar el equipo o cambiar de máquina.

- **Ubicación:** `C:\Users\EQUIPO\Documents\Ucompensar\7mo Semestre\Desarrollo apps hibridas\RodApp_Hibrido`
- **Stack:** Ionic 8 (standalone) + Angular 18 (standalone, sin NgModules) + Capacitor 6 + Supabase (backend único). Estado con signals.
- **Repositorio:** `https://github.com/newolad-sys/RodApp_Hibrido` — rama de trabajo **`Oscar`**.
- **Última actualización:** 2026-11-16

---

## 0. Resumen de la jornada 2026-11-16

| Tema | Resultado |
|---|---|
| Cambio de repositorio | ✅ Migrado a `newolad-sys/RodApp_Hibrido` con las 4 ramas |
| Integración de ramas | ✅ `Oscar` = Diego (`d6962e8`) + Cristian (`384d336`) + RUNT + mockups |
| Build de producción | ✅ `npm run build` sin errores (arreglado BigInt de `maplibre-gl` 6) |
| Supabase | ✅ 9 migraciones aplicadas, Edge Function `consulta-runt` desplegada |
| Consulta RUNT (PlacApi) | ✅ Probada en modo `mock` y en `live` con una moto real |
| Eliminar moto | ✅ Botón nuevo en el detalle de la moto + placa única **por usuario** |
| Login con Google | ✅ Funcionando en web (probado con dos cuentas) |
| Consejos | ✅ Funciona (el fallo era el servidor de desarrollo caído) |
| Recuperar contraseña | ⏳ Sin cerrar: aparece *"Ocurrió un error inesperado"* (ver §3) |

---

## 1. Estado de Git

- **Repo actual:** `https://github.com/newolad-sys/RodApp_Hibrido` (remoto
  `origin`). Ramas: `main`, `Oscar`, `Diego`, `Cristian`.
- **Repo original:** `https://github.com/newolad/RodApp_Hibrido`, configurado
  como remoto **`original`** (solo lectura). Se dejó de usar el 2026-11-16 por
  el cambio de equipo: la cuenta guardada en Windows (`newolad-sys`) no tiene
  permiso de escritura allí (error 403).
- **Rama de trabajo: `Oscar`.** Contiene todo:
  - `c8a7f12` merge de `Diego` local (mapa MapLibre, vistas Figma, repunte a
    Supabase nuevo, RUNT).
  - `a129008` merge de `original/Diego` (`d6962e8`: datos reales, recordatorios
    locales, tema claro/oscuro, reset de contraseña, panel admin).
  - `ac60ec8` eliminar moto + placa única por usuario + ignora credenciales de Google.
  - `d285af3` merge de `Cristian` (nombre del registro al perfil, rediseño de
    campos del formulario de moto, página de documentos, README de la
    entrega con capturas, carpeta `android/`).
- `Diego` también tiene `d6962e8` y los commits del RUNT. `Cristian` quedó
  copiada tal cual desde el repo original.
- ⚠️ **El historial se reescribió el 2026-10-11** (`git filter-branch` + force
  push). No citar SHAs anteriores a esa fecha.
- **Fuera de los commits, a propósito:**
  - `.mcp.json`: configuración local del MCP de Supabase. **Decisión: no se sube.**
  - `client_secret_*.json`: credenciales descargadas de Google Cloud. Están en
    `.gitignore` y **nunca deben quedar dentro del proyecto**.
  - `Imagenes/`: capturas personales de depuración.

---

## 2. Lo que está HECHO

### 2.1 Base del proyecto
- Scaffold completo: `package.json`, `angular.json` (salida a `www`),
  `tsconfig*`, `ionic.config.json`, `capacitor.config.ts`, `.gitignore`,
  `.editorconfig`, `.nvmrc` (Node 20), `.browserslistrc`, `.env.example`.
- **`npm run build` verificado el 2026-11-16.** Solo quedan dos avisos de
  presupuesto de SCSS (`map.page.scss` 9 kB y `admin-users.page.scss` 7 kB,
  aviso desde 6 kB, error desde 12 kB). No bloquean.
- **`.browserslistrc` subido a Chrome/Android ≥ 67, Firefox ≥ 68, Safari/iOS ≥ 14.**
  `maplibre-gl` 6 usa literales BigInt (`0n`) y con los mínimos anteriores
  (Chrome 61, iOS 13) el build de producción fallaba. `ng serve` no lo detecta.
- Dependencias nativas nuevas: `@capacitor/local-notifications` (Diego) y
  `@capacitor/geolocation` (Cristian). Tras traer cambios ajenos, correr
  `npm install` antes del build.
- Arranque: `npm start` → `http://localhost:8100`. **Dejar esa terminal solo
  para la app**: si se detiene, las pantallas no visitadas fallan con
  `ChunkLoadError` (así se vio "Consejos" sin funcionar).

### 2.2 Backend Supabase — proyecto `smkhwldylnztluitsciz`
- Proyecto vinculado con la CLI (`supabase/.temp/project-ref`). La CLI está
  fijada en `2.117.0` en `package.json`; **no actualizar a la v3** sin probar.
- **9 migraciones aplicadas** (`npx supabase migration list`):

| Migración | Qué hace |
|---|---|
| `20260911000000_esquema_inicial` | 9 tablas, RLS y trigger de perfil |
| `20260912000000_ajustes_formularios` | `costo` en mantenimiento, `lugar` en combustible |
| `20260913000000_formaliza_ajustes_manuales` | `motos.updated_at` |
| `20261110000000_consultas_runt` | Caché y tope diario de consultas al RUNT |
| `20261112000000_protege_rol_usuarios` | Un usuario no puede cambiarse el rol |
| `20261112000100_panel_admin` | `es_admin()`, suspensión de cuentas, RPC de admin |
| `20261113000000_consejos_iniciales` | Contenido inicial de Consejos |
| `20261115000000_nombre_desde_metadata` | El perfil toma nombre/apellido del registro o de Google |
| `20261116000000_placa_unica_por_usuario` | `unique (user_id, placa)` en lugar de `unique (placa)` |

- `20261115…` es de Cristian y ya estaba aplicada en el servidor. Si una
  migración tiene fecha anterior a la última aplicada, `db push` la rechaza:
  usar `npx supabase db push --include-all`.
- **Authentication > URL Configuration:** Site URL `http://localhost:8100` y
  Redirect URLs `http://localhost:8100/auth/callback`,
  `http://localhost:8100/auth/restablecer`, `com.rodapp.hibrido://auth/callback`
  y `com.rodapp.hibrido://auth/restablecer`.
- La tabla `consejos` devuelve 0 filas con la clave pública sin sesión: es su
  RLS (solo usuarios autenticados), no falta de datos.

### 2.3 Consulta RUNT (PlacApi)
- Edge Function `supabase/functions/consulta-runt` **desplegada**. La API key
  de PlacApi va solo como secreto de la función, nunca en el código.
- Secretos: `PLACAPI_MODE` (`mock` | `live`), `PLACAPI_KEY` (`pk_live_…`),
  `PLACAPI_LIMITE_DIARIO` (por defecto 3 por usuario/día), `PLACAPI_BASE_URL`.
- **Probado:** en `mock` (datos ficticios) y en `live` con la placa real del
  usuario: autocompleta marca/modelo/cilindrada y guarda SOAT y RTM con la moto.
- **Créditos:** se usó el crédito gratis del registro. Cada consulta con datos
  cuesta 1 crédito; compra mínima 30 créditos = $10.470 COP (ePayco: tarjeta,
  Nequi o Daviplata). Saldo sin costo: `GET https://placapi.com/api/me` con el
  encabezado `x-api-key`.
- Sin créditos, el modo `live` responde *"La consulta al RUNT no está
  disponible"*. Para desarrollar: `npx supabase secrets set PLACAPI_MODE=mock`.
- Caché de 24 h por usuario y placa en `consultas_runt` (no se borra al
  eliminar la moto, así que repetir la consulta no gasta crédito).

### 2.4 Autenticación
| Función | Estado |
|---|---|
| Registro / login con correo | ✅ |
| Login con **Google** (web) | ✅ Cliente OAuth "Aplicación web" en Google Cloud (proyecto `RodApp`), app en modo **Prueba**: solo entran los correos agregados como *usuarios de prueba* |
| Nombre del registro al perfil | ✅ (migración de Cristian) |
| Recuperar contraseña (`/recuperar` → correo → `/auth/restablecer`) | ⏳ Ver §3 |
| Cuentas suspendidas por un admin | ✅ (panel admin de Diego) |
| Login con Google en Android | ⏳ El deep link `com.rodapp.hibrido://auth` ya está en `AndroidManifest.xml`; falta probar en dispositivo |

Configuración de Google Cloud: origen autorizado `http://localhost:8100` y URI
de redirección `https://smkhwldylnztluitsciz.supabase.co/auth/v1/callback`.

### 2.5 Garaje y motos
- Registrar moto con autocompletado del RUNT y diseño de campos de Cristian
  (etiqueta arriba + caja con borde). Orden: Placa → tarjeta RUNT → resto.
- **Eliminar moto** (nuevo): botón rojo al final de `/app/garaje/detalle/:id`,
  con confirmación. La base borra en cascada SOAT, RTM, documentos, tanqueadas
  y mantenimientos; la app recarga el garaje y reprograma los recordatorios.
  `MotosService.eliminar()` detecta cuando RLS bloquea el borrado (Supabase no
  da error, devuelve 0 filas).
- La placa es única **por usuario**: el mismo usuario no puede repetirla, pero
  otra cuenta sí puede registrarla (caso de venta de la moto).

### 2.6 Figma y mockups
- Archivo `RodApp Híbrido — Mockups`:
  https://www.figma.com/design/qJRAjknoNxqzfxprOmTeJI (7 frames + prototipo).
- `mockups/`: `VISTAS.md` (inventario de ~50 vistas), exportaciones PDF/PNG de
  Figma por flujo (inicio de sesión, registro de moto y documentos, combustible
  y tareas) e `informe/`.
- `docs/capturas/`: capturas web y Android usadas en el README de la entrega.

---

## 3. Lo que está PENDIENTE

### 3.1 Abierto
1. **Recuperar contraseña: probar de punta a punta tras el arreglo.** El
   2026-11-16 el enlace del correo terminó en `/auth/callback` y de ahí en
   `/login` con *"Ocurrió un error inesperado"*. Arreglos aplicados:
   - `AuthService.init()` se suscribe a `onAuthStateChange` **antes** de leer
     la sesión, para no perder el evento `PASSWORD_RECOVERY` que el SDK emite
     al canjear el `?code=` en el arranque. Nueva señal `enRecuperacion`.
   - `/auth/callback` lee errores también del *hash*, registra el error en la
     consola y, si es una recuperación, lleva a `/auth/restablecer`.
   - `mensajeErrorAuth` traduce enlace vencido o usado y "abre el enlace en el
     mismo navegador" (PKCE), y registra en la consola los errores sin traducción.
   Si vuelve a fallar: copiar el error de la consola (F12) y *Supabase > Logs > Auth*.
2. **PlacApi:** decidir si se compran créditos o se deja `PLACAPI_MODE=mock`.

### 3.2 Para más adelante
- **Android:** la carpeta `android/` ya existe (Cristian). Falta probar en
  dispositivo el login con Google y el enlace de recuperar contraseña.
- **iOS:** no generado (`npx cap add ios`, requiere macOS).
- **Producción web:** al publicar, agregar su URL en Supabase (Site URL y
  Redirect URLs) y en Google Cloud; activar la confirmación de correo y
  publicar la app de Google (salir del modo Prueba).
- **MCP de Supabase:** `.mcp.json` se queda local. El intento de 2026-10-12
  falló por un bug de OAuth con query string en la URL; la alternativa es un
  Personal Access Token en una variable de entorno (`SUPABASE_ACCESS_TOKEN`)
  referenciada desde el archivo.
- **Vistas por construir:** ver `mockups/VISTAS.md`.

---

## 4. Cómo retomar

1. Abrir el proyecto en VS Code y verificar la rama: `git branch` → **`Oscar`**.
2. Traer cambios: `git pull`. Si alguien trabajó en otra rama:
   `git fetch origin` y `git merge origin/<rama>`.
3. `npm install` (por si llegaron dependencias nuevas).
4. `npm start` en una terminal dedicada → `http://localhost:8100`.
5. Si cambió algo en `supabase/migrations/`: `npx supabase db push --dry-run`
   y luego `npm run db:push` (o `--include-all` si la CLI lo pide).
6. Si la app dice *"Sin conexión con el servidor"*, revisar primero que el
   proyecto siga vivo:
   `curl -i https://smkhwldylnztluitsciz.supabase.co/auth/v1/health`.

## 5. Estructura del código

```
src/app/
├── core/            # servicios singleton (supabase, auth, motos, garaje-datos, runt,
│                    # recordatorios, notification, theme, admin), guards, models
├── shared/          # app-icons, utils (validators, auth-error, garaje)
└── features/
    ├── auth/        # login · register · callback · sso · forgot/reset password
    ├── admin/       # panel de usuarios
    └── shell/       # tabs + inicio · garaje · mapa · historial · perfil y formularios
supabase/            # config.toml, migrations/, functions/consulta-runt
android/             # proyecto nativo Capacitor (Cristian)
mockups/             # VISTAS.md + exportaciones de Figma
docs/capturas/       # capturas para el README de la entrega
```
