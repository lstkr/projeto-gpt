-- Execute only after explicit test-project verification and recovery rehearsal.
-- Preserves identities, password hashes, memberships, establishments and ACLs.
begin;
do $$
declare t record; current_digest text; snapshot_digest text;
begin
 if to_regclass('estoque_recovery_20261021.manifest') is null then raise exception 'Verified backup missing'; end if;
 for t in select * from estoque_recovery_20261021.manifest where source_schema='private'
 and source_table in ('tenant_inventory','pending_receipts','cash_closings','app_users','tenant_memberships','establishments') loop
  execute format('lock table private.%I in exclusive mode',t.source_table);
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from private.%I r',t.source_table) into current_digest;
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from estoque_recovery_20261021.%I r',t.snapshot_table) into snapshot_digest;
  if current_digest<>t.digest or snapshot_digest<>t.digest then raise exception 'Backup drift: reset blocked for %',t.source_table; end if;
 end loop;
 if (select count(*) from estoque_recovery_20261021.manifest where source_schema='private' and source_table in ('tenant_inventory','pending_receipts','cash_closings','app_users','tenant_memberships','establishments'))<>6
 then raise exception 'Incomplete backup'; end if;
end $$;
delete from private.pending_receipts;
delete from private.cash_closings;
update private.tenant_inventory set state=jsonb_build_object('products','[]'::jsonb,'documents','[]'::jsonb,
 'movements','[]'::jsonb,'revision',coalesce((state->>'revision')::bigint,0)+1),updated_at=now();
update private.app_sessions set revoked_at=now() where revoked_at is null;
commit;
