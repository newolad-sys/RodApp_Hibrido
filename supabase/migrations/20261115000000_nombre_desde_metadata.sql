create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
        nombre_meta text := nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'nombre',
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name'
    )), '');
begin
    insert into public.users (id, name, lastname, correo)
    values (
        new.id,
        coalesce(nombre_meta, split_part(new.email, '@', 1)),
        nullif(trim(new.raw_user_meta_data ->> 'apellido'), ''),
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;