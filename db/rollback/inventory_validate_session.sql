-- Restore the previous backend BEFORE running this rollback. Never use CASCADE.
begin;
set local lock_timeout = '5s';
drop function public.inventory_validate_session(text);
drop function private.inventory_validate_session_impl(text);
notify pgrst, 'reload schema';
commit;
