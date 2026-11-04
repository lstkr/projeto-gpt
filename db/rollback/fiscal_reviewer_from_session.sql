-- Suspender novos lançamentos antes da reversão; não apagar autoria já registrada.
begin;
do $rollback$
declare definition text; anchor constant text := '  p_state := private.stamp_fiscal_reviewer(p_state,existing_state,p_session_token);';
begin
 definition:=pg_get_functiondef('private.inventory_save_impl(text,jsonb)'::regprocedure);
 if position(anchor in definition)=0 then
  raise exception 'Autoria não encontrada; reversão interrompida para revisão' using errcode='55000';
 end if;
 execute replace(definition,E'\n'||anchor,'');
end $rollback$;
drop function private.stamp_fiscal_reviewer(jsonb,jsonb,text);
commit;
