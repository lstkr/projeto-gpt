alter table private.cash_closings
  add column created_by_user_id uuid references private.app_users(id),
  add column updated_by_user_id uuid references private.app_users(id);

create or replace view public.cash_closings with (security_barrier=true) as
select id,day,register,operator,payload,created_at,updated_at,
       created_by_user_id,updated_by_user_id
from private.cash_closings
where tenant_id=private.current_tenant()
with local check option;
revoke all on public.cash_closings from public,anon,authenticated;

create or replace function public.cash_closings_list(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare actor private.app_users%rowtype;
begin
 perform private.set_tenant_context(p_token);
 actor:=private.require_actor(p_token);
 return coalesce((
  select jsonb_agg(
    (c.payload - array['id','day','register','operator','createdAt','updatedAt','createdBy','updatedBy','tenant_id','tenantId','created_by_user_id','updated_by_user_id'])
    || jsonb_build_object(
      'id',c.id,'day',c.day,'register',c.register,'operator',c.operator,
      'createdAt',c.created_at,'updatedAt',c.updated_at,
      'createdBy',case when creator.id is null then null else jsonb_build_object('id',creator.id,'displayName',creator.display_name) end,
      'updatedBy',case when updater.id is null then null else jsonb_build_object('id',updater.id,'displayName',updater.display_name) end
    ) order by c.day desc,c.register
  )
  from private.cash_closings c
  left join private.app_users creator on creator.id=c.created_by_user_id
  left join private.app_users updater on updater.id=c.updated_by_user_id
  where c.tenant_id=private.current_tenant()
 ),'[]'::jsonb);
end;
$function$;

create or replace function public.cash_closing_save(p_token text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 actor private.app_users%rowtype;
 tenant_uuid uuid;
 saved_id uuid;
 field_name text;
 amount_text text;
 counted_text text;
 movement jsonb;
 normalized_register text;
 clean_payload jsonb;
 created_at_value timestamptz;
 updated_at_value timestamptz;
 creator_id uuid;
 updater_id uuid;
 creator_json jsonb;
 updater_json jsonb;
begin
 perform private.set_tenant_context(p_token);
 actor:=private.require_actor(p_token);
 tenant_uuid:=private.current_tenant();
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
   or coalesce(movement->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 clean_payload:=p_entry - array['id','day','register','operator','createdAt','updatedAt','createdBy','updatedBy','tenant_id','tenantId','created_by_user_id','updated_by_user_id','cashReviewed'];
 if clean_payload ? 'movements' then
  clean_payload:=jsonb_set(clean_payload,'{movements}',coalesce((
   select jsonb_agg(value)
   from jsonb_array_elements(clean_payload->'movements')
   where not (coalesce(value->>'type','')='sangria'
     and upper(regexp_replace(btrim(coalesce(value->>'reason','')), '\s+', ' ', 'g')) like 'SANGRIA - FECHAMENTO DE CAIXA%')
  ),'[]'::jsonb));
 end if;
 insert into private.cash_closings(tenant_id,day,register,operator,payload,created_by_user_id,updated_by_user_id)
 values (tenant_uuid,(p_entry->>'day')::date,normalized_register,btrim(p_entry->>'operator'),clean_payload,actor.id,actor.id)
 on conflict(tenant_id,day,register) do update set
   operator=excluded.operator,payload=excluded.payload,updated_at=statement_timestamp(),updated_by_user_id=actor.id
 where actor.role='admin'
 returning id,created_at,updated_at,created_by_user_id,updated_by_user_id
 into saved_id,created_at_value,updated_at_value,creator_id,updater_id;
 if saved_id is null then
   raise exception 'Somente o Gestor pode alterar fechamentos registrados' using errcode='42501';
 end if;
 select case when u.id is null then null else jsonb_build_object('id',u.id,'displayName',u.display_name) end
 into creator_json from (select creator_id as id) ref left join private.app_users u on u.id=ref.id;
 select case when u.id is null then null else jsonb_build_object('id',u.id,'displayName',u.display_name) end
 into updater_json from (select updater_id as id) ref left join private.app_users u on u.id=ref.id;
 return jsonb_build_object('ok',true,'id',saved_id,'createdAt',created_at_value,'updatedAt',updated_at_value,
   'createdBy',creator_json,'updatedBy',updater_json);
end;
$function$;

revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
