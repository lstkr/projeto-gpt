-- Make concurrent retries with the same idempotency key replay the committed result.
begin;
create or replace function public.cash_closing_correct(
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
  -- Recheck after the row lock so a concurrent retry with the same key returns
  -- the committed result instead of being rejected as a stale edit.
  select * into existing_event from private.cash_closing_audit
   where tenant_id=private.current_tenant() and cash_closing_id=p_closing_id and idempotency_key=p_idempotency_key;
  if found then
    if existing_event.actor_user_id is distinct from actor.id or existing_event.request_hash is distinct from request_digest then
      raise exception 'Chave de repetição já usada para outra correção' using errcode='22023';
    end if;
    return jsonb_build_object('ok',true,'id',p_closing_id,'version',existing_event.version,'replayed',true);
  end if;
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
notify pgrst, 'reload schema';
commit;
