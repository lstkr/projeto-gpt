-- POST-CUTOVER operational reset recovery only. Does not revert schema or users.
-- Keep sessions revoked; require login again after recovery.
begin;
do $$ declare t record; fingerprint text;
begin
 for t in select * from estoque_recovery_20261021.manifest where source_schema='private'
 and source_table in ('app_users','tenant_memberships','establishments') loop
  execute format('lock table private.%I in exclusive mode',t.source_table);
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from private.%I r',t.source_table) into fingerprint;
  if fingerprint<>t.digest then raise exception 'Identity/tenant drift: recovery requires review'; end if;
 end loop;
 for t in select * from estoque_recovery_20261021.manifest where source_schema='private'
 and source_table in ('tenant_inventory','pending_receipts','cash_closings') loop
  execute format('lock table private.%I in exclusive mode',t.source_table);
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from estoque_recovery_20261021.%I r',t.snapshot_table) into fingerprint;
  if fingerprint<>t.digest then raise exception 'Corrupt snapshot: recovery blocked'; end if;
  execute format('delete from private.%I',t.source_table);
  execute format('insert into private.%I select * from estoque_recovery_20261021.%I',t.source_table,t.snapshot_table);
 end loop;
end $$;
update private.app_sessions set revoked_at=now() where revoked_at is null;
commit;
