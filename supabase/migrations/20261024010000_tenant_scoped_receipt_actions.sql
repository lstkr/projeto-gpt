-- Receipt RPCs must establish tenant context for every Supabase request.
-- Employees may cancel their own pending drafts; managers may cancel any draft
-- when their explicit fiscal.pending.cancel permission is enabled.
begin;

do $preflight$
begin
  if to_regclass('private.pending_receipts') is null
     or to_regclass('private.tenant_inventory') is null
     or to_regprocedure('private.set_tenant_context(text)') is null
     or to_regprocedure('private.require_actor(text,boolean)') is null
     or to_regprocedure('private.current_tenant()') is null then
    raise exception 'Tenant scoped receipt actions require the tenant access migration';
  end if;
end;
$preflight$;

create or replace function public.pending_receipts_list(p_token text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if not private.has_permission(actor.id,'fiscal.pending.read') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'fileName',p.file_name,'mime',p.mime,'draft',p.draft,
      'revision',p.revision,'state',p.state,'createdAt',p.created_at,
      'updatedAt',p.updated_at,
      'canCancel',p.owner_id=actor.id or
        (actor.role='admin' and private.has_permission(actor.id,'fiscal.pending.cancel'))
    ) order by p.created_at desc)
    from private.pending_receipts p
    where p.tenant_id=tenant_uuid and p.state='pending'
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.pending_receipt_create(
  p_token text,p_file_name text,p_mime text,p_base64 text,p_draft jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid; new_id uuid; bytes bytea;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if not private.has_permission(actor.id,'fiscal.pending.create') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>250000
     or length(coalesce(p_file_name,'')) not between 1 and 180
     or coalesce(p_mime,'') not in ('application/xml','text/xml','image/jpeg','image/png','image/webp','application/pdf','') then
    raise exception 'Metadados de nota inválidos' using errcode='22023';
  end if;
  if length(coalesce(p_base64,''))>5600000 then
    raise exception 'Arquivo excede 4 MB' using errcode='22023';
  end if;
  begin
    bytes:=case when coalesce(p_base64,'')='' then null else decode(p_base64,'base64') end;
  exception when others then
    raise exception 'Arquivo codificado inválido' using errcode='22023';
  end;
  if bytes is not null and octet_length(bytes)>4000000 then
    raise exception 'Arquivo excede 4 MB' using errcode='22023';
  end if;
  insert into private.pending_receipts(tenant_id,owner_id,file_name,mime,file_bytes,draft)
  values(tenant_uuid,actor.id,p_file_name,coalesce(p_mime,''),bytes,p_draft)
  returning id into new_id;
  return jsonb_build_object('ok',true,'id',new_id,'revision',1);
end;
$function$;

create or replace function public.pending_receipt_save(p_token text,p_id uuid,p_draft jsonb,p_rev bigint)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid; existing public.pending_receipts%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if not private.has_permission(actor.id,'fiscal.pending.review') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  if jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>250000 then
    raise exception 'Dados inválidos' using errcode='22023';
  end if;
  select * into existing from private.pending_receipts
   where id=p_id and tenant_id=tenant_uuid for update;
  if not found or existing.state<>'pending' then
    raise exception 'Nota não está mais pendente' using errcode='22023';
  end if;
  if p_rev is null or p_rev<1 then raise exception 'Revisão inválida.' using errcode='22023'; end if;
  if existing.revision is distinct from p_rev then
    raise exception 'Outra sessão alterou esta nota. Reabra para atualizar.' using errcode='40001';
  end if;
  update private.pending_receipts set draft=p_draft,revision=revision+1,updated_at=now()
   where id=p_id and tenant_id=tenant_uuid;
  return jsonb_build_object('ok',true,'revision',p_rev+1);
end;
$function$;

create or replace function public.pending_receipt_file(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid; result jsonb;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if not private.has_permission(actor.id,'fiscal.pending.read') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  select jsonb_build_object('fileName',file_name,'mime',mime,'base64',encode(file_bytes,'base64'))
    into result
    from private.pending_receipts
   where id=p_id and tenant_id=tenant_uuid and state='pending';
  return coalesce(result,'{}'::jsonb);
end;
$function$;

create or replace function public.pending_receipt_mark_posted(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if not private.has_permission(actor.id,'fiscal.pending.review') then
    raise exception 'Operação não autorizada' using errcode='42501';
  end if;
  if not exists (
    select 1 from private.tenant_inventory inventory,
      lateral jsonb_array_elements(coalesce(inventory.state->'documents','[]'::jsonb)) doc
     where inventory.tenant_id=tenant_uuid and inventory.id=true
       and doc->>'pendingReceiptId'=p_id::text
  ) then
    raise exception 'A nota ainda não foi lançada no estoque.' using errcode='22023';
  end if;
  update private.pending_receipts set state='posted',updated_at=now()
   where id=p_id and tenant_id=tenant_uuid and state='pending';
  if found then return jsonb_build_object('ok',true); end if;
  return jsonb_build_object('ok',exists(
    select 1 from private.pending_receipts
     where id=p_id and tenant_id=tenant_uuid and state='posted'
  ));
end;
$function$;

create or replace function public.pending_receipt_cancel(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor private.app_users%rowtype; tenant_uuid uuid; existing private.pending_receipts%rowtype;
begin
  perform private.set_tenant_context(p_token);
  actor:=private.require_actor(p_token);
  tenant_uuid:=private.current_tenant();
  if actor.role not in ('admin','employee') then
    raise exception 'Operação não autorizada.' using errcode='42501';
  end if;
  if actor.role='admin' and not private.has_permission(actor.id,'fiscal.pending.cancel') then
    raise exception 'Operação não autorizada.' using errcode='42501';
  end if;
  -- Match inventory_save's lock order so cancellation and posting serialize.
  perform 1 from private.tenant_inventory
   where tenant_id=tenant_uuid and id=true for update;
  if not found then raise exception 'Estoque da unidade indisponível.' using errcode='22023'; end if;
  select * into existing from private.pending_receipts
   where id=p_id and tenant_id=tenant_uuid for update;
  if not found or existing.state<>'pending' then
    raise exception 'Nota não está mais pendente.' using errcode='22023';
  end if;
  if actor.role<>'admin' and existing.owner_id is distinct from actor.id then
    raise exception 'Você só pode cancelar uma nota pendente enviada por você.' using errcode='42501';
  end if;
  if exists (
    select 1 from private.tenant_inventory inventory,
      lateral jsonb_array_elements(coalesce(inventory.state->'documents','[]'::jsonb)) doc
     where inventory.tenant_id=tenant_uuid and inventory.id=true
       and doc->>'pendingReceiptId'=p_id::text
  ) then
    raise exception 'Esta nota já foi lançada no estoque.' using errcode='22023';
  end if;
  update private.pending_receipts
     set state='cancelled',cancelled_at=now(),cancelled_by=actor.id,
         file_bytes=null,updated_at=now(),revision=revision+1
   where id=p_id and tenant_id=tenant_uuid;
  return jsonb_build_object('ok',true,'id',p_id);
end;
$function$;

revoke all on function public.pending_receipts_list(text) from public;
revoke all on function public.pending_receipt_create(text,text,text,text,jsonb) from public;
revoke all on function public.pending_receipt_save(text,uuid,jsonb,bigint) from public;
revoke all on function public.pending_receipt_file(text,uuid) from public;
revoke all on function public.pending_receipt_mark_posted(text,uuid) from public;
revoke all on function public.pending_receipt_cancel(text,uuid) from public;
grant execute on function public.pending_receipts_list(text) to anon,authenticated;
grant execute on function public.pending_receipt_create(text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.pending_receipt_save(text,uuid,jsonb,bigint) to anon,authenticated;
grant execute on function public.pending_receipt_file(text,uuid) to anon,authenticated;
grant execute on function public.pending_receipt_mark_posted(text,uuid) to anon,authenticated;
grant execute on function public.pending_receipt_cancel(text,uuid) to anon,authenticated;

commit;
