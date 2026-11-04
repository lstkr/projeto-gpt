-- Apenas dados sintéticos; executar depois de todas as migrações. Não altera fixtures alheios.
begin;
insert into private.establishments(id,name) values
 ('00000000-0000-4000-8000-0000000000f1','E1 A'),('00000000-0000-4000-8000-0000000000f2','E1 B');
insert into private.app_users(username,password_hash,role,display_name) values
 ('e1.manager','synthetic','admin','E1 Manager'),('e1.employee','synthetic','employee','E1 Employee');
insert into private.tenant_memberships select u.id,e.id,u.role from private.app_users u cross join private.establishments e
 where u.username like 'e1.%' and (u.role='admin' or e.id='00000000-0000-4000-8000-0000000000f1') and e.id in ('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000f2');
insert into private.user_permissions(user_id,permission_key,allowed)
 select id,'fiscal.pending.review',false from private.app_users where username='e1.employee';
insert into private.app_sessions(token_hash,user_id,expires_at,tenant_id)
 select encode(extensions.digest(v.token,'sha256'),'hex'),u.id,now()+interval '1 hour',v.tenant::uuid
 from (values ('e1.a','e1.manager','00000000-0000-4000-8000-0000000000f1'),
 ('e1.b','e1.manager','00000000-0000-4000-8000-0000000000f2'),
 ('e1.denied','e1.employee','00000000-0000-4000-8000-0000000000f1')) v(token,username,tenant)
 join private.app_users u on u.username=v.username;
insert into private.tenant_inventory(tenant_id,id,state)
 select id,true,'{"products":[{"id":"e1.p","stock":2}],"movements":[],"revision":0,"documents":[]}'::jsonb
 from private.establishments where id in ('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000f2');
-- Legado duplicado permanece intacto; somente notas novas passam pela verificação.
update private.tenant_inventory set state=state||jsonb_build_object('deletedDocumentIds',false,'documents',jsonb_build_array(
 jsonb_build_object('id','legacy.1','accessKey',repeat('0',44)),jsonb_build_object('id','legacy.2','accessKey',repeat('0',44))))
 where tenant_id='00000000-0000-4000-8000-0000000000f1';
set local role anon;
do $$
declare current_state jsonb; attempt jsonb; result jsonb; fiscal_key text:=repeat('0',43)||'1'; pending uuid;
begin
 begin perform private.validate_new_fiscal_access_keys('{}','{}'); raise exception 'Helper privado exposto';
 exception when insufficient_privilege then null; end;
 current_state:=public.inventory_get('e1.a');
 result:=public.inventory_save('e1.a',current_state||'{"unrelated":"legacy preserved"}');
 current_state:=public.inventory_get('e1.a'); assert jsonb_array_length(current_state->'documents')=2;
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','new.legacy','accessKey',repeat('0',44))));
 begin perform public.inventory_save('e1.a',attempt); raise exception 'Legado permitiu nova duplicidade';
 exception when unique_violation then null; end;
 assert public.inventory_get('e1.a')=current_state;
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','e1.first','accessKey',fiscal_key,
 'stockEntries',jsonb_build_array(jsonb_build_object('productId','e1.p','quantity',2)))));
 result:=public.inventory_save('e1.a',attempt);
 current_state:=public.inventory_get('e1.a'); assert current_state->'documents'->0->>'accessKey'=fiscal_key;
 -- Mesmo ID é mantido; a chamada não cria outra nota nem altera seu original.
 result:=public.inventory_save('e1.a',current_state);
 current_state:=public.inventory_get('e1.a'); assert jsonb_array_length(current_state->'documents')=3;
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','e1.second','accessKey',fiscal_key)));
 begin perform public.inventory_save('e1.a',attempt); raise exception 'Duplicidade sequencial aceita';
 exception when unique_violation then
  assert sqlerrm='Esta nota já foi lançada nesta unidade. Confira as notas cadastradas antes de tentar novamente.';
 end;
 assert public.inventory_get('e1.a')=current_state;
 begin perform public.inventory_save('invalid',attempt); raise exception 'Sessão inválida consultou duplicidade';
 exception when invalid_authorization_specification then null; end;
 begin perform public.inventory_save('e1.denied',attempt); raise exception 'Sem permissão consultou duplicidade';
 exception when insufficient_privilege then assert sqlerrm='Sem permissão para registrar documentos fiscais.'; end;
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(
 jsonb_build_object('id','e1.two','accessKey',repeat('2',44)),jsonb_build_object('id','e1.three','accessKey',repeat('2',44))));
 begin perform public.inventory_save('e1.a',attempt); raise exception 'Duas novas no mesmo envio aceitas';
 exception when unique_violation then null; end;
 assert public.inventory_get('e1.a')=current_state;
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','e1.numeric','accessKey',repeat('9',44)::numeric)));
 begin perform public.inventory_save('e1.a',attempt); raise exception 'Chave numérica aceita';
 exception when invalid_parameter_value then null; end;
 -- Unidade diferente e notas sem chave continuam permitidas.
 attempt:=public.inventory_get('e1.b');
 result:=public.inventory_save('e1.b',attempt||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','e1.other','accessKey',fiscal_key))));
 result:=public.inventory_save('e1.a',current_state||'{"documents":[{"id":"manual.1"},{"id":"manual.2","accessKey":""}]}');
 begin perform public.inventory_save('e1.a',current_state); raise exception 'Revisão obsoleta aceita';
 exception when sqlstate 'PT409' then null; end;
 current_state:=public.inventory_get('e1.a'); assert jsonb_array_length(current_state->'documents')=5;
 -- Nota cancelada é recusada sem pedir repetição transacional ao servidor HTTP.
 result:=public.pending_receipt_create('e1.a','synthetic.png','image/png','eA==','{}'::jsonb); pending:=(result->>'id')::uuid;
 result:=public.pending_receipt_cancel('e1.a',pending);
 current_state:=public.inventory_get('e1.a');
 attempt:=current_state||jsonb_build_object('documents',jsonb_build_array(jsonb_build_object('id','e1.cancelled','pendingReceiptId',pending)));
 begin perform public.inventory_save('e1.a',attempt); raise exception 'Nota cancelada aceita';
 exception when sqlstate 'PT409' then assert sqlerrm='Nota cancelada, lançada ou inexistente; recarregue.'; end;
 assert public.inventory_get('e1.a')=current_state;
 -- Estorno existente remove a nota e seu saldo; outro ID pode usar a chave posteriormente.
 result:=public.inventory_delete_document('e1.a','e1.first');
 current_state:=public.inventory_get('e1.a'); assert current_state->'products'->0->>'stock'='0.000';
 result:=public.inventory_save('e1.a',current_state||jsonb_build_object('documents',jsonb_build_array(
 jsonb_build_object('id','e1.reposted','accessKey',fiscal_key))));
 current_state:=public.inventory_get('e1.a'); assert jsonb_array_length(current_state->'documents')=5;
 assert current_state->'documents'->0->>'id'='e1.reposted';
end $$;
reset role;
do $$ begin
 assert (select position('40001' in prosrc)=0 from pg_proc where oid='private.inventory_save_impl(text,jsonb)'::regprocedure),
 'O salvamento não pode levantar manualmente o código que inicia repetição infinita';
end $$;
rollback;
