-- Autoria de novas notas e movimentos fiscais vem da sessão; legado é preservado.
-- Não aplicar remotamente sem aprovação. Reversão em db/rollback/fiscal_reviewer_from_session.sql.
begin;
create function private.stamp_fiscal_reviewer(incoming jsonb, existing jsonb, p_token text)
returns jsonb language plpgsql set search_path='' as $$
declare actor private.app_users%rowtype; stamped_documents jsonb; stamped_movements jsonb;
 stamp jsonb; checked_at timestamptz := statement_timestamp();
begin
 actor := private.require_actor(p_token);
 stamp := jsonb_build_object('checkedBy',actor.display_name,'checkedByUserId',actor.id,'checkedAt',checked_at);
 select coalesce(jsonb_agg(case when old.doc is null then entry.doc || stamp else old.doc end order by entry.ord),'[]'::jsonb)
 into stamped_documents from jsonb_array_elements(incoming->'documents') with ordinality entry(doc,ord)
 left join lateral (select doc from jsonb_array_elements(coalesce(existing->'documents','[]')) doc
 where doc->>'id'=entry.doc->>'id' limit 1) old on true;
 select coalesce(jsonb_agg(case when old.movement is not null then old.movement
 when nullif(entry.movement->>'documentId','') is not null then entry.movement ||
 jsonb_build_object('by',actor.display_name,'byUserId',actor.id,'checkedAt',checked_at)
 else entry.movement end order by entry.ord),'[]'::jsonb)
 into stamped_movements from jsonb_array_elements(incoming->'movements') with ordinality entry(movement,ord)
 left join lateral (select movement from jsonb_array_elements(coalesce(existing->'movements','[]')) movement
 where movement->>'id'=entry.movement->>'id' limit 1) old on true;
 return incoming || jsonb_build_object('documents',stamped_documents,'movements',stamped_movements);
end $$;
revoke all on function private.stamp_fiscal_reviewer(jsonb,jsonb,text) from public,anon,authenticated;

do $migration$
declare definition text; source text;
 expected_source_md5 constant text := '563d3595988ad0a30c2e7eb4c0e2881a';
 anchor constant text := '  perform private.validate_new_fiscal_access_keys(p_state,existing_state);';
begin
 select pg_get_functiondef(oid),prosrc into definition,source from pg_proc
 where oid=to_regprocedure('private.inventory_save_impl(text,jsonb)');
 if source is null or md5(replace(source,E'\r\n',E'\n'))<>expected_source_md5
 or position(anchor in definition)=0 then
  raise exception 'Definição de estoque inesperada; migração interrompida para revisão' using errcode='55000';
 end if;
 -- A sessão/unidade, revisão e permissão já passaram; o lock do estoque continua na mesma transação.
 definition:=replace(definition,anchor,anchor||E'\n  p_state := private.stamp_fiscal_reviewer(p_state,existing_state,p_session_token);');
 execute definition;
end $migration$;
commit;
