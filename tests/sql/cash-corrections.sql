-- Dados sintéticos. Transação revertida para não interferir nos testes existentes.
begin;
insert into private.app_users(username,password_hash,role,display_name) values
 ('b1.manager','not-a-real-password-hash','admin','B1 Manager'),
 ('b1.employee','not-a-real-password-hash','employee','B1 Employee');
insert into private.tenant_memberships select id,'00000000-0000-4000-8000-000000000001',role
 from private.app_users where username like 'b1.%';
insert into private.app_sessions(token_hash,user_id,expires_at,tenant_id)
 select encode(extensions.digest(username,'sha256'),'hex'),id,now()+interval '1 hour',
 '00000000-0000-4000-8000-000000000001' from private.app_users where username like 'b1.%';
set local role anon;
do $$
declare entry jsonb := '{"day":"2026-11-01","register":"b1","operator":"Fixture","cashCounted":"0.30","dinheiroVendas":"0.30","movements":[]}';
 saved jsonb; correction jsonb; result jsonb; audit jsonb; bad jsonb;
begin
 saved:=public.cash_closing_save('b1.manager',entry);
 assert saved->>'revision'='0';
 assert jsonb_typeof(public.cash_closings_list('b1.manager')->0->'revision')='string';
 begin perform public.cash_closing_save('b1.manager',entry); raise exception 'Duplicado sobrescreveu';
 exception when unique_violation then null; end;
 correction:=entry||jsonb_build_object('id',saved->>'id','expectedRevision','0','correctionReason','Conferência sintética',
 'requestId','00000000-0000-4000-8000-0000000000b1','cashCounted','0.10');
 begin perform public.cash_closing_save('b1.employee',correction); raise exception 'Funcionário corrigiu';
 exception when insufficient_privilege then null; end;
 begin perform public.cash_closing_audit_list('b1.employee',(saved->>'id')::uuid); raise exception 'Funcionário leu histórico';
 exception when insufficient_privilege then null; end;
 begin perform public.cash_closing_save('invalid',correction); raise exception 'Sessão inválida corrigiu';
 exception when invalid_authorization_specification then null; end;
 foreach bad in array array[correction-'expectedRevision',correction-'requestId',correction||'{"correctionReason":" "}',
 correction||'{"day":"2026-11-02"}',correction||'{"cashCounted":"0.001"}',
 correction||'{"movements":[{"type":"sangria","reason":"Retirada","amount":"0.31"}]}',
 correction||'{"movements":[{"type":"suprimento","reason":"Entrada","amount":"100000000"}]}'] loop
  begin perform public.cash_closing_save('b1.manager',bad); raise exception 'Entrada inválida aceita';
  exception when invalid_parameter_value then null; end;
 end loop;
 result:=public.cash_closing_save('b1.manager',correction); assert result->>'revision'='1';
 assert public.cash_closing_save('b1.manager',correction)->>'replayed'='true';
 begin perform public.cash_closing_save('b1.manager',correction||'{"cashCounted":"0.20"}'); raise exception 'Tentativa reutilizada com outro conteúdo';
 exception when invalid_parameter_value then null; end;
 begin perform public.cash_closing_save('b1.manager',correction||'{"requestId":"00000000-0000-4000-8000-0000000000b2"}'); raise exception 'Revisão antiga aceita';
 exception when serialization_failure then null; end;
 audit:=public.cash_closing_audit_list('b1.manager',(saved->>'id')::uuid);
 assert jsonb_array_length(audit)=1;
 assert audit->0->'before'->>'cashCounted'='0.30' and audit->0->'after'->>'cashCounted'='0.10';
 assert audit->0->'actor'->>'displayName'='B1 Manager';
 assert audit->0->>'reason'='Conferência sintética';
 begin execute 'select * from private.cash_closing_audit'; raise exception 'Leitura direta liberada';
 exception when insufficient_privilege then null; end;
 begin execute 'delete from private.cash_closing_audit'; raise exception 'Exclusão direta liberada';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Falha ao gravar auditoria reverte também valores e revisão.
create function private.b1_fail_audit() returns trigger language plpgsql as $$
begin raise exception 'Falha sintética de auditoria'; end $$;
create trigger b1_fail_audit before insert on private.cash_closing_audit
 for each row execute function private.b1_fail_audit();
do $$
declare closing uuid;
begin
 select id into closing from private.cash_closings where register='b1';
 begin perform public.cash_closing_save('b1.manager',jsonb_build_object('id',closing,'expectedRevision','1',
 'correctionReason','Falha parcial','requestId',gen_random_uuid(),'day','2026-11-01','register','b1',
 'operator','Fixture','cashCounted','0.25','dinheiroVendas','0.30','movements','[]'::jsonb));
 raise exception 'Auditoria deveria falhar' using errcode='XX000';
 exception when raise_exception then null; end;
 assert (select revision from private.cash_closings where id=closing)=1;
 assert (select payload->>'cashCounted' from private.cash_closings where id=closing)='0.10';
 assert (select count(*) from private.cash_closing_audit where closing_id=closing)=1;
end $$;
drop trigger b1_fail_audit on private.cash_closing_audit;
drop function private.b1_fail_audit();
-- Outra unidade nunca recebe nem altera o fechamento.
insert into private.establishments(id,name) values('00000000-0000-4000-8000-0000000000b2','B1 Other');
insert into private.tenant_memberships select id,'00000000-0000-4000-8000-0000000000b2',role from private.app_users where username='b1.manager';
select set_config('b1.fixture_closing',(select id::text from private.cash_closings where register='b1'),true);
update private.app_sessions set tenant_id='00000000-0000-4000-8000-0000000000b2'
 where token_hash=encode(extensions.digest('b1.manager','sha256'),'hex');
set local role anon;
do $$
declare closing uuid := current_setting('b1.fixture_closing')::uuid; correction jsonb;
begin
 correction:=jsonb_build_object('id',closing,'expectedRevision','1','correctionReason','Outro local','requestId',gen_random_uuid());
 begin perform public.cash_closing_save('b1.manager',correction); raise exception 'Outra unidade corrigiu';
 exception when insufficient_privilege then null; end;
 begin perform public.cash_closing_audit_list('b1.manager',closing); raise exception 'Outra unidade leu';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select revision from private.cash_closings where register='b1')=1; end $$;
rollback;
