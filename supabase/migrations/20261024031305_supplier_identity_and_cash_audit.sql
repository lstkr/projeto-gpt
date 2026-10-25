-- Canonical supplier links and append-only, recoverable cash-closing corrections.
-- Existing documents and current cash closings are preserved in place.
begin;

create table private.supplier_identity_link_audit (
  event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references private.establishments(id),
  document_id text not null,
  supplier_id text not null,
  actor_user_id uuid not null references private.app_users(id),
  reason text not null check (length(btrim(reason)) between 5 and 300),
  occurred_at timestamptz not null default statement_timestamp()
);
create index supplier_identity_link_audit_latest
  on private.supplier_identity_link_audit(tenant_id, document_id, occurred_at desc, event_id desc);
alter table private.supplier_identity_link_audit enable row level security;
revoke all on private.supplier_identity_link_audit from public, anon, authenticated;

create function private.reject_audit_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Trilha de auditoria é somente acréscimo' using errcode='42501';
end $$;
revoke all on function private.reject_audit_mutation() from public, anon, authenticated;
create trigger supplier_identity_link_audit_immutable
before update or delete on private.supplier_identity_link_audit
for each row execute function private.reject_audit_mutation();

create function public.supplier_identity_links(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor private.app_users%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role <> 'admin' then raise exception 'Operação não autorizada' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('documentId',latest.document_id,'supplierId',latest.supplier_id)
      order by latest.document_id)
    from (
      select distinct on (document_id) document_id,supplier_id
      from private.supplier_identity_link_audit
      where tenant_id=private.current_tenant()
      order by document_id,occurred_at desc,event_id desc
    ) latest
  ),'[]'::jsonb);
end $$;

create function public.supplier_identity_link(p_token text,p_document_id text,p_supplier_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  actor private.app_users%rowtype;
  inventory_state jsonb;
  document_row jsonb;
  supplier_row jsonb;
  existing_supplier_id text;
  document_cnpj text;
  supplier_cnpj text;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role <> 'admin' then raise exception 'Operação não autorizada' using errcode='42501'; end if;
  if length(coalesce(p_document_id,'')) not between 1 and 160 or length(coalesce(p_supplier_id,'')) not between 1 and 160 then
    raise exception 'Vínculo de fornecedor inválido' using errcode='22023';
  end if;
  select state into inventory_state from private.tenant_inventory
   where tenant_id=private.current_tenant() and id=true for update;
  select value into document_row from jsonb_array_elements(coalesce(inventory_state->'documents','[]'::jsonb))
   where value->>'id'=p_document_id;
  select value into supplier_row from jsonb_array_elements(coalesce(inventory_state->'suppliers','[]'::jsonb))
   where value->>'id'=p_supplier_id;
  if document_row is null or supplier_row is null then
    raise exception 'Nota ou fornecedor não encontrado nesta unidade' using errcode='22023';
  end if;
  document_cnpj:=upper(regexp_replace(coalesce(document_row->>'supplierCnpj',''),'[./[:space:]-]','','g'));
  supplier_cnpj:=upper(regexp_replace(coalesce(supplier_row->>'cnpj',''),'[./[:space:]-]','','g'));
  if private.valid_supplier_cnpj(document_cnpj) and document_cnpj is distinct from supplier_cnpj then
    raise exception 'O CNPJ da nota não corresponde ao fornecedor selecionado' using errcode='23514';
  end if;
  select supplier_id into existing_supplier_id
    from private.supplier_identity_link_audit
   where tenant_id=private.current_tenant() and document_id=p_document_id
   order by occurred_at desc,event_id desc limit 1;
  if existing_supplier_id is not null then
    if existing_supplier_id<>p_supplier_id then
      raise exception 'Esta nota já está vinculada a outro fornecedor' using errcode='23514';
    end if;
    return jsonb_build_object('ok',true,'documentId',p_document_id,'supplierId',p_supplier_id,'replayed',true);
  end if;
  if document_row ? 'supplierId' and document_row->>'supplierId'<>p_supplier_id then
    raise exception 'A nota já possui outro fornecedor canônico' using errcode='23514';
  end if;
  insert into private.supplier_identity_link_audit(tenant_id,document_id,supplier_id,actor_user_id,reason)
  values(private.current_tenant(),p_document_id,p_supplier_id,actor.id,'Vínculo legado validado pelo Gestor.');
  return jsonb_build_object('ok',true,'documentId',p_document_id,'supplierId',p_supplier_id);
end $$;

create table private.cash_closing_audit (
  event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references private.establishments(id),
  cash_closing_id uuid not null,
  version integer not null check(version > 0),
  action text not null check(action in ('baseline','correction','restore')),
  actor_user_id uuid references private.app_users(id),
  occurred_at timestamptz not null default statement_timestamp(),
  reason text not null check(length(btrim(reason)) between 5 and 300),
  idempotency_key uuid,
  request_hash text,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  restored_from_version integer,
  unique(tenant_id,cash_closing_id,version),
  unique(tenant_id,cash_closing_id,idempotency_key)
);
create index cash_closing_audit_history
  on private.cash_closing_audit(tenant_id,cash_closing_id,version desc);
alter table private.cash_closing_audit enable row level security;
revoke all on private.cash_closing_audit from public,anon,authenticated;
create trigger cash_closing_audit_immutable
before update or delete on private.cash_closing_audit
for each row execute function private.reject_audit_mutation();

-- Seed a recoverable baseline for every existing closing without changing it.
insert into private.cash_closing_audit(
  tenant_id,cash_closing_id,version,action,actor_user_id,occurred_at,reason,after_snapshot
)
select c.tenant_id,c.id,1,'baseline',c.created_by_user_id,c.created_at,
  'Estado existente registrado antes do início da auditoria.',
  jsonb_build_object('entry',c.payload||jsonb_build_object(
    'id',c.id,'day',c.day::text,'register',c.register,'operator',c.operator))
from private.cash_closings c
on conflict(tenant_id,cash_closing_id,version) do nothing;

create function private.audit_new_cash_closing() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into private.cash_closing_audit(
    tenant_id,cash_closing_id,version,action,actor_user_id,occurred_at,reason,after_snapshot
  ) values(new.tenant_id,new.id,1,'baseline',new.created_by_user_id,new.created_at,
    'Estado inicial do fechamento.',jsonb_build_object('entry',new.payload||jsonb_build_object(
      'id',new.id,'day',new.day::text,'register',new.register,'operator',new.operator)))
  on conflict(tenant_id,cash_closing_id,version) do nothing;
  return new;
end $$;
revoke all on function private.audit_new_cash_closing() from public,anon,authenticated;
create trigger cash_closings_audit_initial_version
after insert on private.cash_closings
for each row execute function private.audit_new_cash_closing();

create function private.require_cash_correction_audit() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_setting('estoque.cash_correction_event',true) is distinct from 'active' then
    raise exception 'Correção financeira deve passar pelo fluxo auditado' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.require_cash_correction_audit() from public,anon,authenticated;
create trigger cash_closing_updates_require_audit
before update on private.cash_closings
for each row execute function private.require_cash_correction_audit();

create function public.cash_closing_audit_list(p_token text,p_closing_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor private.app_users%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role <> 'admin' then raise exception 'Operação não autorizada' using errcode='42501'; end if;
  if not exists(select 1 from private.cash_closings c where c.tenant_id=private.current_tenant() and c.id=p_closing_id) then
    raise exception 'Fechamento não encontrado nesta unidade' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'version',a.version,'action',a.action,'occurredAt',a.occurred_at,
      'actor',case when u.id is null then null else jsonb_build_object('id',u.id,'displayName',u.display_name) end,
      'reason',a.reason,'beforeSnapshot',a.before_snapshot,'afterSnapshot',a.after_snapshot,
      'restoredFromVersion',a.restored_from_version
    ) order by a.version desc)
    from private.cash_closing_audit a
    left join private.app_users u on u.id=a.actor_user_id
    where a.tenant_id=private.current_tenant() and a.cash_closing_id=p_closing_id
  ),'[]'::jsonb);
end $$;

create function public.cash_closing_correct(
  p_token text,p_closing_id uuid,p_expected_updated_at timestamptz,p_entry jsonb,
  p_reason text,p_idempotency_key uuid,p_restore_version integer default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  actor private.app_users%rowtype;
  current_row private.cash_closings%rowtype;
  desired_entry jsonb;
  before_image jsonb;
  after_image jsonb;
  existing_event private.cash_closing_audit%rowtype;
  new_version integer;
  request_digest text;
  event_action text;
  field_name text;
  amount_text text;
  counted_text text;
  movement jsonb;
  normalized_register text;
  clean_payload jsonb;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role <> 'admin' then raise exception 'Operação não autorizada' using errcode='42501'; end if;
  if p_closing_id is null or p_expected_updated_at is null or p_idempotency_key is null
     or length(btrim(coalesce(p_reason,''))) not between 5 and 300 then
    raise exception 'Dados de correção inválidos' using errcode='22023';
  end if;
  event_action:=case when p_restore_version is null then 'correction' else 'restore' end;
  request_digest:=encode(extensions.digest(jsonb_build_object(
    'entry',p_entry,'reason',p_reason,'restoreVersion',p_restore_version)::text,'sha256'),'hex');
  select * into existing_event from private.cash_closing_audit
   where tenant_id=private.current_tenant() and cash_closing_id=p_closing_id and idempotency_key=p_idempotency_key;
  if found then
    if existing_event.actor_user_id is distinct from actor.id or existing_event.request_hash is distinct from request_digest then
      raise exception 'Chave de repetição já usada para outra correção' using errcode='22023';
    end if;
    return jsonb_build_object('ok',true,'id',p_closing_id,'version',existing_event.version,'replayed',true);
  end if;
  select * into current_row from private.cash_closings
   where tenant_id=private.current_tenant() and id=p_closing_id for update;
  if not found then raise exception 'Fechamento não encontrado nesta unidade' using errcode='22023'; end if;
  if current_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Este fechamento mudou em outra sessão. Reabra os dados antes de corrigir.' using errcode='40001';
  end if;
  before_image:=jsonb_build_object('entry',current_row.payload||jsonb_build_object(
    'id',current_row.id,'day',current_row.day::text,'register',current_row.register,'operator',current_row.operator));
  if p_restore_version is not null then
    select after_snapshot->'entry' into desired_entry from private.cash_closing_audit
     where tenant_id=private.current_tenant() and cash_closing_id=p_closing_id and version=p_restore_version;
    if desired_entry is null then raise exception 'Versão de recuperação não encontrada' using errcode='22023'; end if;
  else
    desired_entry:=p_entry;
  end if;
  if jsonb_typeof(desired_entry) is distinct from 'object'
     or length(btrim(coalesce(desired_entry->>'operator',''))) not between 1 and 100
     or length(btrim(coalesce(desired_entry->>'register',''))) not between 1 and 30
     or coalesce(desired_entry->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(desired_entry->'movements') is distinct from 'array'
     or jsonb_array_length(desired_entry->'movements')>100
     or octet_length(desired_entry::text)>35000 then
    raise exception 'Dados financeiros inválidos' using errcode='22023';
  end if;
  normalized_register:=regexp_replace(btrim(desired_entry->>'register'), '\s+', ' ', 'g');
  if normalized_register='' then raise exception 'Número do caixa inválido' using errcode='22023'; end if;
  foreach field_name in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
    amount_text:=coalesce(desired_entry->>field_name,'0');
    if amount_text !~ '^[0-9]+([.][0-9]{1,2})?$' or amount_text::numeric>99999999 then
      raise exception 'Valor de faturamento inválido' using errcode='22023';
    end if;
  end loop;
  counted_text:=coalesce(desired_entry->>'cashCounted','');
  if not (desired_entry ? 'cashCounted') or jsonb_typeof(desired_entry->'cashCounted')='null'
     or counted_text !~ '^[0-9]+([.][0-9]{1,2})?$' or counted_text::numeric>99999999 then
    raise exception 'Informe um valor válido para o dinheiro contado' using errcode='22023';
  end if;
  for movement in select value from jsonb_array_elements(desired_entry->'movements') loop
    if coalesce(movement->>'type','') not in ('sangria','suprimento')
       or length(btrim(coalesce(movement->>'reason',''))) not between 1 and 300
       or coalesce(movement->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'Movimentação inválida' using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from private.cash_closings c where c.tenant_id=private.current_tenant()
    and c.day=(desired_entry->>'day')::date and c.register=normalized_register and c.id<>p_closing_id) then
    raise exception 'Já existe fechamento para esta data e caixa' using errcode='23505';
  end if;
  clean_payload:=desired_entry - array['id','day','register','operator','createdAt','updatedAt','createdBy','updatedBy',
    'tenant_id','tenantId','created_by_user_id','updated_by_user_id','cashReviewed']::text[];
  if clean_payload ? 'movements' then
    clean_payload:=jsonb_set(clean_payload,'{movements}',coalesce((
      select jsonb_agg(value) from jsonb_array_elements(clean_payload->'movements')
      where not (coalesce(value->>'type','')='sangria'
        and upper(regexp_replace(btrim(coalesce(value->>'reason','')), '\s+', ' ', 'g')) like 'SANGRIA - FECHAMENTO DE CAIXA%')
    ),'[]'::jsonb));
  end if;
  perform set_config('estoque.cash_correction_event','active',true);
  update private.cash_closings set day=(desired_entry->>'day')::date,register=normalized_register,
    operator=btrim(desired_entry->>'operator'),payload=clean_payload,
    updated_at=statement_timestamp(),updated_by_user_id=actor.id
   where tenant_id=private.current_tenant() and id=p_closing_id;
  if not found then raise exception 'Fechamento não encontrado nesta unidade' using errcode='40001'; end if;
  select jsonb_build_object('entry',c.payload||jsonb_build_object(
    'id',c.id,'day',c.day::text,'register',c.register,'operator',c.operator))
    into after_image from private.cash_closings c
   where c.tenant_id=private.current_tenant() and c.id=p_closing_id;
  select coalesce(max(version),0)+1 into new_version from private.cash_closing_audit
   where tenant_id=private.current_tenant() and cash_closing_id=p_closing_id;
  insert into private.cash_closing_audit(
    tenant_id,cash_closing_id,version,action,actor_user_id,reason,idempotency_key,
    request_hash,before_snapshot,after_snapshot,restored_from_version
  ) values(private.current_tenant(),p_closing_id,new_version,event_action,actor.id,btrim(p_reason),
    p_idempotency_key,request_digest,before_image,after_image,p_restore_version);
  return jsonb_build_object('ok',true,'id',p_closing_id,'version',new_version,'replayed',false);
end $$;

revoke all on function public.supplier_identity_links(text) from public;
revoke all on function public.supplier_identity_link(text,text,text) from public;
revoke all on function public.cash_closing_audit_list(text,uuid) from public;
revoke all on function public.cash_closing_correct(text,uuid,timestamptz,jsonb,text,uuid,integer) from public;
grant execute on function public.supplier_identity_links(text) to anon,authenticated;
grant execute on function public.supplier_identity_link(text,text,text) to anon,authenticated;
grant execute on function public.cash_closing_audit_list(text,uuid) to anon,authenticated;
grant execute on function public.cash_closing_correct(text,uuid,timestamptz,jsonb,text,uuid,integer) to anon,authenticated;

notify pgrst,'reload schema';
commit;
