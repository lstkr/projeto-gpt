-- E1: validar chaves antes da escrita e depois de sessão, unidade, revisão e permissão fiscal.
-- Reversão operacional: db/rollback/fiscal_access_key_uniqueness.sql; não remover dados.
begin;
-- A lista contém apenas documentos novos que a gravação realmente poderá acrescentar.
create function private.validate_new_fiscal_access_keys(incoming jsonb, existing jsonb) returns void
language plpgsql set search_path='' as $$
declare new_documents jsonb; deleted_ids jsonb := case when jsonb_typeof(existing->'deletedDocumentIds')='array' then existing->'deletedDocumentIds' else '[]'::jsonb end;
begin
 select coalesce(jsonb_agg(doc),'[]'::jsonb) into new_documents
 from jsonb_array_elements(incoming->'documents') doc
 where not exists(select 1 from jsonb_array_elements(coalesce(existing->'documents','[]')) old where old->>'id'=doc->>'id')
 and not exists(select 1 from jsonb_array_elements_text(deleted_ids) tomb(id) where tomb.id=doc->>'id');
 if exists(select 1 from jsonb_array_elements(new_documents) doc
 where coalesce(doc->>'accessKey','')<>'' and
 (jsonb_typeof(doc->'accessKey') is distinct from 'string' or doc->>'accessKey' !~ '^[0-9]{44}$')) then
  raise exception 'Confira a chave de acesso: informe os 44 dígitos como texto ou deixe em branco para conferência manual.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(new_documents) doc
 where doc->>'accessKey' ~ '^[0-9]{44}$' and (
 exists(select 1 from jsonb_array_elements(coalesce(existing->'documents','[]')) old
 where jsonb_typeof(old->'accessKey')='string' and old->>'accessKey'=doc->>'accessKey')
 or (select count(*) from jsonb_array_elements(new_documents) other where other->>'accessKey'=doc->>'accessKey')>1)) then
  raise exception 'Esta nota já foi lançada nesta unidade. Confira as notas cadastradas antes de tentar novamente.' using errcode='23505';
 end if;
end $$;
revoke all on function private.validate_new_fiscal_access_keys(jsonb,jsonb) from public,anon,authenticated;
do $migration$
declare definition text; source text;
 expected_source_md5 constant text := '1e949cd4915662565d09988296994520';
 anchor constant text := '  -- Refuse duplicate IDs among new fiscal documents before changing';
begin
 select pg_get_functiondef(oid),prosrc into definition,source from pg_proc
 where oid=to_regprocedure('private.inventory_save_impl(text,jsonb)');
 if source is null or md5(replace(source,E'\r\n',E'\n'))<>expected_source_md5 then
  raise exception 'Definição de estoque inesperada; migração interrompida para revisão' using errcode='55000';
 end if;
 definition:=replace(definition,anchor,E'  perform private.validate_new_fiscal_access_keys(p_state,existing_state);\n\n'||anchor);
 -- Erros manuais deste salvamento usam PT409 para impedir repetição infinita no PostgREST 14.
 definition:=replace(definition,$old$errcode = '40001', message = 'Sua versão$old$,$new$errcode = 'PT409', message = 'Sua versão$new$);
 definition:=replace(definition,$old$errcode = '40001', message = 'O estoque foi alterado$old$,$new$errcode = 'PT409', message = 'O estoque foi alterado$new$);
 definition:=replace(definition,$old$raise exception 'Nota cancelada, lançada ou inexistente; recarregue.' using errcode='40001'$old$,$new$raise exception 'Nota cancelada, lançada ou inexistente; recarregue.' using errcode='PT409'$new$);
 definition:=replace(definition,$old$raise exception 'Falha ao concluir lançamento fiscal.' using errcode='40001'$old$,$new$raise exception 'Falha ao concluir lançamento fiscal.' using errcode='PT409'$new$);
 execute definition;
end $migration$;
commit;
