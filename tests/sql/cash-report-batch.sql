-- Synthetic API/RPC acceptance for multi-file cash-report drafts.
-- Runs after tenant-access.sql with only synthetic users in the disposable PG suite.
set role anon;
do $tests$
declare
  token_a text;
  token_b text;
  tenant_b uuid;
  batch_id uuid:=gen_random_uuid();
  retry_batch uuid:=gen_random_uuid();
  file_one uuid:=gen_random_uuid();
  file_two uuid:=gen_random_uuid();
  report_one uuid;
  report_two uuid;
  result jsonb;
  report_list jsonb;
  close_list jsonb;
  pdf_bytes bytea:=convert_to('%PDF-1.4'||chr(10)||'synthetic test only','UTF8');
  pdf_base64 text;
  invalid_base64 text:=encode(convert_to('not a document','UTF8'),'base64');
  i integer;
begin
  result:=public.inventory_login('sql.manager','synthetic-manager-only');
  assert coalesce((result->>'ok')::boolean,false), 'manager login';
  token_a:=result->>'session_token';
  pdf_base64:=encode(pdf_bytes,'base64');

  begin
    perform public.cash_report_create(token_a,gen_random_uuid(),gen_random_uuid(),'bad.pdf',
      'application/pdf',invalid_base64);
    raise exception 'invalid PDF signature unexpectedly accepted' using errcode='XX000';
  exception when sqlstate '22023' then null; end;

  result:=public.cash_report_create(token_a,batch_id,file_one,'report-one.pdf','application/pdf',pdf_base64);
  assert (result->>'ok')::boolean and result->>'state'='uploaded';
  report_one:=(result->>'id')::uuid;
  assert result->>'idempotentRetry'='false';

  result:=public.cash_report_create(token_a,batch_id,file_one,'report-one.pdf','application/pdf',pdf_base64);
  assert result->>'idempotentRetry'='true' and (result->>'id')::uuid=report_one;
  assert public.cash_report_file(token_a,report_one)->>'mime'='application/pdf';

  result:=public.cash_report_create(token_a,batch_id,file_two,'report-two.pdf','application/pdf',pdf_base64);
  assert result->>'duplicateWarning'='true', 'same bytes are warned, never combined';
  report_two:=(result->>'id')::uuid;

  -- A batch accepts five stable file IDs, then rejects the sixth.
  for i in 1..5 loop
    perform public.cash_report_create(token_a,retry_batch,gen_random_uuid(),
      'batch-'||i||'.pdf','application/pdf',pdf_base64);
  end loop;
  begin
    perform public.cash_report_create(token_a,retry_batch,gen_random_uuid(),
      'batch-6.pdf','application/pdf',pdf_base64);
    raise exception 'batch cap unexpectedly accepted too many files' using errcode='XX000';
  exception when sqlstate '22023' then null; end;

  -- Revision checks reject a stale tab; no draft changes are committed.
  result:=public.cash_report_save(token_a,report_one,
    '{"day":"2099-01-01","register":"01","operator":"Synthetic","cashCounted":"123.45","movements":[],"cashReviewed":true}'::jsonb,1);
  assert result->>'state'='pending' and (result->>'revision')::bigint=2;
  begin
    perform public.cash_report_save(token_a,report_one,'{}'::jsonb,1);
    raise exception 'stale revision unexpectedly saved' using errcode='XX000';
  exception when sqlstate '40001' then null; end;

  result:=public.cash_report_post(token_a,report_one,2,'synthetic-post-key-1');
  assert (result->>'ok')::boolean and result->>'idempotentRetry'='false';
  result:=public.cash_report_post(token_a,report_one,2,'synthetic-post-key-1');
  assert (result->>'ok')::boolean and result->>'idempotentRetry'='true';
  close_list:=public.cash_closings_list(token_a);
  assert jsonb_array_length(close_list)>=1;
  assert exists(select 1 from jsonb_array_elements(close_list) c
    where c->>'day'='2099-01-01' and c->>'register'='01'
      and c->>'cashCounted'='123.45');

  -- Same day/register is a conflict, never the admin upsert path; the first close stays intact.
  result:=public.cash_report_save(token_a,report_two,
    '{"day":"2099-01-01","register":"01","operator":"Synthetic changed","cashCounted":"999.99","movements":[],"cashReviewed":true}'::jsonb,1);
  begin
    perform public.cash_report_post(token_a,report_two,(result->>'revision')::bigint,'synthetic-post-key-2');
    raise exception 'duplicate close key unexpectedly overwrote prior close' using errcode='XX000';
  exception when unique_violation then null; end;
  close_list:=public.cash_closings_list(token_a);
  assert (select count(*) from jsonb_array_elements(close_list) c
    where c->>'day'='2099-01-01' and c->>'register'='01')=1;
  assert exists(select 1 from jsonb_array_elements(close_list) c
    where c->>'day'='2099-01-01' and c->>'register'='01'
      and c->>'cashCounted'='123.45');
  report_list:=public.cash_reports_list(token_a);
  assert exists(select 1 from jsonb_array_elements(report_list) p
    where p->>'id'=report_two::text and p->>'state'='pending' and p->>'hasOriginal'='true');

  -- Tenant B receives no list, metadata, or original bytes for tenant A.
  result:=public.inventory_establishment_create(token_a,'Synthetic cash-report tenant');
  tenant_b:=(result->>'id')::uuid;
  result:=public.inventory_select_tenant(token_a,tenant_b);
  token_b:=result->>'session_token';
  assert public.cash_reports_list(token_b)='[]'::jsonb;
  assert public.cash_report_file(token_b,report_two)='{}'::jsonb;
  result:=public.inventory_login('sql.manager','synthetic-manager-only');
  token_a:=result->>'session_token';

  -- A pending draft can be cancelled; original bytes are removed and replay is idempotent.
  result:=public.cash_report_cancel(token_a,report_two,2);
  assert result->>'state'='cancelled';
  assert public.cash_report_file(token_a,report_two)='{}'::jsonb;
  result:=public.cash_report_cancel(token_a,report_two,1);
  assert result->>'idempotentRetry'='true';
end
$tests$;
reset role;
