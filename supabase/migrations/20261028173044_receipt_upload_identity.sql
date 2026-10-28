-- Identidade do envio é independente da proveniência fiscal e da conferência.
begin;
set local lock_timeout = '5s';

create table private.receipt_uploads (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references private.establishments(id),
 file_sha256 bytea not null check (octet_length(file_sha256) = 32),
 owner_id uuid not null references private.app_users(id),
 owner_name text not null,
 received_at timestamptz not null default statement_timestamp(),
 channel text not null check (channel in ('celular', 'desktop')),
 unique (tenant_id, file_sha256),
 unique (tenant_id, id)
);
alter table private.receipt_uploads enable row level security;
revoke all on private.receipt_uploads from public, anon, authenticated;
alter table private.pending_receipts
 add column upload_id uuid,
 add column upload_part smallint,
 add constraint pending_upload_tenant foreign key (tenant_id, upload_id)
 references private.receipt_uploads(tenant_id, id),
 add constraint pending_upload_part check (
  (upload_id is null and upload_part is null) or
  (upload_id is not null and upload_part is not null and upload_part between 1 and 20)),
 add constraint pending_upload_unique_part unique (upload_id, upload_part);

-- Reutiliza os controles nativos sem redefinir os locks de sessão da PR #133.
create function private.require_receipt_actor(p_token text, p_permission text)
returns private.app_users language plpgsql security definer set search_path = '' as $$
declare actor private.app_users%rowtype;
begin
 perform private.set_tenant_context(p_token);
 actor := private.require_actor(p_token);
 if not private.has_permission(actor.id, p_permission) then
  raise exception 'Operação não autorizada' using errcode = '42501';
 end if;
 return actor;
end $$;

-- Limites mantêm compatibilidade com o arquivamento atual; magic bytes na PR 1b.
create function private.decode_receipt_upload(p_file jsonb, p_drafts jsonb)
returns bytea language plpgsql set search_path = '' as $$
declare
 max_file_bytes constant integer := 4000000;
 max_base64_chars constant integer := 5600000;
 max_draft_bytes constant integer := 250000;
 max_parts constant integer := 20;
 file_bytes bytea;
begin
 if jsonb_typeof(p_file) is distinct from 'object'
 or coalesce(length(p_file->>'fileName'), 0) not between 1 and 180
 or coalesce(p_file->>'mime', '') not in ('application/xml', 'text/xml', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf')
 or coalesce(p_file->>'channel', '') not in ('celular', 'desktop')
 or coalesce(length(p_file->>'base64'), 0) not between 1 and max_base64_chars then
  raise exception 'Metadados de envio inválidos' using errcode = '22023';
 end if;
 if jsonb_typeof(p_drafts) is distinct from 'array' then
  raise exception 'Lista de cupons inválida' using errcode = '22023';
 end if;
 if jsonb_array_length(p_drafts) not between 1 and max_parts or exists (
  select 1 from jsonb_array_elements(p_drafts) draft
  where jsonb_typeof(draft) <> 'object' or octet_length(draft::text) > max_draft_bytes) then
  raise exception 'Rascunhos de envio inválidos' using errcode = '22023';
 end if;
 file_bytes := decode(p_file->>'base64', 'base64');
 if octet_length(file_bytes) not between 1 and max_file_bytes then
  raise exception 'Arquivo vazio ou maior que 4 MB' using errcode = '22023';
 end if;
 return file_bytes;
end $$;

-- A resposta nunca contém arquivo, token ou hash; a primeira autoria é preservada.
create function private.receipt_upload_result(p_upload_id uuid, p_reused boolean)
returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('ok', true, 'uploadId', upload.id, 'reused', p_reused,
  'submittedBy', jsonb_build_object('id', upload.owner_id, 'displayName', upload.owner_name),
  'submittedAt', upload.received_at, 'channel', upload.channel,
  'receipts', (select coalesce(jsonb_agg(jsonb_build_object('id', receipt.id,
   'part', receipt.upload_part, 'revision', receipt.revision, 'state', receipt.state)
   order by receipt.upload_part), '[]'::jsonb)
   from private.pending_receipts receipt where receipt.upload_id = upload.id))
 from private.receipt_uploads upload
 where upload.id = p_upload_id and upload.tenant_id = private.current_tenant();
$$;

-- Um lote representa os cupons da MESMA foto. O índice único decide a corrida.
-- Coordenação transacional em até 50 linhas para manter criação e replay juntos.
create function public.pending_receipt_receive(p_token text, p_file jsonb, p_drafts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor private.app_users%rowtype; file_bytes bytea; file_hash bytea;
 received_upload_id uuid; reused boolean;
begin
 actor := private.require_receipt_actor(p_token, 'fiscal.pending.create');
 file_bytes := private.decode_receipt_upload(p_file, p_drafts);
 file_hash := extensions.digest(file_bytes, 'sha256');
 if p_file ? 'sha256' and (p_file->>'sha256') is distinct from encode(file_hash, 'hex') then
  raise exception 'Hash do arquivo não confere' using errcode = '22023';
 end if;
 insert into private.receipt_uploads(tenant_id, file_sha256, owner_id, owner_name, channel)
 values(private.current_tenant(), file_hash, actor.id, actor.display_name, p_file->>'channel')
 on conflict (tenant_id, file_sha256) do nothing returning id into received_upload_id;
 reused := received_upload_id is null;
 if reused then
  -- Com READ COMMITTED, esta nova instrução vê o vencedor após aguardar seu commit.
  select id into received_upload_id from private.receipt_uploads
  where tenant_id = private.current_tenant() and file_sha256 = file_hash;
  if received_upload_id is null then
   raise exception 'Repita o envio após a transação concorrente' using errcode = '40001';
  end if;
 else
  insert into private.pending_receipts(owner_id, file_name, mime, file_bytes, draft,
   tenant_id, upload_id, upload_part)
  select actor.id, p_file->>'fileName', p_file->>'mime', file_bytes, part.draft,
   private.current_tenant(), received_upload_id, part.ordinal::smallint
  from jsonb_array_elements(p_drafts) with ordinality part(draft, ordinal);
 end if;
 if not exists (select 1 from private.pending_receipts where upload_id = received_upload_id) then
  raise exception 'Arquivo removido por manutenção; solicite revisão do Gestor' using errcode = '55000';
 end if;
 return private.receipt_upload_result(received_upload_id, reused);
end $$;

-- Contrato aditivo: a UI pode juntar por id sem substituir pending_receipts_list.
create function public.pending_receipt_submissions(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_receipt_actor(p_token, 'fiscal.pending.read');
 return (select coalesce(jsonb_agg(jsonb_build_object('id', receipt.id,
  'submittedBy', jsonb_build_object('id', receipt.owner_id,
   'displayName', coalesce(upload.owner_name, actor.display_name)),
  'submittedAt', coalesce(upload.received_at, receipt.created_at),
  'channel', upload.channel) order by receipt.created_at, receipt.id), '[]'::jsonb)
 from private.pending_receipts receipt
 join private.app_users actor on actor.id = receipt.owner_id
 left join private.receipt_uploads upload on upload.id = receipt.upload_id
 where receipt.tenant_id = private.current_tenant() and receipt.state = 'pending');
end $$;

revoke all on function private.require_receipt_actor(text, text) from public, anon, authenticated;
revoke all on function private.decode_receipt_upload(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.receipt_upload_result(uuid, boolean) from public, anon, authenticated;
revoke all on function public.pending_receipt_receive(text, jsonb, jsonb) from public;
revoke all on function public.pending_receipt_submissions(text) from public;
grant execute on function public.pending_receipt_receive(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.pending_receipt_submissions(text) to anon, authenticated;
comment on function public.pending_receipt_receive(text, jsonb, jsonb) is
 'Arquiva cupons de um arquivo atomicamente por unidade/hash; retentativa não altera rascunhos nem autoria.';
comment on function public.pending_receipt_submissions(text) is
 'Retorna autoria do envio derivada da sessão e horário do servidor; checkedBy não é autoria.';
notify pgrst, 'reload schema';
commit;
