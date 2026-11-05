-- Dados sintéticos; isolamento em transação revertida, sem tocar usuários reais.
begin;
insert into private.establishments(id,name) values
 ('00000000-0000-4000-8000-0000000000d1','Autoria A'),('00000000-0000-4000-8000-0000000000d2','Autoria B');
insert into private.app_users(username,password_hash,role,display_name) values
 ('review.manager','synthetic','admin','Gestor Sintético'),('review.employee','synthetic','employee','Funcionário Sintético');
insert into private.tenant_memberships select u.id,e.id,u.role from private.app_users u cross join private.establishments e
 where u.username like 'review.%' and (u.role='admin' or e.id='00000000-0000-4000-8000-0000000000d1') and e.id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2');
insert into private.user_permissions select id,'fiscal.pending.review',false from private.app_users where username='review.employee';
insert into private.app_sessions(token_hash,user_id,expires_at,tenant_id)
 select encode(extensions.digest(v.token,'sha256'),'hex'),u.id,now()+interval '1 hour',v.tenant::uuid
 from (values ('review.a','review.manager','00000000-0000-4000-8000-0000000000d1'),
 ('review.b','review.manager','00000000-0000-4000-8000-0000000000d2'),
 ('review.denied','review.employee','00000000-0000-4000-8000-0000000000d1')) v(token,username,tenant)
 join private.app_users u on u.username=v.username;
insert into private.tenant_inventory(tenant_id,id,state) select id,true,
 '{"products":[],"movements":[],"revision":0,"documents":[{"id":"legacy","checkedBy":"Nome legado"}]}'::jsonb
 from private.establishments where id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2');
set local role anon;
do $$
declare snapshot jsonb; attempt jsonb; saved jsonb; authored jsonb;
begin
 begin perform private.stamp_fiscal_reviewer('{}','{}','review.a'); raise exception 'Helper exposto';
 exception when insufficient_privilege then null; end;
 snapshot:=public.inventory_get('review.a');
 attempt:=snapshot||'{"documents":[{"id":"new","checkedBy":"Forjado","checkedByUserId":"forjado","checkedAt":"1900-01-01"}],"movements":[{"id":"m","documentId":"new","by":"Forjado","byUserId":"forjado"}]}'::jsonb;
 begin perform public.inventory_save('invalid',attempt); raise exception 'Sessão inválida aceita';
 exception when invalid_authorization_specification then null; end;
 begin perform public.inventory_save('review.denied',attempt); raise exception 'Permissão negada aceita';
 exception when insufficient_privilege then null; end;
 assert public.inventory_get('review.a')=snapshot;
 perform public.inventory_save('review.a',attempt);
 saved:=public.inventory_get('review.a'); authored:=saved->'documents'->0;
 assert authored->>'checkedBy'='Gestor Sintético', 'Autoria sintética inesperada: ' || authored::text;
 assert (authored->>'checkedByUserId')::uuid is not null;
 assert authored->>'checkedByUserId'<>'forjado';
 assert (authored->>'checkedAt')::timestamptz=statement_timestamp();
 assert saved->'movements'->0->>'by'='Gestor Sintético';
 assert saved->'movements'->0->>'byUserId'=authored->>'checkedByUserId';
 assert saved->'movements'->0->>'checkedAt'=authored->>'checkedAt';
 assert saved->'documents'->1='{"id":"legacy","checkedBy":"Nome legado"}'::jsonb;
 assert jsonb_array_length(public.inventory_get('review.b')->'documents')=1;
 -- Replay e tentativa de adulterar autoria antiga preservam o original, inclusive horário.
 attempt:=jsonb_set(saved,'{documents,0,checkedBy}','"Outro"');
 attempt:=jsonb_set(attempt,'{movements,0,by}','"Outro"');
 perform public.inventory_save('review.a',attempt);
 saved:=public.inventory_get('review.a'); assert saved->'documents'->0=authored;
 assert saved->'movements'->0->>'by'='Gestor Sintético';
 begin perform public.inventory_save('review.a',attempt); raise exception 'Revisão obsoleta aceita';
 exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
-- Sessão revogada e conta inativa não conseguem gerar autoria nova.
update private.app_sessions set revoked_at=now() where token_hash=encode(extensions.digest('review.a','sha256'),'hex');
set local role anon;
do $$ begin
 begin perform public.inventory_save('review.a','{"products":[],"movements":[],"documents":[],"revision":2}');
 raise exception 'Sessão revogada aceita'; exception when invalid_authorization_specification then null; end;
end $$;
rollback;
