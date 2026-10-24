-- REQUISITO: aplicar db/access-permissions.sql antes deste arquivo.
create table if not exists public.pending_receipts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references private.app_users(id),
 file_name text not null,
 mime text not null,
 file_bytes bytea,
 draft jsonb not null,
 state text not null default 'pending' check(state in ('pending','posted')),
 revision bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.pending_receipts enable row level security;
revoke all on public.pending_receipts from public,anon,authenticated;
drop policy if exists deny_pending on public.pending_receipts;
create policy deny_pending on public.pending_receipts for all to anon,authenticated using(false) with check(false);

create or replace function public.pending_receipts_list(p_token text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
 declare uid uuid; actor_role text;
begin
 select u.id,u.role into uid,actor_role from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if uid is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if not private.has_permission(uid,'fiscal.pending.read') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'fileName',p.file_name,'mime',p.mime,'draft',p.draft,'revision',p.revision,
 'state',p.state,'createdAt',p.created_at,'updatedAt',p.updated_at,
 'canCancel',p.owner_id=uid or (actor_role='admin' and private.has_permission(uid,'fiscal.pending.cancel')))
 order by p.created_at desc)
 from public.pending_receipts p where p.state='pending'),'[]'::jsonb);
end;
$function$;

create or replace function public.pending_receipt_create(
 p_token text,p_file_name text,p_mime text,p_base64 text,p_draft jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare uid uuid; new_id uuid; bytes bytea;
begin
 select u.id into uid from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if uid is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if not private.has_permission(uid,'fiscal.pending.create') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>250000
 or length(coalesce(p_file_name,'')) not between 1 and 180
 or coalesce(p_mime,'') not in ('application/xml','text/xml','image/jpeg','image/png','image/webp','application/pdf','')
 then raise exception 'Metadados de nota inválidos' using errcode='22023'; end if;
 if length(coalesce(p_base64,''))>5600000 then raise exception 'Arquivo excede 4 MB' using errcode='22023'; end if;
 begin bytes:=case when coalesce(p_base64,'')='' then null else decode(p_base64,'base64') end;
 exception when others then raise exception 'Arquivo codificado inválido' using errcode='22023'; end;
 if bytes is not null and octet_length(bytes)>4000000 then
 raise exception 'Arquivo excede 4 MB' using errcode='22023'; end if;
 insert into public.pending_receipts(owner_id,file_name,mime,file_bytes,draft)
 values(uid,p_file_name,coalesce(p_mime,''),bytes,p_draft) returning id into new_id;
 return jsonb_build_object('ok',true,'id',new_id,'revision',1);
end;
$function$;

create or replace function public.pending_receipt_save(p_token text,p_id uuid,p_draft jsonb,p_rev bigint)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare uid uuid; existing public.pending_receipts%rowtype;
begin
 select u.id into uid from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if uid is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if not private.has_permission(uid,'fiscal.pending.review') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 if jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>250000 then
 raise exception 'Dados inválidos' using errcode='22023'; end if;
 select * into existing from public.pending_receipts where id=p_id for update;
 if not found or existing.state<>'pending' then raise exception 'Nota não está mais pendente' using errcode='22023'; end if;
 if p_rev is null or p_rev < 1 then raise exception 'Revisão inválida.' using errcode='22023'; end if;
 if existing.revision is distinct from p_rev then raise exception 'Outra sessão alterou esta nota. Reabra para atualizar.' using errcode='40001'; end if;
 update public.pending_receipts set draft=p_draft,revision=revision+1,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',true,'revision',p_rev+1);
end;
$function$;

create or replace function public.pending_receipt_file(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare uid uuid; result jsonb;
begin
 select u.id into uid from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if uid is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if not private.has_permission(uid,'fiscal.pending.read') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 select jsonb_build_object('fileName',file_name,'mime',mime,'base64',encode(file_bytes,'base64')) into result
 from public.pending_receipts where id=p_id and state='pending';
 return coalesce(result,'{}'::jsonb);
end;
$function$;

create or replace function public.pending_receipt_mark_posted(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare uid uuid;
begin
 select u.id into uid from private.app_sessions s join private.app_users u on u.id=s.user_id
 where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 and s.expires_at>now() and s.revoked_at is null and u.active;
 if uid is null then raise exception 'Sessão inválida' using errcode='42501'; end if;
 if not private.has_permission(uid,'fiscal.pending.review') then raise exception 'Operação não autorizada' using errcode='42501'; end if;
 -- Never allow the UI to hide a pending receipt unless its posted
 -- document is already committed to the shared inventory snapshot.
 if not exists (
   select 1 from public.shared_inventory inventory,
     lateral jsonb_array_elements(coalesce(inventory.state->'documents','[]'::jsonb)) doc
   where inventory.id=true and doc->>'pendingReceiptId'=p_id::text
 ) then
   raise exception 'A nota ainda não foi lançada no estoque.' using errcode='22023';
 end if;
 update public.pending_receipts set state='posted',updated_at=now()
 where id=p_id and state='pending';
 if found then return jsonb_build_object('ok',true); end if;
 -- inventory_save now transitions pending -> posted in the SAME transaction.
 -- Legacy callers may safely retry the marker after a successful commit.
 return jsonb_build_object('ok',exists(
   select 1 from public.pending_receipts where id=p_id and state='posted'
 ));
end;
$function$;

revoke all on function public.pending_receipts_list(text) from public;
revoke all on function public.pending_receipt_create(text,text,text,text,jsonb) from public;
revoke all on function public.pending_receipt_save(text,uuid,jsonb,bigint) from public;
revoke all on function public.pending_receipt_file(text,uuid) from public;
revoke all on function public.pending_receipt_mark_posted(text,uuid) from public;
grant execute on function public.pending_receipts_list(text) to anon,authenticated;
grant execute on function public.pending_receipt_create(text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.pending_receipt_save(text,uuid,jsonb,bigint) to anon,authenticated;
grant execute on function public.pending_receipt_file(text,uuid) to anon,authenticated;
grant execute on function public.pending_receipt_mark_posted(text,uuid) to anon,authenticated;

-- Migration: cancelled notes remain auditable, but cannot be reopened or posted.
alter table public.pending_receipts drop constraint if exists pending_receipts_state_check;
alter table public.pending_receipts add constraint pending_receipts_state_check
  check (state in ('pending','posted','cancelled'));
alter table public.pending_receipts add column if not exists cancelled_at timestamptz;
alter table public.pending_receipts add column if not exists cancelled_by uuid references private.app_users(id);

create or replace function public.pending_receipt_cancel(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor_id uuid; actor_role text; existing public.pending_receipts%rowtype;
begin
  select u.id,u.role into actor_id,actor_role
  from private.app_sessions s join private.app_users u on u.id=s.user_id
  where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and s.expires_at>now() and s.revoked_at is null and u.active;
  if actor_id is null or actor_role not in ('admin','employee') then
    raise exception 'Operação não autorizada.' using errcode='42501';
  end if;
  if actor_role='admin' and not private.has_permission(actor_id,'fiscal.pending.cancel') then
    raise exception 'Operação não autorizada.' using errcode='42501';
  end if;
  -- Same lock order as inventory_save: inventory first, pending row second.
  -- Otherwise simultaneous cancellation and posting can race or deadlock.
  perform 1 from public.shared_inventory where id=true for update;
  if not found then raise exception 'Estoque compartilhado indisponível.' using errcode='22023'; end if;
  select * into existing from public.pending_receipts where id=p_id for update;
  if not found or existing.state <> 'pending' then
    raise exception 'Nota não está mais pendente.' using errcode='22023';
  end if;
  if actor_role<>'admin' and existing.owner_id is distinct from actor_id then
    raise exception 'Você só pode cancelar uma nota pendente enviada por você.' using errcode='42501';
  end if;
  -- Prevent cancellation if another session has already committed its stock entry.
  if exists (
    select 1 from public.shared_inventory inventory,
      lateral jsonb_array_elements(coalesce(inventory.state->'documents','[]'::jsonb)) doc
    where inventory.id=true and doc->>'pendingReceiptId'=p_id::text
  ) then
    raise exception 'Esta nota já foi lançada no estoque.' using errcode='22023';
  end if;
  update public.pending_receipts
    set state='cancelled',cancelled_at=now(),cancelled_by=actor_id,
        file_bytes=null,updated_at=now(),revision=revision+1
    where id=p_id;
  return jsonb_build_object('ok',true,'id',p_id);
end;
$function$;
revoke all on function public.pending_receipt_cancel(text,uuid) from public;
grant execute on function public.pending_receipt_cancel(text,uuid) to anon,authenticated;
