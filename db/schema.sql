-- Projeto GPT — estoque compartilhado da cafeteria.
-- Aplica este arquivo apenas em um projeto Supabase novo.
-- O código de acesso nunca deve ficar no repositório; ele é guardado como hash em private.app_access.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists private.app_access (
  id boolean primary key default true check (id),
  code_hash text not null,
  updated_at timestamptz not null default now()
);
alter table private.app_access enable row level security;
revoke all on private.app_access from public, anon, authenticated;
drop policy if exists "Deny direct access to app access codes" on private.app_access;
create policy "Deny direct access to app access codes"
  on private.app_access for all to anon, authenticated
  using (false) with check (false);

create table if not exists public.shared_inventory (
  id boolean primary key default true check (id),
  state jsonb not null default '{"products":[],"movements":[],"documents":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shared_inventory enable row level security;
revoke all on public.shared_inventory from public, anon, authenticated;
drop policy if exists "Deny direct access to shared inventory" on public.shared_inventory;
create policy "Deny direct access to shared inventory"
  on public.shared_inventory for all to anon, authenticated
  using (false) with check (false);

insert into public.shared_inventory (id, state)
values (true, '{"products":[],"movements":[],"documents":[]}'::jsonb)
on conflict (id) do nothing;

create or replace function private.inventory_get_impl(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_state jsonb;
begin
  if not exists (
    select 1 from private.app_access a
    where a.id = true
      and a.code_hash = encode(extensions.digest(coalesce(p_access_code, ''), 'sha256'), 'hex')
  ) then
    raise exception using errcode = '28000', message = 'Código de acesso inválido';
  end if;
  select s.state into current_state from public.shared_inventory s where s.id = true;
  return coalesce(current_state, '{"products":[],"movements":[],"documents":[]}'::jsonb);
end;
$function$;

create or replace function private.inventory_save_impl(p_access_code text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  saved_at timestamptz := now();
begin
  if not exists (
    select 1 from private.app_access a
    where a.id = true
      and a.code_hash = encode(extensions.digest(coalesce(p_access_code, ''), 'sha256'), 'hex')
  ) then
    raise exception using errcode = '28000', message = 'Código de acesso inválido';
  end if;
  if p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state->'products') <> 'array'
    or jsonb_typeof(p_state->'movements') <> 'array'
    or jsonb_typeof(p_state->'documents') <> 'array'
  then
    raise exception using errcode = '22023', message = 'Formato de estoque inválido';
  end if;
  if octet_length(p_state::text) > 1500000 then
    raise exception using errcode = '22001', message = 'O conteúdo do estoque ultrapassa o limite permitido';
  end if;
  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;
  return jsonb_build_object('ok', true, 'updated_at', saved_at);
end;
$function$;

-- The public RPCs are SECURITY INVOKER. Their implementation helpers are kept
-- in the non-exposed private schema and validate the shared code on every call.
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
revoke all on function private.inventory_get_impl(text) from public;
revoke all on function private.inventory_save_impl(text, jsonb) from public;
grant execute on function private.inventory_get_impl(text) to anon, authenticated;
grant execute on function private.inventory_save_impl(text, jsonb) to anon, authenticated;

create or replace function public.inventory_get(p_access_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.inventory_get_impl(p_access_code);
$function$;

create or replace function public.inventory_save(p_access_code text, p_state jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.inventory_save_impl(p_access_code, p_state);
$function$;

revoke all on function public.inventory_get(text) from public;
revoke all on function public.inventory_save(text, jsonb) from public;
grant execute on function public.inventory_get(text) to anon, authenticated;
grant execute on function public.inventory_save(text, jsonb) to anon, authenticated;

-- After applying this schema, insert one row with a separately generated code hash:
-- insert into private.app_access (id, code_hash)
-- values (true, encode(extensions.digest('REPLACE_WITH_A_LONG_RANDOM_SHARED_CODE', 'sha256'), 'hex'));
-- Keep the plaintext code out of SQL files committed to Git.
