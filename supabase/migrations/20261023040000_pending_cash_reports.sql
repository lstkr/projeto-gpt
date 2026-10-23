-- Per-file staging and idempotent posting for cash-report uploads.
-- Apply after tenant_access and cash_closing_integrity migrations.
-- No existing cash closing rows or user accounts are modified.
begin;

do $preflight$
begin
  if to_regclass('private.establishments') is null
     or to_regclass('private.cash_closings') is null
     or to_regprocedure('private.require_actor(text,boolean)') is null
     or to_regprocedure('private.set_tenant_context(text)') is null
     or to_regprocedure('private.current_tenant()') is null
     or to_regprocedure('public.cash_closing_save(text,jsonb)') is null then
    raise exception 'Pending cash reports require tenant auth and cash closing integrity migrations';
  end if;
end;
$preflight$;

create table if not exists private.pending_cash_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references private.establishments(id),
  owner_id uuid not null references private.app_users(id),
  batch_id uuid not null,
  file_id uuid not null,
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  file_name text not null check (length(btrim(file_name)) between 1 and 180),
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png','image/webp')),
  file_bytes bytea,
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft)='object'),
  warnings text[] not null default '{}'::text[],
  state text not null default 'uploaded'
    check (state in ('uploaded','pending','failed','posted','cancelled')),
  revision bigint not null default 1 check (revision > 0),
  post_idempotency_key text,
  post_result jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  posted_at timestamptz,
  cancelled_at timestamptz,
  unique (tenant_id,file_id),
  check ((state in ('posted','cancelled')) = (file_bytes is null)),
  check ((state='posted') = (posted_at is not null)),
  check ((state='cancelled') = (cancelled_at is not null)),
  check ((state='posted') = (post_idempotency_key is not null and post_result is not null))
);
create index if not exists pending_cash_reports_tenant_batch_idx
  on private.pending_cash_reports(tenant_id,batch_id,created_at);
create index if not exists pending_cash_reports_queue_idx
  on private.pending_cash_reports(tenant_id,updated_at desc)
  where state in ('uploaded','pending','failed');
create unique index if not exists pending_cash_reports_post_key_uq
  on private.pending_cash_reports(tenant_id,post_idempotency_key)
  where post_idempotency_key is not null;

alter table private.pending_cash_reports enable row level security;
revoke all on private.pending_cash_reports from public,anon,authenticated;
drop policy if exists pending_cash_reports_deny on private.pending_cash_reports;
create policy pending_cash_reports_deny
  on private.pending_cash_reports for all to anon,authenticated
  using(false) with check(false);

create or replace function public.cash_report_create(
  p_token text,p_batch_id uuid,p_file_id uuid,p_file_name text,p_mime text,p_base64 text
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  actor private.app_users%rowtype;
  tenant_uuid uuid;
  bytes bytea;
  file_hash_value text;
  existing private.pending_cash_reports%rowtype;
  new_id uuid;
  duplicate_found boolean;
  batch_count integer;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if actor.role not in ('admin','employee') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  if p_batch_id is null or p_file_id is null
     or length(btrim(coalesce(p_file_name,''))) not between 1 and 180
     or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp')
     or length(coalesce(p_base64,'')) not between 12 and 5600000 then
    raise exception 'Arquivo inválido ou acima do limite de 4 MB.' using errcode='22023';
  end if;
  begin
    bytes:=decode(p_base64,'base64');
  exception when others then
    raise exception 'Arquivo codificado inválido.' using errcode='22023';
  end;
  if octet_length(bytes)>4000000 then
    raise exception 'Arquivo acima do limite de 4 MB.' using errcode='22023';
  end if;
  if not (
    (p_mime='application/pdf' and substring(bytes from 1 for 5)=decode('255044462d','hex'))
    or (p_mime='image/jpeg' and substring(bytes from 1 for 3)=decode('ffd8ff','hex'))
    or (p_mime='image/png' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
    or (p_mime='image/webp' and substring(bytes from 1 for 4)=decode('52494646','hex')
      and substring(bytes from 9 for 4)=decode('57454250','hex'))
  ) then
    raise exception 'Assinatura do arquivo não corresponde a PDF/JPEG/PNG/WEBP.' using errcode='22023';
  end if;
  if length(btrim(p_file_name))<>length(p_file_name)
     or p_file_name ~ '[[:cntrl:]]' then
    raise exception 'Nome de arquivo inválido.' using errcode='22023';
  end if;
  file_hash_value:=encode(extensions.digest(bytes,'sha256'),'hex');

  -- Serialize the five-file cap for this tenant/batch; a retry uses the stable file_id.
  perform pg_advisory_xact_lock(hashtextextended(tenant_uuid::text||':'||p_batch_id::text,0));
  select * into existing from private.pending_cash_reports
   where tenant_id=tenant_uuid and file_id=p_file_id for update;
  if found then
    if existing.batch_id is distinct from p_batch_id or existing.owner_id is distinct from actor.id
       or existing.file_hash is distinct from file_hash_value then
      raise exception 'Este identificador de arquivo já foi usado com outro conteúdo.' using errcode='23505';
    end if;
    select exists(select 1 from private.pending_cash_reports p
      where p.tenant_id=tenant_uuid and p.file_hash=file_hash_value and p.id<>existing.id)
      into duplicate_found;
    return jsonb_build_object('ok',true,'id',existing.id,'revision',existing.revision,
      'state',existing.state,'duplicateWarning',duplicate_found,'idempotentRetry',true);
  end if;
  select count(*) into batch_count from private.pending_cash_reports p
   where p.tenant_id=tenant_uuid and p.batch_id=p_batch_id;
  if batch_count>=5 then
    raise exception 'O lote permite no máximo 5 arquivos.' using errcode='22023';
  end if;
  select exists(select 1 from private.pending_cash_reports p
    where p.tenant_id=tenant_uuid and p.file_hash=file_hash_value)
    into duplicate_found;
  insert into private.pending_cash_reports(
    tenant_id,owner_id,batch_id,file_id,file_hash,file_name,mime,file_bytes
  ) values (
    tenant_uuid,actor.id,p_batch_id,p_file_id,file_hash_value,btrim(p_file_name),p_mime,bytes
  ) returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id,'revision',1,'state','uploaded',
    'duplicateWarning',duplicate_found,'idempotentRetry',false);
end;
$function$;

create or replace function public.cash_reports_list(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare actor private.app_users%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role not in ('admin','employee') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'batchId',p.batch_id,'fileId',p.file_id,'fileName',p.file_name,'mime',p.mime,
      'state',p.state,'revision',p.revision,'draft',p.draft,'warnings',to_jsonb(p.warnings),
      'hasOriginal',(p.file_bytes is not null),'duplicateWarning',exists(
        select 1 from private.pending_cash_reports other
        where other.tenant_id=p.tenant_id and other.file_hash=p.file_hash and other.id<>p.id
      ),'createdAt',p.created_at,'updatedAt',p.updated_at)
      order by p.updated_at desc,p.id)
    from private.pending_cash_reports p
    where p.tenant_id=private.current_tenant() and p.state in ('uploaded','pending','failed')
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.cash_report_file(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare actor private.app_users%rowtype; result jsonb;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if actor.role not in ('admin','employee') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  select jsonb_build_object('fileName',p.file_name,'mime',p.mime,
    'base64',encode(p.file_bytes,'base64'))
    into result
    from private.pending_cash_reports p
   where p.id=p_id and p.tenant_id=private.current_tenant()
     and p.state in ('uploaded','pending','failed') and p.file_bytes is not null;
  return coalesce(result,'{}'::jsonb);
end;
$function$;

create or replace function public.cash_report_save(
  p_token text,p_id uuid,p_draft jsonb,p_expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  actor private.app_users%rowtype;
  existing private.pending_cash_reports%rowtype;
  warning_values text[]:='{}'::text[];
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if jsonb_typeof(p_draft) is distinct from 'object'
     or octet_length(p_draft::text)>35000
     or p_expected_revision is null or p_expected_revision<1 then
    raise exception 'Rascunho ou revisão inválidos.' using errcode='22023';
  end if;
  if jsonb_typeof(p_draft->'importWarnings')='array' then
    select coalesce(array_agg(left(value,300)),'{}'::text[])
      into warning_values from jsonb_array_elements_text(p_draft->'importWarnings') item(value);
    if cardinality(warning_values)>20 then
      raise exception 'O relatório possui avisos demais.' using errcode='22023';
    end if;
  end if;
  select * into existing from private.pending_cash_reports
   where id=p_id and tenant_id=private.current_tenant() for update;
  if not found or existing.state not in ('uploaded','pending','failed') then
    raise exception 'Relatório não está pendente.' using errcode='22023';
  end if;
  if existing.owner_id<>actor.id and actor.role<>'admin' then
    raise exception 'Somente o autor ou Gestor pode editar este rascunho.' using errcode='42501';
  end if;
  if existing.revision is distinct from p_expected_revision then
    raise exception 'Outra sessão atualizou este arquivo. Reabra para revisar.' using errcode='40001';
  end if;
  update private.pending_cash_reports
     set draft=p_draft,warnings=warning_values,state='pending',revision=revision+1,
         updated_at=statement_timestamp()
   where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'revision',p_expected_revision+1,'state','pending');
end;
$function$;

create or replace function public.cash_report_cancel(p_token text,p_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare actor private.app_users%rowtype; existing private.pending_cash_reports%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  select * into existing from private.pending_cash_reports
   where id=p_id and tenant_id=private.current_tenant() for update;
  if not found then raise exception 'Relatório não encontrado.' using errcode='22023'; end if;
  if existing.state='cancelled' then
    return jsonb_build_object('ok',true,'id',p_id,'state','cancelled','idempotentRetry',true);
  end if;
  if existing.state='posted' then
    raise exception 'Relatório já foi lançado.' using errcode='22023';
  end if;
  if existing.owner_id<>actor.id and actor.role<>'admin' then
    raise exception 'Somente o autor ou Gestor pode cancelar este rascunho.' using errcode='42501';
  end if;
  if existing.revision is distinct from p_expected_revision then
    raise exception 'Outra sessão atualizou este arquivo. Reabra para cancelar.' using errcode='40001';
  end if;
  update private.pending_cash_reports set state='cancelled',file_bytes=null,
    cancelled_at=statement_timestamp(),revision=revision+1,updated_at=statement_timestamp()
   where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id,'state','cancelled','revision',p_expected_revision+1);
end;
$function$;

create or replace function public.cash_report_post(
  p_token text,p_id uuid,p_expected_revision bigint,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  actor private.app_users%rowtype;
  existing private.pending_cash_reports%rowtype;
  save_result jsonb;
  result jsonb;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  if length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 128
     or p_expected_revision is null or p_expected_revision<1 then
    raise exception 'Chave de repetição ou revisão inválidas.' using errcode='22023';
  end if;
  select * into existing from private.pending_cash_reports
   where id=p_id and tenant_id=private.current_tenant() for update;
  if not found then raise exception 'Relatório não encontrado.' using errcode='22023'; end if;
  if existing.state='posted' then
    if existing.post_idempotency_key=p_idempotency_key then
      return existing.post_result||jsonb_build_object('idempotentRetry',true);
    end if;
    raise exception 'Este arquivo já foi lançado.' using errcode='23505';
  end if;
  if existing.state<>'pending' then
    raise exception 'Revise e salve o relatório antes de lançar.' using errcode='22023';
  end if;
  if existing.owner_id<>actor.id and actor.role<>'admin' then
    raise exception 'Somente o autor ou Gestor pode lançar este rascunho.' using errcode='42501';
  end if;
  if existing.revision is distinct from p_expected_revision then
    raise exception 'Outra sessão atualizou este arquivo. Reabra para lançar.' using errcode='40001';
  end if;
  if existing.draft->>'cashReviewed' is distinct from 'true' then
    raise exception 'Confirme a conferência individual antes de lançar.' using errcode='42501';
  end if;
  save_result:=public.cash_closing_save(p_token,existing.draft);
  if coalesce((save_result->>'ok')::boolean,false) is not true then
    raise exception 'Não foi possível registrar o faturamento.' using errcode='22023';
  end if;
  result:=save_result||jsonb_build_object('cashReportId',p_id,'cashReportRevision',existing.revision+1,
    'idempotentRetry',false);
  update private.pending_cash_reports
     set state='posted',file_bytes=null,post_idempotency_key=p_idempotency_key,
         post_result=result,posted_at=statement_timestamp(),revision=revision+1,
         updated_at=statement_timestamp()
   where id=p_id;
  return result;
end;
$function$;

revoke all on function public.cash_report_create(text,uuid,uuid,text,text,text) from public;
revoke all on function public.cash_reports_list(text) from public;
revoke all on function public.cash_report_file(text,uuid) from public;
revoke all on function public.cash_report_save(text,uuid,jsonb,bigint) from public;
revoke all on function public.cash_report_cancel(text,uuid,bigint) from public;
revoke all on function public.cash_report_post(text,uuid,bigint,text) from public;
grant execute on function public.cash_report_create(text,uuid,uuid,text,text,text) to anon,authenticated;
grant execute on function public.cash_reports_list(text) to anon,authenticated;
grant execute on function public.cash_report_file(text,uuid) to anon,authenticated;
grant execute on function public.cash_report_save(text,uuid,jsonb,bigint) to anon,authenticated;
grant execute on function public.cash_report_cancel(text,uuid,bigint) to anon,authenticated;
grant execute on function public.cash_report_post(text,uuid,bigint,text) to anon,authenticated;

notify pgrst,'reload schema';
commit;
