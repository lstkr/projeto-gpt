-- Disposable test database only. Fixtures and test helpers are rolled back.
begin;
insert into private.app_users(id, username, password_hash, role, display_name, active)
values ('00000000-0000-4000-8000-000000000001', 'rpc_test_admin', 'never-return-password', 'admin', 'Test', true),
       ('00000000-0000-4000-8000-000000000002', 'rpc_test_employee', 'never-return-password', 'employee', 'Test', true),
       ('00000000-0000-4000-8000-000000000003', 'rpc_test_inactive', 'never-return-password', 'employee', 'Test', false);
insert into private.app_sessions(token_hash, user_id, expires_at, revoked_at)
select encode(extensions.digest(repeat(token,64),'sha256'),'hex'), uid::uuid,
       statement_timestamp() + expiry, revoked
from (values
  ('a','00000000-0000-4000-8000-000000000001', interval '1 hour', null::timestamptz),
  ('b','00000000-0000-4000-8000-000000000002', interval '1 hour', null::timestamptz),
  ('c','00000000-0000-4000-8000-000000000001', interval '-1 second', null::timestamptz),
  ('d','00000000-0000-4000-8000-000000000001', interval '1 hour', statement_timestamp()),
  ('e','00000000-0000-4000-8000-000000000003', interval '1 hour', null::timestamptz),
  ('f','00000000-0000-4000-8000-000000000001', interval '0 seconds', null::timestamptz)
) v(token,uid,expiry,revoked);

create function pg_temp.check_sessions() returns void language plpgsql security invoker as $$
declare result jsonb; token text;
begin
  result := public.inventory_validate_session(repeat('a',64));
  assert result = '{"valid":true,"user":{"id":"00000000-0000-4000-8000-000000000001","role":"admin"}}'::jsonb,
    'Exact allowlist prevents extra fields, stock, token or hashes';
  result := public.inventory_validate_session(repeat('b',64));
  assert result = '{"valid":true,"user":{"id":"00000000-0000-4000-8000-000000000002","role":"employee"}}'::jsonb;
  foreach token in array array[null, '', 'invalid', repeat('g',64), repeat('a',65),
    repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64),repeat('0',64),repeat('A',64)] loop
    begin
      perform public.inventory_validate_session(token);
      raise exception 'Expected invalid session';
    exception when sqlstate '28000' then
      assert sqlerrm = 'Sessão inválida ou expirada. Entre novamente.', 'No error detail leakage';
    end;
  end loop;
  begin
    perform token_hash from private.app_sessions;
    raise exception 'Direct sessions access allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform password_hash from private.app_users;
    raise exception 'Direct users access allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform state from public.shared_inventory;
    raise exception 'Direct inventory access allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
grant execute on function pg_temp.check_sessions() to anon, authenticated;
set local role anon;
select pg_temp.check_sessions();
reset role;
set local role authenticated;
select pg_temp.check_sessions();
reset role;

-- Prove neither stock nor inventory_get is a hidden dependency.
alter table public.shared_inventory rename to inventory_unavailable_during_test;
alter function public.inventory_get(text) rename to inventory_get_unavailable;
set local role anon;
select public.inventory_validate_session(repeat('a',64));
reset role;

do $$
declare fn record;
begin
  for fn in select p.*, n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.oid in ('public.inventory_validate_session(text)'::regprocedure,
                   'private.inventory_validate_session_impl(text)'::regprocedure) loop
    assert fn.provolatile = 's';
    assert fn.proconfig @> array['search_path=""'];
    assert fn.prosecdef = (fn.nspname = 'private');
    assert not exists (select 1 from aclexplode(fn.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'),
      'PUBLIC must not execute';
  end loop;
  assert (select relrowsecurity from pg_class where oid='private.app_sessions'::regclass);
  assert (select relrowsecurity from pg_class where oid='private.app_users'::regclass);
end;
$$;
rollback;
