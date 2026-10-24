-- Destructive reset for the explicitly confirmed Supabase test project only.
-- Clears Estoque+ test identities and business data so the owner can bootstrap
-- one fresh DBA. Supabase-managed auth and Storage are deliberately untouched.
begin;
do $$
begin
 if to_regclass('private.tenant_inventory') is null
 or to_regclass('private.app_users') is null
 or to_regclass('private.establishments') is null
 or to_regclass('private.supplier_identity_link_audit') is null
 or to_regclass('private.cash_closing_audit') is null
 then raise exception 'Tenant migration must be applied before the test reset'; end if;
end $$;

-- TEST-ONLY: audit tables are immutable during normal operations. TRUNCATE
-- deliberately bypasses their DELETE triggers only for this owner-authorized,
-- disposable environment reset; it is transactional and never used by the app.
-- Clear these FK children before deleting referenced app_users/establishments.
truncate table private.supplier_identity_link_audit, private.cash_closing_audit;

delete from private.pending_receipts;
delete from private.cash_closings;
delete from private.pending_cash_reports;
delete from private.tenant_inventory;
delete from private.app_sessions;
delete from private.app_login_attempts;
delete from private.external_fiscal_rate_limits;
delete from private.permission_audit;
delete from private.fiscal_document_attribution;
delete from private.user_permissions;
delete from private.tenant_memberships;
delete from private.app_users;
delete from private.establishments;

-- Remove old same-database test snapshots that contain stale credentials/data.
drop table if exists private.estq_backup_app_users_20261021;
drop table if exists private.estq_backup_app_sessions_20261021;
drop table if exists private.estq_backup_shared_inventory_20261021;
drop table if exists private.estq_backup_pending_receipts_20261021;
drop table if exists private.estq_backup_function_defs_20261021;

do $$
begin
 if exists(select 1 from private.app_users)
 or exists(select 1 from private.establishments)
 or exists(select 1 from private.app_sessions)
 or exists(select 1 from private.tenant_inventory)
 or exists(select 1 from private.pending_receipts)
 or exists(select 1 from private.pending_cash_reports)
 or exists(select 1 from private.cash_closings)
 or exists(select 1 from private.supplier_identity_link_audit)
 or exists(select 1 from private.cash_closing_audit)
 then raise exception 'Test reset incomplete'; end if;
end $$;
commit;

