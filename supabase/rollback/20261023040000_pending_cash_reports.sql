-- API rollback for staged cash reports.
-- Roll back application code first. The table and stored records intentionally remain
-- intact so pending uploads/drafts can be recovered and audited; no bytes are deleted.
begin;

revoke all on function public.cash_report_post(text,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.cash_report_cancel(text,uuid,bigint) from public,anon,authenticated;
revoke all on function public.cash_report_save(text,uuid,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.cash_report_file(text,uuid) from public,anon,authenticated;
revoke all on function public.cash_reports_list(text) from public,anon,authenticated;
revoke all on function public.cash_report_create(text,uuid,uuid,text,text,text) from public,anon,authenticated;

drop function public.cash_report_post(text,uuid,bigint,text);
drop function public.cash_report_cancel(text,uuid,bigint);
drop function public.cash_report_save(text,uuid,jsonb,bigint);
drop function public.cash_report_file(text,uuid);
drop function public.cash_reports_list(text);
drop function public.cash_report_create(text,uuid,uuid,text,text,text);

comment on table private.pending_cash_reports is
  'Cash-report draft data retained during API rollback; review/restore/delete only through an approved migration.';

notify pgrst,'reload schema';
commit;
