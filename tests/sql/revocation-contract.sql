-- Synthetic session revocation acceptance; run against isolated PG15/PG17 only.
-- user-directory-update.sql already disabled qa.worker, and preserved qa.manager.
set role anon;
do $$
declare inactive_token text; manager_token text; active_worker uuid; result jsonb;
begin
 -- Inactive user cannot create a new session after deactivation.
 result:=public.inventory_login('qa.worker.renamed','synthetic-worker-password');
 assert not coalesce((result->>'ok')::boolean,false);
 -- An active manager can still log in and enumerate its own users.
 manager_token:=public.inventory_login('qa.manager','synthetic-manager-password')->>'session_token';
 assert manager_token is not null;
 assert jsonb_typeof(public.inventory_directory(manager_token)->'users')='array';
end $$;
reset role;
