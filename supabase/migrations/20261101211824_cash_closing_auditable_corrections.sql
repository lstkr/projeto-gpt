-- B1: correção atômica, decimal, auditável e isolada por estabelecimento.
-- Reversão operacional: db/rollback/cash_closing_corrections.sql; não apagar histórico.
begin;
set local lock_timeout = '5s';
alter table private.cash_closings add column revision bigint not null default 0 check(revision>=0);
create table private.cash_closing_audit (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references private.establishments(id),
 closing_id uuid not null references private.cash_closings(id),
 revision bigint not null check(revision>0), request_id uuid not null,
 actor_id uuid not null references private.app_users(id),
 reason text not null check(length(btrim(reason)) between 1 and 300),
 request jsonb not null, before_snapshot jsonb not null, after_snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,closing_id,revision), unique(tenant_id,closing_id,request_id)
);
alter table private.cash_closing_audit enable row level security;
revoke all on private.cash_closing_audit from public,anon,authenticated;

-- Mantém a precisão numeric e a política existente; não usa float.
create function private.cash_closing_amounts(p_entry jsonb) returns void
language plpgsql set search_path='' as $$
declare field_name text; amount_text text; counted_text text; movement jsonb;
begin
 foreach field_name in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   amount_text:=coalesce(p_entry->>field_name,'0');
   if amount_text !~ '^[0-9]+([.][0-9]{1,2})?$' or amount_text::numeric>99999999 then
     raise exception 'Valor de faturamento inválido' using errcode='22023';
   end if;
 end loop;
 counted_text:=coalesce(p_entry->>'cashCounted','');
 if not (p_entry ? 'cashCounted') or jsonb_typeof(p_entry->'cashCounted')='null'
   or counted_text !~ '^[0-9]+([.][0-9]{1,2})?$' or counted_text::numeric>99999999 then
   raise exception 'Informe um valor válido para o dinheiro contado' using errcode='22023';
 end if;
 for movement in select value from jsonb_array_elements(p_entry->'movements') loop
   if coalesce(movement->>'type','') not in ('sangria','suprimento')
   or length(btrim(coalesce(movement->>'reason',''))) not between 1 and 300
   or coalesce(movement->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$'
   or (movement->>'amount')::numeric>99999999 then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
end $$;

-- Validação e normalização juntas (até 50 linhas) mantêm uma única política financeira para criação/correção.
create function private.cash_closing_payload(p_entry jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare normalized_register text; clean_payload jsonb;
begin
 if jsonb_typeof(p_entry) is distinct from 'object'
 or length(btrim(coalesce(p_entry->>'operator',''))) not between 1 and 100
 or length(btrim(coalesce(p_entry->>'register',''))) not between 1 and 30
 or coalesce(p_entry->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or jsonb_typeof(p_entry->'movements') is distinct from 'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
   raise exception 'Fechamento inválido' using errcode='22023';
 end if;
 normalized_register:=regexp_replace(btrim(p_entry->>'register'), '\s+', ' ', 'g');
 if normalized_register='' then raise exception 'Número do caixa inválido' using errcode='22023'; end if;
 perform private.cash_closing_amounts(p_entry);
 clean_payload:=p_entry - array['id','day','register','operator','createdAt','updatedAt','createdBy','updatedBy','tenant_id','tenantId','created_by_user_id','updated_by_user_id','cashReviewed','revision','expectedRevision','correctionReason','requestId'];
 if clean_payload ? 'movements' then
  clean_payload:=jsonb_set(clean_payload,'{movements}',coalesce((
   select jsonb_agg(value)
   from jsonb_array_elements(clean_payload->'movements')
   where not (coalesce(value->>'type','')='sangria'
     and upper(regexp_replace(btrim(coalesce(value->>'reason','')), '\s+', ' ', 'g')) like 'SANGRIA - FECHAMENTO DE CAIXA%')
  ),'[]'::jsonb));
 end if;
 if coalesce((p_entry->>'dinheiroVendas')::numeric,0)+(select coalesce(sum(
  case when m->>'type'='suprimento' then (m->>'amount')::numeric else -(m->>'amount')::numeric end),0)
  from jsonb_array_elements(clean_payload->'movements') m)<0 then
  raise exception 'Sangrias excedem os valores em dinheiro disponíveis' using errcode='22023'; end if;
 return clean_payload;
end $$;

-- Monta snapshots somente com os campos públicos do fechamento.
create function private.cash_closing_snapshot(p_row private.cash_closings) returns jsonb
language sql stable set search_path='' as $$
 select (p_row.payload-array['id','day','register','operator','revision','createdAt','updatedAt','createdBy','updatedBy',
 'tenant_id','tenantId','created_by_user_id','updated_by_user_id','expectedRevision','correctionReason','requestId']) || jsonb_build_object('id',p_row.id,'day',p_row.day,
 'register',p_row.register,'operator',p_row.operator,'revision',p_row.revision::text)
$$;
create function private.cash_corrections_enabled() returns boolean
language sql set search_path='' as $$ select true $$;

-- Uma transação/lock cobre revisão, gravação e auditoria; 44 linhas para manter atomicidade visível.
create function private.cash_closing_correct(p_actor private.app_users,p_entry jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare current_row private.cash_closings%rowtype; prior private.cash_closing_audit%rowtype;
 clean jsonb; reason text; attempt_id uuid; before_image jsonb; after_image jsonb;
begin
 if p_actor.role<>'admin' then raise exception 'Somente o Gestor pode corrigir' using errcode='42501'; end if;
 reason:=btrim(coalesce(p_entry->>'correctionReason',''));
 if length(reason) not between 1 and 300 or coalesce(p_entry->>'expectedRevision','') !~ '^(0|[1-9][0-9]*)$'
 or jsonb_typeof(p_entry->'expectedRevision') is distinct from 'string' or p_entry->>'requestId' is null then
  raise exception 'Reabra o fechamento e informe revisão, motivo e identificador da tentativa' using errcode='22023'; end if;
 attempt_id:=(p_entry->>'requestId')::uuid;
 select * into current_row from private.cash_closings
 where tenant_id=private.current_tenant() and id=(p_entry->>'id')::uuid for update;
 if not found then raise exception 'Fechamento indisponível nesta unidade' using errcode='42501'; end if;
 if not private.cash_corrections_enabled() then raise exception 'Correções temporariamente suspensas' using errcode='55000'; end if;
 -- Repetição é consultada após o lock: duas tentativas iguais retornam a mesma confirmação.
 select * into prior from private.cash_closing_audit where tenant_id=current_row.tenant_id
 and closing_id=current_row.id and cash_closing_audit.request_id=attempt_id;
 if found then
  if prior.actor_id<>p_actor.id or prior.request is distinct from p_entry then
   raise exception 'Identificador da tentativa já utilizado com outros dados' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'id',current_row.id,'revision',prior.revision::text,'replayed',true);
 end if;
 if current_row.revision::text<>p_entry->>'expectedRevision' then
  raise exception 'Fechamento alterado por outra sessão. Recarregue antes de corrigir' using errcode='40001'; end if;
 if current_row.day::text is distinct from p_entry->>'day' or current_row.register is distinct from p_entry->>'register' then
  raise exception 'Data e número do caixa não podem mudar na correção' using errcode='22023'; end if;
 clean:=private.cash_closing_payload(p_entry);
 before_image:=private.cash_closing_snapshot(current_row);
 update private.cash_closings set payload=clean,operator=btrim(p_entry->>'operator'),
 revision=revision+1,updated_at=clock_timestamp(),updated_by_user_id=p_actor.id
 where id=current_row.id returning * into current_row;
 after_image:=private.cash_closing_snapshot(current_row);
 insert into private.cash_closing_audit(tenant_id,closing_id,revision,request_id,actor_id,reason,request,before_snapshot,after_snapshot)
 values(current_row.tenant_id,current_row.id,current_row.revision,attempt_id,p_actor.id,reason,p_entry,before_image,after_image);
 return jsonb_build_object('ok',true,'id',current_row.id,'revision',current_row.revision::text,'replayed',false);
end $$;

create or replace function public.cash_closing_save(p_token text,p_entry jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype; saved private.cash_closings%rowtype; clean jsonb;
begin
 perform private.set_tenant_context(p_token);
 actor:=private.require_actor(p_token);
 if p_entry ? 'id' then return private.cash_closing_correct(actor,p_entry); end if;
 clean:=private.cash_closing_payload(p_entry);
 insert into private.cash_closings(tenant_id,day,register,operator,payload,created_by_user_id,updated_by_user_id)
 values(private.current_tenant(),(p_entry->>'day')::date,regexp_replace(btrim(p_entry->>'register'),'\s+',' ','g'),
 btrim(p_entry->>'operator'),clean,actor.id,actor.id) on conflict(tenant_id,day,register) do nothing returning * into saved;
 if saved.id is null then
  raise exception 'Já existe fechamento nesta data e caixa. Reabra para corrigir com motivo' using errcode='23505'; end if;
 return jsonb_build_object('ok',true,'id',saved.id,'revision',saved.revision::text,
 'createdAt',saved.created_at,'updatedAt',saved.updated_at,
 'createdBy',jsonb_build_object('id',actor.id,'displayName',actor.display_name),
 'updatedBy',jsonb_build_object('id',actor.id,'displayName',actor.display_name));
end $$;

create or replace function public.cash_closings_list(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.set_tenant_context(p_token);
 perform private.require_actor(p_token);
 return coalesce((select jsonb_agg(private.cash_closing_snapshot(c) || jsonb_build_object(
 'createdAt',c.created_at,'updatedAt',c.updated_at,
 'createdBy',case when creator.id is null then null else jsonb_build_object('id',creator.id,'displayName',creator.display_name) end,
 'updatedBy',case when updater.id is null then null else jsonb_build_object('id',updater.id,'displayName',updater.display_name) end)
 order by c.day desc,c.register) from private.cash_closings c
 left join private.app_users creator on creator.id=c.created_by_user_id
 left join private.app_users updater on updater.id=c.updated_by_user_id
 where c.tenant_id=private.current_tenant()),'[]'::jsonb);
end $$;

create function public.cash_closing_audit_list(p_token text,p_closing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor private.app_users%rowtype;
begin
 perform private.set_tenant_context(p_token); actor:=private.require_actor(p_token);
 if actor.role<>'admin' then raise exception 'Somente o Gestor pode consultar correções' using errcode='42501'; end if;
 if not exists(select 1 from private.cash_closings where id=p_closing_id and tenant_id=private.current_tenant()) then
  raise exception 'Fechamento indisponível nesta unidade' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision::text,'reason',a.reason,
 'actor',jsonb_build_object('id',u.id,'displayName',u.display_name),'createdAt',a.created_at,
 'before',a.before_snapshot,'after',a.after_snapshot) order by a.revision desc)
 from private.cash_closing_audit a join private.app_users u on u.id=a.actor_id
 where a.tenant_id=private.current_tenant() and a.closing_id=p_closing_id),'[]'::jsonb);
end $$;

revoke all on function private.cash_closing_amounts(jsonb),private.cash_closing_payload(jsonb),
 private.cash_closing_snapshot(private.cash_closings),private.cash_corrections_enabled(),
 private.cash_closing_correct(private.app_users,jsonb) from public,anon,authenticated;
revoke all on function public.cash_closing_save(text,jsonb),public.cash_closings_list(text),
 public.cash_closing_audit_list(text,uuid) from public,anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb),public.cash_closings_list(text),
 public.cash_closing_audit_list(text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
