-- La placa pasa de ser unica en toda la base (`motos_placa_key`) a ser unica
-- por usuario. Con la regla global, quien compra una moto usada no podia
-- registrarla mientras el dueno anterior no la borrara de su cuenta.
-- Un mismo usuario sigue sin poder repetir una placa.
--
-- Idempotente: no falla si la restriccion vieja ya no existe o la nueva ya
-- esta creada. No hay datos que limpiar: con la regla global no pueden
-- existir dos motos del mismo usuario con la misma placa.

alter table public.motos drop constraint if exists motos_placa_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'motos_user_id_placa_key'
  ) then
    alter table public.motos
      add constraint motos_user_id_placa_key unique (user_id, placa);
  end if;
end $$;
