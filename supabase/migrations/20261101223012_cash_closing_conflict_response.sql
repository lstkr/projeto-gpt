-- B1: conflito de revisão deve retornar HTTP 409, sem retry transacional do PostgREST.
-- Reversão segura: db/rollback/cash_closing_corrections.sql (suspende correções; preserva histórico).
begin;
do $migration$
declare definition text; source text;
 old_error constant text := $old$raise exception 'Fechamento alterado por outra sessão. Recarregue antes de corrigir' using errcode='40001'$old$;
 new_error constant text := $new$raise exception 'Este fechamento foi alterado em outra aba. Recarregue para ver a versão atual' using errcode='PT409'$new$;
begin
 select pg_get_functiondef(oid),prosrc into definition,source from pg_proc
 where oid=to_regprocedure('private.cash_closing_correct(private.app_users,jsonb)');
 -- Recusar deriva de código antes de substituir somente o erro, preservando atributos e privilégios.
 if source is null or md5(replace(source,E'\r\n',E'\n')) <> '21319a33bb2a9ad58f9db6c9964ebe73' then
  raise exception 'Definição de correção inesperada; migração interrompida para revisão' using errcode='55000';
 end if;
 execute replace(definition,old_error,new_error);
end $migration$;
commit;
