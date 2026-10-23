-- Server-derived authorship for newly committed fiscal documents.
-- Apply only after the tenant-access and fiscal-write-integrity migrations.
-- This migration preserves legacy JSON documents and never changes app users.
begin;

do $preflight$
begin
  if to_regprocedure('private.inventory_save_impl(text,jsonb)') is null
     or to_regprocedure('private.require_actor(text,boolean)') is null
     or to_regprocedure('private.set_tenant_context(text)') is null
     or to_regprocedure('private.current_tenant()') is null
     or to_regclass('private.establishments') is null
     or to_regclass('private.tenant_inventory') is null
     or to_regclass('private.pending_receipts') is null then
    raise exception 'Fiscal attribution requires the tenant-access and pending-receipt baseline';
  end if;
  if not exists (
    select 1 from pg_class
    where oid='private.tenant_inventory'::regclass and relrowsecurity
  ) then
    raise exception 'Fiscal attribution requires tenant inventory RLS';
  end if;
end;
$preflight$;

create table private.fiscal_document_attribution (
  tenant_id uuid not null references private.establishments(id),
  document_id text not null check (length(btrim(document_id)) between 1 and 128),
  pending_receipt_id uuid references private.pending_receipts(id),
  actor_user_id uuid not null references private.app_users(id),
  actor_name_snapshot text not null check (length(btrim(actor_name_snapshot)) between 1 and 120),
  attributed_at timestamptz not null,
  movement_ids text[] not null default '{}'::text[],
  primary key (tenant_id, document_id)
);
alter table private.fiscal_document_attribution enable row level security;
revoke all on private.fiscal_document_attribution from public, anon, authenticated;
create policy deny_fiscal_document_attribution
  on private.fiscal_document_attribution for all to anon, authenticated
  using (false) with check (false);

-- Patch the existing transaction rather than duplicating its fiscal, permission,
-- revision, tenant, row-lock, stock and pending-receipt rules.
do $patch$
declare
  definition text;
  original_security boolean;
  original_config text[];
  declaration_anchor text := $declaration_anchor$  posted_ids uuid[] := array[]::uuid[];$declaration_anchor$;
  declaration_replacement text := $declaration_replacement$  posted_ids uuid[] := array[]::uuid[];
  active_tenant uuid;$declaration_replacement$;
  session_anchor text := $session_anchor$  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state->'products') <> 'array'
    or jsonb_typeof(p_state->'movements') <> 'array'
    or jsonb_typeof(p_state->'documents') <> 'array' then$session_anchor$;
  session_replacement text := $session_replacement$  perform private.set_tenant_context(p_session_token);
  active_tenant := private.current_tenant();

  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state->'products') <> 'array'
    or jsonb_typeof(p_state->'movements') <> 'array'
    or jsonb_typeof(p_state->'documents') <> 'array' then$session_replacement$;
  write_anchor text := $write_anchor$  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;$write_anchor$;
  write_replacement text := $write_replacement$  -- The JSON snapshot stays backward compatible; author fields are overwritten
  -- only for documents created in this transaction. Old records remain untouched.
  select coalesce(jsonb_agg(
    case when not exists (
      select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old(value)
      where old.value->>'id'=incoming.value->>'id'
    ) then
      (incoming.value - array['checkedBy','checkedByUserId','checkedByTenantId','checkedByAt','checkedByVerified']::text[])
      || jsonb_build_object(
        'checkedBy', coalesce(nullif(btrim(user_row.display_name),''), user_row.username),
        'checkedByUserId', user_row.id,
        'checkedByTenantId', active_tenant,
        'checkedByAt', saved_at,
        'checkedByVerified', true
      )
    else incoming.value end
    order by incoming.ord
  ),'[]'::jsonb)
  into cleaned_documents
  from jsonb_array_elements(p_state->'documents') with ordinality incoming(value,ord);
  p_state := jsonb_set(p_state,'{documents}',cleaned_documents,true);

  -- A document-linked movement receives the same immutable server snapshot.
  select coalesce(jsonb_agg(
    case when not exists (
      select 1 from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) old(value)
      where old.value->>'id'=incoming.value->>'id'
    ) and exists (
      select 1 from jsonb_array_elements(cleaned_documents) new_doc(value)
      where new_doc.value->>'id'=incoming.value->>'documentId'
        and not exists (
          select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old_doc(value)
          where old_doc.value->>'id'=new_doc.value->>'id'
        )
    ) then
      (incoming.value - array['by','byUserId','byTenantId','byAt','byVerified']::text[])
      || jsonb_build_object(
        'by', coalesce(nullif(btrim(user_row.display_name),''), user_row.username),
        'byUserId', user_row.id,
        'byTenantId', active_tenant,
        'byAt', saved_at,
        'byVerified', true
      )
    else incoming.value end
    order by incoming.ord
  ),'[]'::jsonb)
  into cleaned_movements
  from jsonb_array_elements(p_state->'movements') with ordinality incoming(value,ord);
  p_state := jsonb_set(p_state,'{movements}',cleaned_movements,true);

  if octet_length(p_state::text) > 1500000 then
    raise exception using errcode='22001', message='O conteúdo do estoque ultrapassa o limite permitido';
  end if;

  -- The unique tenant/document key makes a duplicate audit event fail closed.
  -- Normal retries see the already-committed document and create no new event.
  insert into private.fiscal_document_attribution(
    tenant_id, document_id, pending_receipt_id, actor_user_id,
    actor_name_snapshot, attributed_at, movement_ids
  )
  select active_tenant, doc.value->>'id',
    nullif(doc.value->>'pendingReceiptId','')::uuid,
    user_row.id, coalesce(nullif(btrim(user_row.display_name),''), user_row.username),
    saved_at,
    coalesce(array(
      select movement.value->>'id'
      from jsonb_array_elements(p_state->'movements') movement(value)
      where movement.value->>'documentId'=doc.value->>'id'
        and nullif(movement.value->>'id','') is not null
      order by movement.value->>'id'
    ),'{}'::text[])
  from jsonb_array_elements(cleaned_documents) doc(value)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old(value)
    where old.value->>'id'=doc.value->>'id'
  );

  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;$write_replacement$;
begin
  select p.prosecdef, p.proconfig into original_security, original_config
    from pg_catalog.pg_proc p
   where p.oid = 'private.inventory_save_impl(text,jsonb)'::regprocedure;
  if not found or not original_security
     or not exists (select 1 from unnest(coalesce(original_config,'{}'::text[])) c where c like 'search_path=%') then
    raise exception 'Fiscal attribution requires SECURITY DEFINER with a fixed search_path';
  end if;
  definition := pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure);
  if position(declaration_anchor in definition)=0
     or position(session_anchor in definition)=0
     or position(write_anchor in definition)=0 then
    raise exception 'Fiscal attribution patch anchors do not match the installed inventory_save_impl';
  end if;
  definition := replace(definition,declaration_anchor,declaration_replacement);
  definition := replace(definition,session_anchor,session_replacement);
  definition := replace(definition,write_anchor,write_replacement);
  execute definition;
  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid = 'private.inventory_save_impl(text,jsonb)'::regprocedure
       and p.prosecdef = original_security
       and p.proconfig is not distinct from original_config
  ) then
    raise exception 'Fiscal attribution changed inventory_save_impl security attributes';
  end if;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
