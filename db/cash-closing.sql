create table if not exists public.cash_closings(
 id uuid primary key default gen_random_uuid(),
 day date not null,
 register text not null,
 operator text not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(day,register)
);
alter table public.cash_closings enable row level security;
revoke all on public.cash_closings from public,anon,authenticated;
drop policy if exists cash_closings_deny on public.cash_closings;
create policy cash_closings_deny on public.cash_closings for all to anon,authenticated using(false) with check(false);

create or replace function public.cash_closings_list(p_token text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare role_name text;
begin
 select u.role into role_name from private.app_sessions s
 join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if role_name is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.id,'day',c.day,'register',c.register,'operator',c.operator,
  'createdAt',c.created_at,'updatedAt',c.updated_at)||c.payload
  order by c.day desc,c.register)
 from public.cash_closings c),'[]'::jsonb);
end;
$function$;

create or replace function public.cash_closing_save(p_token text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare role_name text; saved_id uuid; field_name text; amount_text text; movement jsonb;
begin
 select u.role into role_name from private.app_sessions s
 join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if role_name is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if jsonb_typeof(p_entry) is distinct from 'object'
 or length(btrim(coalesce(p_entry->>'operator',''))) not between 1 and 100
 or length(btrim(coalesce(p_entry->>'register',''))) not between 1 and 30
 or coalesce(p_entry->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or jsonb_typeof(p_entry->'movements') is distinct from 'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
   raise exception 'Fechamento inválido' using errcode='22023';
 end if;
 foreach field_name in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   amount_text:=coalesce(p_entry->>field_name,'0');
   if amount_text !~ '^[0-9]+([.][0-9]{1,2})?$' or amount_text::numeric>99999999 then
     raise exception 'Valor de faturamento inválido' using errcode='22023';
   end if;
 end loop;
 for movement in select value from jsonb_array_elements(p_entry->'movements') loop
   if coalesce(movement->>'type','') not in ('sangria','suprimento')
   or length(btrim(coalesce(movement->>'reason',''))) not between 1 and 300
   or coalesce(movement->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>''
   and p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência de dinheiro inválida' using errcode='22023';
 end if;
 if exists(select 1 from public.cash_closings
   where day=(p_entry->>'day')::date and register=p_entry->>'register') and role_name<>'admin' then
   raise exception 'Somente o Gestor pode alterar fechamentos registrados' using errcode='42501';
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,btrim(p_entry->>'register'),btrim(p_entry->>'operator'),
    p_entry - 'id' - 'day' - 'register' - 'operator' - 'createdAt' - 'updatedAt')
 on conflict(day,register) do update set operator=excluded.operator,
   payload=excluded.payload,updated_at=now()
 returning id into saved_id;
 return jsonb_build_object('ok',true,'id',saved_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;