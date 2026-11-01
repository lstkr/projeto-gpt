-- Reversão operacional B1: mantém valores, versões e histórico; criação continua protegida.
-- Aplicar somente com autorização. Reativação exige migração nova e revisão.
begin;
set local lock_timeout = '5s';
-- Aguarda correções em andamento antes de suspender novas operações.
lock table private.cash_closings in exclusive mode;
create or replace function private.cash_corrections_enabled() returns boolean
language sql set search_path='' as $$ select false $$;
revoke all on function private.cash_corrections_enabled() from public,anon,authenticated;
commit;
