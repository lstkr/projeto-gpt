-- Fix: tenant-scoped public view omitted cancellation audit columns.
-- These columns already exist in private.pending_receipts.
-- Preserve row isolation, existing column order, check option and privileges.
create or replace view public.pending_receipts with (security_barrier=true, check_option=local) as
select id, owner_id, file_name, mime, file_bytes, draft, state,
       revision, created_at, updated_at, cancelled_at, cancelled_by
from private.pending_receipts
where tenant_id=private.current_tenant();
