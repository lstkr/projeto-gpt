-- Suspender somente novos documentos fiscais, preservando estoque, leitura, estornos e histórico.
-- Não remover a proteção nem restaurar SQLSTATE 40001; reativação exige nova decisão autorizada.
begin;
create or replace function private.validate_new_fiscal_access_keys(incoming jsonb, existing jsonb) returns void
language plpgsql set search_path='' as $$
declare deleted_ids jsonb := case when jsonb_typeof(existing->'deletedDocumentIds')='array' then existing->'deletedDocumentIds' else '[]'::jsonb end;
begin
 if exists(select 1 from jsonb_array_elements(incoming->'documents') doc
 where not exists(select 1 from jsonb_array_elements(coalesce(existing->'documents','[]')) old where old->>'id'=doc->>'id')
 and not exists(select 1 from jsonb_array_elements_text(deleted_ids) tomb(id) where tomb.id=doc->>'id')) then
  raise exception 'Novos lançamentos de notas estão temporariamente suspensos. Consulte as notas existentes e tente novamente mais tarde.' using errcode='55000';
 end if;
end $$;
commit;
