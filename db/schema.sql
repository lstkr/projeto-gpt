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
  output_state jsonb;
  user_row private.app_users%rowtype;
  visible_products jsonb;
begin
  select u.* into user_row from private.app_sessions s
    join private.app_users u on u.id = s.user_id
    where s.token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and s.expires_at > now() and s.revoked_at is null and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;

  select state into current_state from public.shared_inventory where id = true;
  current_state := coalesce(current_state, '{"products":[],"movements":[],"documents":[]}'::jsonb);

  if user_row.role = 'admin' then
    visible_products := coalesce(current_state->'products', '[]'::jsonb);
  else
    select coalesce(jsonb_agg(product - 'cost' order by ord), '[]'::jsonb)
      into visible_products
      from jsonb_array_elements(coalesce(current_state->'products', '[]'::jsonb))
        with ordinality as items(product, ord);
  end if;

  output_state := current_state || jsonb_build_object(
    'products', visible_products,
    'user', jsonb_build_object('username', user_row.username, 'display_name', user_row.display_name, 'role', user_row.role)
  );
  return output_state;
end;
$function$;

CREATE OR REPLACE FUNCTION private.inventory_save_impl(p_session_token text, p_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved_at timestamptz := now();
  user_row private.app_users%rowtype;
  existing_state jsonb;
  secured_products jsonb;
  retained_products jsonb;
  cleaned_documents jsonb;
  retained_documents jsonb;
  cleaned_movements jsonb;
  retained_movements jsonb;
  deleted_ids jsonb;
  current_revision bigint;
  incoming_revision bigint;
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
  select state into existing_state from public.shared_inventory where id = true for update;
  existing_state := coalesce(existing_state, '{"products":[],"movements":[],"documents":[]}'::jsonb);
  current_revision := coalesce((existing_state->>'revision')::bigint, 0);
  if not (p_state ? 'revision') then
    raise exception using errcode = '40001', message = 'Sua versão do Estoque+ está desatualizada. Atualize a página e entre novamente.';
  end if;
  begin
    incoming_revision := (p_state->>'revision')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Versão de sincronização inválida.';
  end;
  if incoming_revision <> current_revision then
    raise exception using errcode = '40001', message = 'O estoque foi alterado em outra sessão. Atualize a página antes de salvar novamente.';
  end if;

  if user_row.role <> 'admin' then
    -- Staff can adjust quantities and use invoice entry, but cannot modify existing catalog metadata.
    select coalesce(jsonb_agg(
      case
        when exists (
          select 1 from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product
          where old_product->>'id' = incoming.product->>'id'
        ) then
          (incoming.product - 'cost' - 'min' - 'name' - 'sku' - 'category' - 'unit') ||
          jsonb_build_object(
            'name', (select old_product->'name' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'sku', (select old_product->'sku' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'category', (select old_product->'category' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'unit', (select old_product->'unit' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'cost', coalesce((select old_product->'cost' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1), '0'::jsonb),
            'min', coalesce((select old_product->'min' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1), '0'::jsonb)
          )
        else (incoming.product - 'cost' - 'min') || jsonb_build_object('cost', 0, 'min', 0)
      end order by incoming.ord
    ), '[]'::jsonb)
    into secured_products
    from jsonb_array_elements(p_state->'products') with ordinality incoming(product, ord);

    -- Do not allow an employee snapshot to delete products by omitting them.
    select coalesce(jsonb_agg(old_product.product order by old_product.ord), '[]'::jsonb)
      into retained_products
      from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb))
        with ordinality old_product(product, ord)
     where not exists (
       select 1 from jsonb_array_elements(p_state->'products') submitted(product)
       where submitted.product->>'id' = old_product.product->>'id'
     );
    secured_products := secured_products || retained_products;
    p_state := jsonb_set(p_state, '{products}', secured_products, true);
  end if;


  -- Documents and historical movements are immutable through the generic snapshot
  -- RPC. Only inventory_delete_document removes one, with role check and stock rollback.
  deleted_ids := coalesce(existing_state->'deletedDocumentIds', '[]'::jsonb);
  if jsonb_typeof(deleted_ids) <> 'array' then deleted_ids := '[]'::jsonb; end if;

  select coalesce(jsonb_agg(
      coalesce((
        select old.doc
          from jsonb_array_elements(coalesce(existing_state->'documents', '[]'::jsonb)) old(doc)
         where old.doc->>'id' = incoming.doc->>'id' limit 1
      ), incoming.doc) order by incoming.ord
    ), '[]'::jsonb)
    into cleaned_documents
    from jsonb_array_elements(p_state->'documents') with ordinality incoming(doc,ord)
   where not exists (
     select 1 from jsonb_array_elements_text(deleted_ids) tomb(id)
      where tomb.id = incoming.doc->>'id'
   );

  select coalesce(jsonb_agg(old.doc order by old.ord), '[]'::jsonb)
    into retained_documents
    from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) with ordinality old(doc,ord)
   where not exists (
     select 1 from jsonb_array_elements(cleaned_documents) input(doc)
      where input.doc->>'id' = old.doc->>'id'
   );
  p_state := jsonb_set(p_state, '{documents}', cleaned_documents || retained_documents, true);

  select coalesce(jsonb_agg(
      coalesce((
        select old.move
          from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) old(move)
         where old.move->>'id' = incoming.move->>'id' limit 1
      ), incoming.move) order by incoming.ord
    ), '[]'::jsonb)
    into cleaned_movements
    from jsonb_array_elements(p_state->'movements') with ordinality incoming(move,ord)
   where not exists (
     select 1 from jsonb_array_elements_text(deleted_ids) tomb(id)
      where tomb.id = incoming.move->>'documentId'
   );
  select coalesce(jsonb_agg(old.move order by old.ord), '[]'::jsonb)
    into retained_movements
    from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) with ordinality old(move,ord)
   where not exists (
     select 1 from jsonb_array_elements(cleaned_movements) input(move)
      where input.move->>'id' = old.move->>'id'
   );
  p_state := jsonb_set(p_state, '{movements}', cleaned_movements || retained_movements, true);

  p_state := p_state || jsonb_build_object(
    'deletedDocumentIds', deleted_ids,
    'catalogMerges', coalesce(existing_state->'catalogMerges','[]'::jsonb),
    'stockCounts', coalesce(existing_state->'stockCounts','[]'::jsonb),
    'countSettings', coalesce(existing_state->'countSettings','{"enabled":false,"mode":"interval","intervalDays":7,"weekday":1,"monthDay":1}'::jsonb),
    'revision', current_revision + 1
  );
  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;
  return jsonb_build_object('ok', true, 'updated_at', saved_at, 'role', user_row.role, 'revision', current_revision + 1);
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

-- Gestor-only deletion of registered fiscal documents, with atomic inventory reversal.
-- Always preserve private.app_users credentials; never delete users to reset inventory.
CREATE OR REPLACE FUNCTION private.inventory_delete_document_impl(p_session_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_role text;
  inventory_state jsonb;
  deleted_document jsonb;
  links jsonb;
  entry jsonb;
  item_product_id text;
  item_quantity numeric;
  available numeric;
  changed_products jsonb;
  kept_documents jsonb;
  kept_movements jsonb;
  deleted_ids jsonb;
  new_revision bigint;
begin
  select u.role into actor_role from private.app_sessions s
    join private.app_users u on u.id = s.user_id
   where s.token_hash = encode(extensions.digest(coalesce(p_session_token,''), 'sha256'),'hex')
     and s.expires_at > now() and s.revoked_at is null and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Faça login novamente.';
  end if;
  if actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Somente o Gestor pode excluir notas fiscais já lançadas.';
  end if;
  if coalesce(length(p_document_id), 0) < 1 or length(p_document_id) > 128 then
    raise exception using errcode = '22023', message = 'Identificador da nota fiscal inválido.';
  end if;

  select state into inventory_state from public.shared_inventory where id = true for update;
  if not found then
    raise exception using errcode = '22023', message = 'Estado do estoque não encontrado.';
  end if;
  select doc.value into deleted_document
    from jsonb_array_elements(coalesce(inventory_state->'documents', '[]'::jsonb)) doc(value)
   where doc.value->>'id' = p_document_id limit 1;
  if not found then
    raise exception using errcode = '22023', message = 'Documento não encontrado. Atualize o estoque e tente novamente.';
  end if;
  links := deleted_document->'stockEntries';
  if jsonb_typeof(links) <> 'array' or jsonb_array_length(links) = 0 then
    raise exception using errcode = '22023', message = 'Nota antiga sem vínculos de entrada no estoque. Não é seguro estornar suas quantidades automaticamente.';
  end if;

  changed_products := coalesce(inventory_state->'products', '[]'::jsonb);
  for entry in select value from jsonb_array_elements(links) as link(value) loop
    item_product_id := entry->>'productId';
    begin
      item_quantity := (entry->>'quantity')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'Quantidade inválida em uma entrada da nota.';
    end;
    if coalesce(item_product_id, '') = '' or item_quantity is null or item_quantity <= 0 then
      raise exception using errcode = '22023', message = 'Nota com vínculo de estoque incompleto; exclusão cancelada.';
    end if;
    select (product.value->>'stock')::numeric into available
      from jsonb_array_elements(changed_products) product(value)
     where product.value->>'id' = item_product_id limit 1;
    if not found then
      raise exception using errcode = '22023', message = 'Um produto associado à nota não existe mais. Exclusão cancelada.';
    end if;
    if available < item_quantity then
      raise exception using errcode = '22023', message = 'Não há saldo suficiente para desfazer esta nota sem deixar estoque negativo. Ajuste o estoque antes de excluir.';
    end if;
    select coalesce(jsonb_agg(
      case when product.value->>'id' = item_product_id
        then jsonb_set(product.value, '{stock}', to_jsonb(round(((product.value->>'stock')::numeric - item_quantity), 3)), true)
        else product.value end order by product.ord), '[]'::jsonb)
      into changed_products
      from jsonb_array_elements(changed_products) with ordinality product(value,ord);
  end loop;

  select coalesce(jsonb_agg(doc.value order by doc.ord), '[]'::jsonb)
    into kept_documents
    from jsonb_array_elements(coalesce(inventory_state->'documents','[]'::jsonb)) with ordinality doc(value,ord)
   where doc.value->>'id' is distinct from p_document_id;

  select coalesce(jsonb_agg(move.value order by move.ord), '[]'::jsonb)
    into kept_movements
    from jsonb_array_elements(coalesce(inventory_state->'movements','[]'::jsonb)) with ordinality move(value,ord)
   where move.value->>'documentId' is distinct from p_document_id
     and not exists (
       select 1 from jsonb_array_elements(links) item(value)
        where item.value->>'movementId' = move.value->>'id'
     );

  deleted_ids := coalesce(inventory_state->'deletedDocumentIds','[]'::jsonb) || jsonb_build_array(p_document_id);
  new_revision := coalesce((inventory_state->>'revision')::bigint, 0) + 1;
  update public.shared_inventory
     set state = inventory_state || jsonb_build_object(
       'products', changed_products,
       'documents', kept_documents,
       'movements', kept_movements,
       'deletedDocumentIds', deleted_ids,
       'revision', new_revision
     ),
     updated_at = now()
   where id = true;

  return jsonb_build_object('ok', true, 'deleted_id', p_document_id, 'revision', new_revision);
end;
$function$;
revoke all on function private.inventory_delete_document_impl(text, text) from public;
grant execute on function private.inventory_delete_document_impl(text, text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventory_delete_document(p_session_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.inventory_delete_document_impl(p_session_token, p_document_id); $function$;
revoke all on function public.inventory_delete_document(text, text) from public;
grant execute on function public.inventory_delete_document(text, text) to anon, authenticated;

-- Periodic stock counting: only Gestor can set the cadence; staff and Gestor can complete counts.
-- Full-count completion adjusts quantities atomically and saves the audit trail.
CREATE OR REPLACE FUNCTION private.inventory_due_date(p_state jsonb)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare cfg jsonb:=p_state->'countSettings'; a date; d int; t date;
begin
 if cfg->>'enabled'<>'true' then return null; end if;
 select max((x->>'completedAt')::timestamptz::date) into a from jsonb_array_elements(coalesce(p_state->'stockCounts','[]'::jsonb)) x;
 a:=coalesce(a,(cfg->>'configuredAt')::date,current_date);
 if cfg->>'mode'='weekly' then
  return a+(((cfg->>'weekday')::int-extract(isodow from a)::int+6)%7)+1;
 end if;
 if cfg->>'mode'='monthly' then
  t:=date_trunc('month',a)::date;
  d:=least((cfg->>'monthDay')::int,extract(day from t+interval '1 month - 1 day')::int);
  if t+d-1>a then return t+d-1; end if;
  t:=(t+interval '1 month')::date;
  return t+least((cfg->>'monthDay')::int,extract(day from t+interval '1 month - 1 day')::int)-1;
 end if;
 return a+(cfg->>'intervalDays')::int;
end; $function$;

CREATE OR REPLACE FUNCTION public.inventory_count_settings(p_token text, p_config jsonb, p_rev bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; role_name text; v bigint; cfg jsonb;
begin
 select u.role into role_name from private.app_sessions sess join private.app_users u on u.id=sess.user_id where sess.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and sess.expires_at>now() and sess.revoked_at is null and u.active;
 if role_name is distinct from 'admin' then raise exception 'Somente o Gestor pode definir contagens.' using errcode='42501'; end if;
 if p_config->>'mode' not in ('interval','weekly','monthly') or (p_config->>'intervalDays')::int not between 1 and 365 or (p_config->>'weekday')::int not between 1 and 7 or (p_config->>'monthDay')::int not between 1 and 31 then raise exception 'Configuração inválida.' using errcode='22023'; end if;
 select state into s from public.shared_inventory where id=true for update;
 v:=coalesce((s->>'revision')::bigint,0);
 if v<>p_rev then raise exception 'Estoque alterado. Recarregue.' using errcode='40001'; end if;
 cfg:=jsonb_build_object('enabled',coalesce((p_config->>'enabled')::boolean,false),'mode',p_config->>'mode','intervalDays',(p_config->>'intervalDays')::int,'weekday',(p_config->>'weekday')::int,'monthDay',(p_config->>'monthDay')::int,'configuredAt',(now() at time zone 'America/Sao_Paulo')::date);
 update public.shared_inventory set state=s||jsonb_build_object('countSettings',cfg,'revision',v+1),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'revision',v+1);
end; $function$;

CREATE OR REPLACE FUNCTION public.inventory_count_complete(p_token text, p_lines jsonb, p_rev bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; u_name text; rev bigint; p jsonb; l jsonb; qty numeric; oldqty numeric; d numeric; rows jsonb:='[]'::jsonb; audits jsonb:='[]'::jsonb; moves jsonb:='[]'::jsonb; cid text:=gen_random_uuid()::text;
begin
 select u.display_name into u_name from private.app_sessions a join private.app_users u on u.id=a.user_id where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and a.expires_at>now() and a.revoked_at is null and u.active;
 if not found then raise exception 'Sessão inválida.' using errcode='28000'; end if;
 if jsonb_typeof(p_lines)<>'array' then raise exception 'Contagem inválida.' using errcode='22023'; end if;
 select state into s from public.shared_inventory where id=true for update;
 rev:=coalesce((s->>'revision')::bigint,0);
 if rev<>p_rev then raise exception 'Estoque mudou. Atualize e reconte antes de concluir.' using errcode='40001'; end if;
 if jsonb_array_length(p_lines)<>jsonb_array_length(s->'products') or jsonb_array_length(p_lines)=0 then raise exception 'Conte todos os produtos cadastrados.' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(s->'products') loop
   if (select count(*) from jsonb_array_elements(p_lines) x where x->>'productId'=p->>'id')<>1 then raise exception 'Há produto ausente ou repetido.' using errcode='22023'; end if;
   select x.value into l from jsonb_array_elements(p_lines) x(value) where x.value->>'productId'=p->>'id';
   qty:=(l->>'counted')::numeric;
   if qty is null or qty<0 or qty>99999999 or qty<>round(qty,3) then raise exception 'Quantidade inválida (máximo 3 casas decimais).' using errcode='22023'; end if;
   oldqty:=(p->>'stock')::numeric; d:=qty-oldqty;
   rows:=rows||jsonb_build_array(jsonb_set(p,'{stock}',to_jsonb(qty),true));
   audits:=audits||jsonb_build_array(jsonb_build_object('productId',p->>'id','name',p->>'name','unit',p->>'unit','expected',oldqty,'counted',qty,'difference',d));
   if d<>0 then
    moves:=moves||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'countId',cid,'productId',p->>'id','product',p->>'name','type',case when d>0 then 'Entrada' else 'Saída' end,'quantity',abs(d),'reason','Ajuste por contagem física','date',to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'by',u_name));
   end if;
 end loop;
 update public.shared_inventory set state=s||jsonb_build_object('products',rows,'movements',moves||coalesce(s->'movements','[]'::jsonb),'stockCounts',jsonb_build_array(jsonb_build_object('id',cid,'completedAt',now(),'by',u_name,'items',audits))||coalesce(s->'stockCounts','[]'::jsonb),'revision',rev+1),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'revision',rev+1,'adjustments',jsonb_array_length(moves));
end; $function$;

revoke all on function public.inventory_count_settings(text,jsonb,bigint) from public;
grant execute on function public.inventory_count_settings(text,jsonb,bigint) to anon, authenticated;
revoke all on function public.inventory_count_complete(text,jsonb,bigint) from public;
grant execute on function public.inventory_count_complete(text,jsonb,bigint) to anon, authenticated;


-- Explicit, reversible-in-audit consolidation: only the Gestor can choose
-- a canonical catalog record. All existing fiscal links are atomically repointed,
-- so document deletion continues to reverse the correct stock.
CREATE OR REPLACE FUNCTION public.inventory_merge_products(
  p_token text, p_keep_id text, p_remove_id text, p_rev bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  actor_role text;
  actor_name text;
  s jsonb;
  keep_item jsonb;
  discard_item jsonb;
  p jsonb;
  d jsonb;
  m jsonb;
  e jsonb;
  new_products jsonb := '[]'::jsonb;
  new_documents jsonb := '[]'::jsonb;
  new_movements jsonb := '[]'::jsonb;
  new_links jsonb;
  new_items jsonb;
  codes jsonb;
  alternate_codes jsonb;
  keep_count integer := 0;
  discard_count integer := 0;
  rev bigint;
  amount_keep numeric;
  amount_discard numeric;
  stock_total numeric;
  weighted_cost numeric;
  keep_unit text;
  discard_unit text;
begin
  select u.role, u.display_name into actor_role, actor_name
    from private.app_sessions sess join private.app_users u on sess.user_id = u.id
   where sess.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and sess.expires_at > now() and sess.revoked_at is null and u.active = true;
  if actor_role is distinct from 'admin' then
    raise exception 'Apenas o Gestor pode consolidar cadastros.' using errcode = '42501';
  end if;
  if coalesce(length(p_keep_id),0) < 1 or coalesce(length(p_remove_id),0) < 1
    or length(p_keep_id)>128 or length(p_remove_id)>128 or p_keep_id=p_remove_id then
    raise exception 'Selecione dois produtos diferentes.' using errcode = '22023';
  end if;

  select state into s from public.shared_inventory where id=true for update;
  rev := coalesce((s->>'revision')::bigint,0);
  if p_rev is distinct from rev then
    raise exception 'O estoque mudou em outra sessão. Atualize antes de consolidar.' using errcode='40001';
  end if;
  for p in select value from jsonb_array_elements(coalesce(s->'products','[]'::jsonb)) loop
    if p->>'id'=p_keep_id then keep_item:=p; keep_count:=keep_count+1; end if;
    if p->>'id'=p_remove_id then discard_item:=p; discard_count:=discard_count+1; end if;
  end loop;
  if keep_count<>1 or discard_count<>1 then
    raise exception 'Produto não encontrado ou cadastro repetido no banco.' using errcode='22023';
  end if;
  keep_unit := lower(trim(coalesce(keep_item->>'unit','un')));
  discard_unit := lower(trim(coalesce(discard_item->>'unit','un')));
  keep_unit := case keep_unit when 'in' then 'un' when 'und' then 'un'
    when 'unidade' then 'un' when 'lt' then 'l' when 'litro' then 'l'
    when 'kgs' then 'kg' when 'gr' then 'g' else keep_unit end;
  discard_unit := case discard_unit when 'in' then 'un' when 'und' then 'un'
    when 'unidade' then 'un' when 'lt' then 'l' when 'litro' then 'l'
    when 'kgs' then 'kg' when 'gr' then 'g' else discard_unit end;
  if keep_unit<>discard_unit then
    raise exception 'Unidades diferentes. Confira e converta a quantidade antes de consolidar.' using errcode='22023';
  end if;

  amount_keep := (keep_item->>'stock')::numeric;
  amount_discard := (discard_item->>'stock')::numeric;
  if amount_keep is null or amount_discard is null or
    amount_keep<0 or amount_discard<0 or amount_keep>99999999 or amount_discard>99999999
    or amount_keep<>round(amount_keep,3) or amount_discard<>round(amount_discard,3) then
    raise exception 'Quantidades inconsistentes. Faça a contagem física primeiro.' using errcode='22023';
  end if;
  stock_total := amount_keep + amount_discard;
  if stock_total>99999999 then
    raise exception 'Quantidade final excede o limite.' using errcode='22023';
  end if;
  weighted_cost := case when stock_total>0 then
    round((amount_keep*coalesce((keep_item->>'cost')::numeric,0) +
      amount_discard*coalesce((discard_item->>'cost')::numeric,0))/stock_total,4)
    else coalesce((keep_item->>'cost')::numeric,0) end;

  select coalesce(jsonb_agg(alias), '[]'::jsonb) into codes from (
    select distinct value as alias from jsonb_array_elements(
      coalesce(keep_item->'supplierCodes','[]'::jsonb) ||
      coalesce(discard_item->'supplierCodes','[]'::jsonb)
    ) a(value)
  ) distinct_aliases;
  select coalesce(jsonb_agg(to_jsonb(sku)), '[]'::jsonb) into alternate_codes from (
    select distinct sku from (
      select value as sku from jsonb_array_elements_text(coalesce(keep_item->'alternateSkus','[]'::jsonb))
      union all
      select value as sku from jsonb_array_elements_text(coalesce(discard_item->'alternateSkus','[]'::jsonb))
      union all
      select coalesce(discard_item->>'sku','') as sku
    ) all_skus where btrim(sku) <> '' and sku <> coalesce(keep_item->>'sku','')
  ) distinct_skus;

  for p in select value from jsonb_array_elements(s->'products') loop
    if p->>'id' = p_remove_id then continue; end if;
    if p->>'id' = p_keep_id then
      p := p || jsonb_build_object(
        'stock', round(stock_total,3),
        'unit', case when keep_unit='un' then 'un' else keep_item->>'unit' end,
        'cost', weighted_cost,
        'min', greatest(coalesce((keep_item->>'min')::numeric,0), coalesce((discard_item->>'min')::numeric,0)),
        'supplierCodes', codes,
        'alternateSkus', alternate_codes
      );
    end if;
    new_products := new_products || jsonb_build_array(p);
  end loop;

  -- Preserve original fiscal line name/code, financial amounts and entry IDs.
  -- Only point stock-backed references to the survivor.
  for d in select value from jsonb_array_elements(coalesce(s->'documents','[]'::jsonb)) loop
    if jsonb_typeof(d->'stockEntries')='array' then
      new_links := '[]'::jsonb;
      for e in select value from jsonb_array_elements(d->'stockEntries') loop
        if e->>'productId' = p_remove_id then
          e := jsonb_set(e,'{productId}', to_jsonb(p_keep_id),true);
        end if;
        new_links := new_links || jsonb_build_array(e);
      end loop;
      d := jsonb_set(d,'{stockEntries}',new_links,true);
    end if;
    if jsonb_typeof(d->'items')='array' then
      new_items := '[]'::jsonb;
      for e in select value from jsonb_array_elements(d->'items') loop
        if e->>'productId' = p_remove_id then
          e := jsonb_set(e,'{productId}',to_jsonb(p_keep_id),true);
        end if;
        new_items := new_items || jsonb_build_array(e);
      end loop;
      d := jsonb_set(d,'{items}',new_items,true);
    end if;
    new_documents := new_documents || jsonb_build_array(d);
  end loop;

  for m in select value from jsonb_array_elements(coalesce(s->'movements','[]'::jsonb)) loop
    if m->>'productId' = p_remove_id then
      m := jsonb_set(m,'{productId}',to_jsonb(p_keep_id),true);
    end if;
    new_movements := new_movements || jsonb_build_array(m);
  end loop;

  update public.shared_inventory set
    state = s || jsonb_build_object(
      'products', new_products,
      'documents', new_documents,
      'movements', new_movements,
      'catalogMerges', jsonb_build_array(jsonb_build_object(
        'keepId',p_keep_id,
        'removedId',p_remove_id,
        'keptName',keep_item->>'name',
        'removedName',discard_item->>'name',
        'keepPreviousStock',amount_keep,
        'removedPreviousStock',amount_discard,
        'newStock',stock_total,
        'unit',keep_item->>'unit',
        'at',now(),
        'by',actor_name
      )) || coalesce(s->'catalogMerges','[]'::jsonb),
      'revision',rev+1
    ), updated_at=now()
  where id=true;
  return jsonb_build_object('ok',true,'revision',rev+1,'kept_id',p_keep_id,
    'removed_id',p_remove_id,'stock',stock_total);
end;
$function$;
revoke all on function public.inventory_merge_products(text,text,text,bigint) from public;
grant execute on function public.inventory_merge_products(text,text,text,bigint) to anon, authenticated;
