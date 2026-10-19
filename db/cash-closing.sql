-- Cash closings are separated from inventory snapshots to avoid conflicts
-- with the existing debounce/save pipeline and preserve account credentials.
create table if not exists public.cash_closings (
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
declare actor_role text;
begin
 select u.role into actor_role from private.app_sessions sess
 join private.app_users u on u.id=sess.user_id
 where sess.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and sess.expires_at>now() and sess.revoked_at is null and u.active;
 if actor_role is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'day',c.day,'register',c.register,
 'operator',c.operator,'createdAt',c.created_at,'updatedAt',c.updated_at)||c.payload order by c.day desc,c.register)
 from public.cash_closings c),'[]'::jsonb);
end;
$function$;

create or replace function public.cash_closing_save(p_token text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor_role text; rec_id uuid; raw_amount text; k text; m jsonb;
begin
 select u.role into actor_role from private.app_sessions sess
 join private.app_users u on u.id=sess.user_id
 where sess.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and sess.expires_at>now() and sess.revoked_at is null and u.active;
 if actor_role is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if jsonb_typeof(p_entry)<>'object' or length(coalesce(p_entry->>'operator','')) not between 1 and 100
 or length(coalesce(p_entry->>'register','')) not between 1 and 30
 or p_entry->>'day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or jsonb_typeof(p_entry->'movements')<>'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
 raise exception 'Fechamento inválido' using errcode='22023'; end if;
 -- Validate the same numeric fields server-side: the client is untrusted.
 foreach k in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   raw_amount := coalesce(p_entry->>k,'0');
   if raw_amount !~ '^[0-9]+([.][0-9]{1,2})?$' or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;

 or jsonb_typeof(p_entry->'movements')<>'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
 raise exception 'Fechamento inválido' using errcode='22023'; end if;
 -- Validate the same numeric fields server-side: the client is untrusted.
 foreach k in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   raw_amount := coalesce(p_entry->>k,'0');
   if raw_amount !~ '^[0-9]+([.][0-9]{1,2})?$' or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;

 or jsonb_typeof(p_entry->'movements')<>'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
 raise exception 'Fechamento inválido' using errcode='22023'; end if;
 -- Validate the same numeric fields server-side: the client is untrusted.
 foreach k in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   raw_amount := coalesce(p_entry->>k,'0');
   if raw_amount !~ '^[0-9]+([.][0-9]{1,2})?$' or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;

 or jsonb_typeof(p_entry->'movements')<>'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
 raise exception 'Fechamento inválido' using errcode='22023'; end if;
 -- Validate the same numeric fields server-side: the client is untrusted.
 foreach k in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   raw_amount := coalesce(p_entry->>k,'0');
   if raw_amount !~ '^[0-9]+([.][0-9]{1,2})?$' or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;

 or jsonb_typeof(p_entry->'movements')<>'array'
 or jsonb_array_length(p_entry->'movements')>100
 or octet_length(p_entry::text)>35000 then
 raise exception 'Fechamento inválido' using errcode='22023'; end if;
 -- Validate the same numeric fields server-side: the client is untrusted.
 foreach k in array array['cartaoCredito','cartaoDebito','credito','debito','outras','dinheiroVendas'] loop
   raw_amount := coalesce(p_entry->>k,'0');
   if raw_amount !~ '^[0-9]+([.][0-9]{1,2})?$' or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 or raw_amount::numeric>99999999 then
     raise exception 'Valor inválido no faturamento' using errcode='22023';
   end if;
 end loop;
 for m in select value from jsonb_array_elements(p_entry->'movements') loop
   if m->>'type' not in ('sangria','suprimento')
   or length(btrim(coalesce(m->>'reason','')))=0 or length(m->>'reason')>300
   or coalesce(m->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 then
     raise exception 'Movimentação inválida' using errcode='22023';
   end if;
 end loop;
 if p_entry ? 'cashCounted' and coalesce(p_entry->>'cashCounted','')<>'' and
   p_entry->>'cashCounted' !~ '^[0-9]+([.][0-9]{1,2})?$' then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
 then
   raise exception 'Conferência física inválida' using errcode='22023';
 end if;
 -- Employees may create closings but only a manager can change a recorded one.
 if exists(select 1 from public.cash_closings
 where day=(p_entry->>'day')::date and register=p_entry->>'register') then
   if actor_role<>'admin' then raise exception 'Somente o Gestor pode substituir um fechamento' using errcode='42501'; end if;
 end if;
 insert into public.cash_closings(day,register,operator,payload)
 values ((p_entry->>'day')::date,p_entry->>'register',p_entry->>'operator',
         p_entry - 'day' - 'register' - 'operator' - 'id' - 'createdAt' - 'updatedAt')
 on conflict (day,register) do update set operator=excluded.operator,payload=excluded.payload,updated_at=now()
 returning id into rec_id;
 return jsonb_build_object('ok',true,'id',rec_id);
end;
$function$;
revoke all on function public.cash_closings_list(text) from public;
revoke all on function public.cash_closing_save(text,jsonb) from public;
grant execute on function public.cash_closings_list(text) to anon,authenticated;
grant execute on function public.cash_closing_save(text,jsonb) to anon,authenticated;
