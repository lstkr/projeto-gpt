-- Projeto GPT — estoque compartilhado com contas individuais.
-- Este arquivo configura o esquema para um projeto Supabase NOVO.
-- Não inclua senhas reais neste arquivo; crie os usuários separadamente com hashes bcrypt.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

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

create table if not exists private.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(btrim(username))),
  password_hash text not null,
  role text not null check (role in ('admin', 'employee')),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.app_users enable row level security;
revoke all on private.app_users from public, anon, authenticated;
drop policy if exists "Deny direct access to app users" on private.app_users;
create policy "Deny direct access to app users" on private.app_users
  for all to anon, authenticated using (false) with check (false);

create table if not exists private.app_sessions (
  token_hash text primary key,
  user_id uuid not null references private.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists app_sessions_user_id_idx on private.app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on private.app_sessions(expires_at);
alter table private.app_sessions enable row level security;
revoke all on private.app_sessions from public, anon, authenticated;
drop policy if exists "Deny direct access to app sessions" on private.app_sessions;
create policy "Deny direct access to app sessions" on private.app_sessions
  for all to anon, authenticated using (false) with check (false);

create table if not exists private.app_login_attempts (
  username text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists app_login_attempts_username_time_idx
  on private.app_login_attempts(username, attempted_at desc);
alter table private.app_login_attempts enable row level security;
revoke all on private.app_login_attempts from public, anon, authenticated;
drop policy if exists "Deny direct access to login attempts" on private.app_login_attempts;
create policy "Deny direct access to login attempts" on private.app_login_attempts
  for all to anon, authenticated using (false) with check (false);

create or replace function private.inventory_login_impl(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  normalized_username text := lower(btrim(coalesce(p_username, '')));
  user_row private.app_users%rowtype;
  attempt_count integer := 0;
  session_token text;
  expiry timestamptz := now() + interval '12 hours';
begin
  if normalized_username = '' or coalesce(p_password, '') = '' or length(p_password) > 128 then
    return jsonb_build_object('ok', false, 'message', 'Login ou senha inválidos.');
  end if;
  delete from private.app_login_attempts where attempted_at < now() - interval '1 hour';
  select count(*) into attempt_count from private.app_login_attempts
    where username = normalized_username and attempted_at > now() - interval '15 minutes';
  if attempt_count >= 8 then
    return jsonb_build_object('ok', false, 'message', 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  end if;
  select * into user_row from private.app_users
    where username = normalized_username and active = true;
  if not found or user_row.password_hash <> extensions.crypt(p_password, user_row.password_hash) then
    insert into private.app_login_attempts(username) values (normalized_username);
    return jsonb_build_object('ok', false, 'message', 'Login ou senha inválidos.');
  end if;
  delete from private.app_login_attempts where username = normalized_username;
  session_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.app_sessions(token_hash, user_id, expires_at)
    values (encode(extensions.digest(session_token, 'sha256'), 'hex'), user_row.id, expiry);
  return jsonb_build_object('ok', true, 'session_token', session_token, 'expires_at', expiry,
    'username', user_row.username, 'display_name', user_row.display_name, 'role', user_row.role);
end;
$function$;

create or replace function private.inventory_get_impl(p_session_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  current_state jsonb;
  user_row private.app_users%rowtype;
begin
  select u.* into user_row from private.app_sessions s
    join private.app_users u on u.id = s.user_id
    where s.token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and s.expires_at > now() and s.revoked_at is null and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;
  select state into current_state from public.shared_inventory where id = true;
  return coalesce(current_state, '{"products":[],"movements":[],"documents":[]}'::jsonb)
    || jsonb_build_object('user', jsonb_build_object(
      'username', user_row.username, 'display_name', user_row.display_name, 'role', user_row.role
    ));
end;
$function$;

create or replace function private.inventory_save_impl(p_session_token text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  saved_at timestamptz := now();
  user_row private.app_users%rowtype;
begin
  select u.* into user_row from private.app_sessions s
    join private.app_users u on u.id = s.user_id
    where s.token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and s.expires_at > now() and s.revoked_at is null and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state->'products') <> 'array'
    or jsonb_typeof(p_state->'movements') <> 'array'
    or jsonb_typeof(p_state->'documents') <> 'array' then
    raise exception using errcode = '22023', message = 'Formato de estoque inválido';
  end if;
  if octet_length(p_state::text) > 1500000 then
    raise exception using errcode = '22001', message = 'O conteúdo do estoque ultrapassa o limite permitido';
  end if;
  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;
  return jsonb_build_object('ok', true, 'updated_at', saved_at, 'role', user_row.role);
end;
$function$;

create or replace function private.inventory_logout_impl(p_session_token text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  update private.app_sessions set revoked_at = now()
    where token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and revoked_at is null;
  return true;
end;
$function$;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
revoke all on function private.inventory_login_impl(text, text) from public;
revoke all on function private.inventory_get_impl(text) from public;
revoke all on function private.inventory_save_impl(text, jsonb) from public;
revoke all on function private.inventory_logout_impl(text) from public;
grant execute on function private.inventory_login_impl(text, text) to anon, authenticated;
grant execute on function private.inventory_get_impl(text) to anon, authenticated;
grant execute on function private.inventory_save_impl(text, jsonb) to anon, authenticated;
grant execute on function private.inventory_logout_impl(text) to anon, authenticated;

create function public.inventory_login(p_username text, p_password text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.inventory_login_impl(p_username, p_password); $function$;
create function public.inventory_get(p_session_token text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.inventory_get_impl(p_session_token); $function$;
create function public.inventory_save(p_session_token text, p_state jsonb)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.inventory_save_impl(p_session_token, p_state); $function$;
create function public.inventory_logout(p_session_token text)
returns boolean language sql security invoker set search_path = ''
as $function$ select private.inventory_logout_impl(p_session_token); $function$;

revoke all on function public.inventory_login(text, text) from public;
revoke all on function public.inventory_get(text) from public;
revoke all on function public.inventory_save(text, jsonb) from public;
revoke all on function public.inventory_logout(text) from public;
grant execute on function public.inventory_login(text, text) to anon, authenticated;
grant execute on function public.inventory_get(text) to anon, authenticated;
grant execute on function public.inventory_save(text, jsonb) to anon, authenticated;
grant execute on function public.inventory_logout(text) to anon, authenticated;

-- After installing this schema, provision users separately. Store only bcrypt hashes
-- generated for each password; do not commit plaintext credentials to this repository.
