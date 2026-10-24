-- #142: a corrected cash closing must change its optimistic-concurrency marker
-- even when two calls occur in one PostgreSQL statement/transaction.
-- statement_timestamp() is constant for the entire DO/statement; reusing it
-- permits a stale expected_updated_at to match after the first correction.
--
-- Dependency: 20261024032122_cash_closing_retry_after_lock.sql.
-- Apply only after DBA + Security review and explicit environment authorization.
-- Rollback (new migration, never by deleting this file): restore the previous
-- expression updated_at=statement_timestamp() in the same guarded function
-- definition, but ONLY if no concurrent cash corrections depend on this fix.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  definition text;
  updated_definition text;
  anchor constant text := 'updated_at=statement_timestamp(),updated_by_user_id=actor.id';
begin
  definition := pg_get_functiondef(
    'public.cash_closing_correct(text,uuid,timestamptz,jsonb,text,uuid,integer)'::regprocedure
  );
  if (length(definition)-length(replace(definition,anchor,''))) <> length(anchor) then
    raise exception 'Expected exactly one cash closing timestamp anchor; inspect schema drift.';
  end if;

  updated_definition := replace(
    definition,
    anchor,
    'updated_at=greatest(clock_timestamp(), current_row.updated_at + interval ''1 microsecond''),updated_by_user_id=actor.id'
  );
  execute updated_definition;
end
$migration$;
notify pgrst, 'reload schema';
commit;
