-- ============================================================================
-- Consultas al RUNT (via PlacApi) hechas por la Edge Function `consulta-runt`.
--
-- Cumple dos funciones:
--   1. Cache: si el mismo usuario consulta la misma placa dentro de 24 h, la
--      funcion devuelve el `resumen` guardado y no gasta otro credito.
--   2. Tope de gasto: la funcion cuenta las consultas reales (fuente =
--      'placapi') del usuario en las ultimas 24 h y corta al llegar al limite.
--
-- Privacidad: NO se guarda el numero de documento del propietario, solo el
-- resumen ya recortado que la app necesita (vehiculo + SOAT + RTM).
-- ============================================================================

create table public.consultas_runt (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  placa text not null,
  -- 'placapi' = consulta real (gasta credito) | 'mock' = datos ficticios de desarrollo
  fuente text not null check (fuente in ('placapi', 'mock')),
  resumen jsonb not null,
  consultado_at timestamptz not null default now()
);

create index consultas_runt_user_placa_idx
  on public.consultas_runt (user_id, placa, consultado_at desc);

alter table public.consultas_runt enable row level security;

-- La funcion escribe y lee con el JWT del usuario, asi que RLS aplica normal.
-- No hay politica de update/delete: el historial no se edita desde la app.
create policy "consultas_runt: leer propias" on public.consultas_runt
  for select using (auth.uid() = user_id);

create policy "consultas_runt: insertar propias" on public.consultas_runt
  for insert with check (auth.uid() = user_id);
