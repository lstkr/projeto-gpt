-- P0 / #31: apply only after db/schema.sql, db/access-permissions.sql,
-- and db/pending-receipts.sql (PR #18). Run in a disposable DB first.
begin;
do $preflight$
begin
  if to_regprocedure('private.has_permission(uuid,text)') is null
     or to_regprocedure('private.inventory_save_impl(text,jsonb)') is null
     or to_regprocedure('public.pending_receipt_cancel(text,uuid)') is null
     or to_regclass('public.pending_receipts') is null then
    raise exception 'P0 fiscal preflight: install the access-permissions and pending-receipts baseline first';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.shared_inventory'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.pending_receipts'::regclass) then
    raise exception 'P0 fiscal preflight: required RLS disabled';
  end if;
end;
$preflight$;

-- private.inventory_save_impl
CREATE OR REPLACE FUNCTION private.inventory_save_impl(p_session_token text, p_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved_at timestamptz := now();
  user_row private.app_users%rowtype;
  existing_state jsonb;
  secured_products jsonb;
  retained_products jsonb;
  cleaned_documents jsonb;
  retained_documents jsonb;
  cleaned_movements jsonb;
  retained_movements jsonb;
  deleted_ids jsonb;
  current_revision bigint;
  incoming_revision bigint;
  fiscal_document jsonb;
  pending_id uuid;
  pending_status text;
  posted_ids uuid[] := array[]::uuid[];
begin
  select u.* into user_row from private.app_sessions s
    join private.app_users u on u.id = s.user_id
    where s.token_hash = encode(extensions.digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and s.expires_at > now() and s.revoked_at is null and u.active = true;
  if not found then
    raise exception using errcode = '28000', message = 'Sessão inválida ou expirada. Entre novamente.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state->'products') <> 'array'
    or jsonb_typeof(p_state->'movements') <> 'array'
    or jsonb_typeof(p_state->'documents') <> 'array' then
    raise exception using errcode = '22023', message = 'Formato de estoque inválido';
  end if;
  if octet_length(p_state::text) > 1500000 then
    raise exception using errcode = '22001', message = 'O conteúdo do estoque ultrapassa o limite permitido';
  end if;
  select state into existing_state from public.shared_inventory where id = true for update;
  existing_state := coalesce(existing_state, '{"products":[],"movements":[],"documents":[]}'::jsonb);
  current_revision := coalesce((existing_state->>'revision')::bigint, 0);
  if not (p_state ? 'revision') then
    raise exception using errcode = '40001', message = 'Sua versão do Estoque+ está desatualizada. Atualize a página e entre novamente.';
  end if;
  begin
    incoming_revision := (p_state->>'revision')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Versão de sincronização inválida.';
  end;
  if incoming_revision is null or incoming_revision < 0 then
    raise exception using errcode = '22023', message = 'Versão de sincronização inválida.';
  end if;
  if incoming_revision is distinct from current_revision then
    raise exception using errcode = '40001', message = 'O estoque foi alterado em outra sessão. Atualize a página antes de salvar novamente.';
  end if;

  -- Any new fiscal document or document-linked movement requires explicit
  -- fiscal review permission, including direct calls to inventory_save.
  if (
    exists (
      select 1 from jsonb_array_elements(p_state->'documents') doc(value)
      where not exists (
        select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old(value)
        where old.value->>'id'=doc.value->>'id'
      )
    ) or exists (
      select 1 from jsonb_array_elements(p_state->'movements') movement(value)
      where nullif(movement.value->>'documentId','') is not null
        and not exists (
          select 1 from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) old(value)
          where old.value->>'id'=movement.value->>'id'
        )
    )
  ) and not private.has_permission(user_row.id,'fiscal.pending.review') then
    raise exception using errcode='42501', message='Sem permissão para registrar documentos fiscais.';
  end if;

  -- Shared_inventory is locked first; pending_receipt_cancel uses the SAME
  -- lock order. A committed posting is therefore never cancellable, and
  -- duplicate posting of the same pending receipt is rejected.
  for fiscal_document in
    select doc.value from jsonb_array_elements(p_state->'documents') doc(value)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old(value)
      where old.value->>'id'=doc.value->>'id'
    )
  loop
    if coalesce(fiscal_document->>'id','')='' then
      raise exception 'Documento sem identificador.' using errcode='22023';
    end if;
    if nullif(fiscal_document->>'pendingReceiptId','') is not null then
      begin
        pending_id := (fiscal_document->>'pendingReceiptId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Identificador de nota pendente inválido.' using errcode='22023';
      end;
      if exists (
        select 1 from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) old(value)
        where old.value->>'pendingReceiptId'=pending_id::text
      ) or (
        select count(*) from jsonb_array_elements(p_state->'documents') doc(value)
        where doc.value->>'pendingReceiptId'=pending_id::text
      ) <> 1 then
        raise exception 'Nota pendente já vinculada a outro documento.' using errcode='23505';
      end if;
      select state into pending_status from public.pending_receipts where id=pending_id for update;
      if not found or pending_status is distinct from 'pending' then
        raise exception 'Nota cancelada, lançada ou inexistente; recarregue.' using errcode='40001';
      end if;
      posted_ids := array_append(posted_ids,pending_id);
    end if;
  end loop;

  if user_row.role <> 'admin' then
    -- Staff can adjust quantities and use invoice entry, but cannot modify existing catalog metadata.
    select coalesce(jsonb_agg(
      case
        when exists (
          select 1 from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product
          where old_product->>'id' = incoming.product->>'id'
        ) then
          (incoming.product - 'cost' - 'min' - 'name' - 'sku' - 'category' - 'unit' - 'preferredSupplier') ||
          jsonb_build_object(
            'name', (select old_product->'name' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'sku', (select old_product->'sku' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'category', (select old_product->'category' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'unit', (select old_product->'unit' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1),
            'cost', coalesce((select old_product->'cost' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1), '0'::jsonb),
            'min', coalesce((select old_product->'min' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1), '0'::jsonb),
            'preferredSupplier', coalesce((select old_product->'preferredSupplier' from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb)) old_product where old_product->>'id' = incoming.product->>'id' limit 1), '""'::jsonb)
          )
        else (incoming.product - 'cost' - 'min') || jsonb_build_object('cost', 0, 'min', 0)
      end order by incoming.ord
    ), '[]'::jsonb)
    into secured_products
    from jsonb_array_elements(p_state->'products') with ordinality incoming(product, ord);

    -- Do not allow an employee snapshot to delete products by omitting them.
    select coalesce(jsonb_agg(old_product.product order by old_product.ord), '[]'::jsonb)
      into retained_products
      from jsonb_array_elements(coalesce(existing_state->'products','[]'::jsonb))
        with ordinality old_product(product, ord)
     where not exists (
       select 1 from jsonb_array_elements(p_state->'products') submitted(product)
       where submitted.product->>'id' = old_product.product->>'id'
     );
    secured_products := secured_products || retained_products;
    p_state := jsonb_set(p_state, '{products}', secured_products, true);
  end if;


  -- Documents and historical movements are immutable through the generic snapshot
  -- RPC. Only inventory_delete_document removes one, with role check and stock rollback.
  deleted_ids := coalesce(existing_state->'deletedDocumentIds', '[]'::jsonb);
  if jsonb_typeof(deleted_ids) <> 'array' then deleted_ids := '[]'::jsonb; end if;

  select coalesce(jsonb_agg(
      coalesce((
        select old.doc
          from jsonb_array_elements(coalesce(existing_state->'documents', '[]'::jsonb)) old(doc)
         where old.doc->>'id' = incoming.doc->>'id' limit 1
      ), incoming.doc) order by incoming.ord
    ), '[]'::jsonb)
    into cleaned_documents
    from jsonb_array_elements(p_state->'documents') with ordinality incoming(doc,ord)
   where not exists (
     select 1 from jsonb_array_elements_text(deleted_ids) tomb(id)
      where tomb.id = incoming.doc->>'id'
   );

  select coalesce(jsonb_agg(old.doc order by old.ord), '[]'::jsonb)
    into retained_documents
    from jsonb_array_elements(coalesce(existing_state->'documents','[]'::jsonb)) with ordinality old(doc,ord)
   where not exists (
     select 1 from jsonb_array_elements(cleaned_documents) input(doc)
      where input.doc->>'id' = old.doc->>'id'
   );
  p_state := jsonb_set(p_state, '{documents}', cleaned_documents || retained_documents, true);

  select coalesce(jsonb_agg(
      coalesce((
        select old.move
          from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) old(move)
         where old.move->>'id' = incoming.move->>'id' limit 1
      ), incoming.move) order by incoming.ord
    ), '[]'::jsonb)
    into cleaned_movements
    from jsonb_array_elements(p_state->'movements') with ordinality incoming(move,ord)
   where not exists (
     select 1 from jsonb_array_elements_text(deleted_ids) tomb(id)
      where tomb.id = incoming.move->>'documentId'
   );
  select coalesce(jsonb_agg(old.move order by old.ord), '[]'::jsonb)
    into retained_movements
    from jsonb_array_elements(coalesce(existing_state->'movements','[]'::jsonb)) with ordinality old(move,ord)
   where not exists (
     select 1 from jsonb_array_elements(cleaned_movements) input(move)
      where input.move->>'id' = old.move->>'id'
   );
  p_state := jsonb_set(p_state, '{movements}', cleaned_movements || retained_movements, true);

  p_state := p_state || jsonb_build_object(
    'deletedDocumentIds', deleted_ids,
    'catalogMerges', coalesce(existing_state->'catalogMerges','[]'::jsonb),
    'stockCounts', coalesce(existing_state->'stockCounts','[]'::jsonb),
    'countSettings', coalesce(existing_state->'countSettings','{"enabled":false,"mode":"interval","intervalDays":7,"weekday":1,"monthDay":1}'::jsonb),
    'revision', current_revision + 1
  );
  update public.shared_inventory set state = p_state, updated_at = saved_at where id = true;

  -- Inventory and pending receipt state transition are one atomic transaction.
  -- Failure in either statement rolls back quantities, movements and documents.
  if cardinality(posted_ids)>0 then
    update public.pending_receipts
       set state='posted',updated_at=saved_at
     where id=any(posted_ids) and state='pending';
    if not found then
      raise exception 'Falha ao concluir lançamento fiscal.' using errcode='40001';
    end if;
  end if;
  return jsonb_build_object('ok', true, 'updated_at', saved_at, 'role', user_row.role, 'revision', current_revision + 1);
end;
$function$;

-- public.inventory_count_settings
CREATE OR REPLACE FUNCTION public.inventory_count_settings(p_token text, p_config jsonb, p_rev bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; role_name text; v bigint; cfg jsonb;
begin
 select u.role into role_name from private.app_sessions sess join private.app_users u on u.id=sess.user_id where sess.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and sess.expires_at>now() and sess.revoked_at is null and u.active;
 if role_name is distinct from 'admin' then raise exception 'Somente o Gestor pode definir contagens.' using errcode='42501'; end if;
 if p_config->>'mode' not in ('interval','weekly','monthly') or (p_config->>'intervalDays')::int not between 1 and 365 or (p_config->>'weekday')::int not between 1 and 7 or (p_config->>'monthDay')::int not between 1 and 31 then raise exception 'Configuração inválida.' using errcode='22023'; end if;
 select state into s from public.shared_inventory where id=true for update;
 v:=coalesce((s->>'revision')::bigint,0);
 if v is distinct from p_rev then raise exception 'Estoque alterado. Recarregue.' using errcode='40001'; end if;
 cfg:=jsonb_build_object('enabled',coalesce((p_config->>'enabled')::boolean,false),'mode',p_config->>'mode','intervalDays',(p_config->>'intervalDays')::int,'weekday',(p_config->>'weekday')::int,'monthDay',(p_config->>'monthDay')::int,'configuredAt',(now() at time zone 'America/Sao_Paulo')::date);
 update public.shared_inventory set state=s||jsonb_build_object('countSettings',cfg,'revision',v+1),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'revision',v+1);
end; $function$;

-- public.inventory_count_complete
CREATE OR REPLACE FUNCTION public.inventory_count_complete(p_token text, p_lines jsonb, p_rev bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; u_name text; rev bigint; p jsonb; l jsonb; qty numeric; oldqty numeric; d numeric; rows jsonb:='[]'::jsonb; audits jsonb:='[]'::jsonb; moves jsonb:='[]'::jsonb; cid text:=gen_random_uuid()::text;
begin
 select u.display_name into u_name from private.app_sessions a join private.app_users u on u.id=a.user_id where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and a.expires_at>now() and a.revoked_at is null and u.active;
 if not found then raise exception 'Sessão inválida.' using errcode='28000'; end if;
 if jsonb_typeof(p_lines)<>'array' then raise exception 'Contagem inválida.' using errcode='22023'; end if;
 select state into s from public.shared_inventory where id=true for update;
 rev:=coalesce((s->>'revision')::bigint,0);
 if rev is distinct from p_rev then raise exception 'Estoque mudou. Atualize e reconte antes de concluir.' using errcode='40001'; end if;
 if jsonb_array_length(p_lines)<>jsonb_array_length(s->'products') or jsonb_array_length(p_lines)=0 then raise exception 'Conte todos os produtos cadastrados.' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(s->'products') loop
   if (select count(*) from jsonb_array_elements(p_lines) x where x->>'productId'=p->>'id')<>1 then raise exception 'Há produto ausente ou repetido.' using errcode='22023'; end if;
   select x.value into l from jsonb_array_elements(p_lines) x(value) where x.value->>'productId'=p->>'id';
   qty:=(l->>'counted')::numeric;
   if qty is null or qty<0 or qty>99999999 or qty<>round(qty,3) then raise exception 'Quantidade inválida (máximo 3 casas decimais).' using errcode='22023'; end if;
   oldqty:=(p->>'stock')::numeric; d:=qty-oldqty;
   rows:=rows||jsonb_build_array(jsonb_set(p,'{stock}',to_jsonb(qty),true));
   audits:=audits||jsonb_build_array(jsonb_build_object('productId',p->>'id','name',p->>'name','unit',p->>'unit','expected',oldqty,'counted',qty,'difference',d));
   if d<>0 then
    moves:=moves||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'countId',cid,'productId',p->>'id','product',p->>'name','type',case when d>0 then 'Entrada' else 'Saída' end,'quantity',abs(d),'reason','Ajuste por contagem física','date',to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'by',u_name));
   end if;
 end loop;
 update public.shared_inventory set state=s||jsonb_build_object('products',rows,'movements',moves||coalesce(s->'movements','[]'::jsonb),'stockCounts',jsonb_build_array(jsonb_build_object('id',cid,'completedAt',now(),'by',u_name,'items',audits))||coalesce(s->'stockCounts','[]'::jsonb),'revision',rev+1),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'revision',rev+1,'adjustments',jsonb_array_length(moves));
end; $function$;

-- public.pending_receipt_save
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

-- public.pending_receipt_mark_posted
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

-- public.pending_receipt_cancel
create or replace function public.pending_receipt_cancel(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare actor_id uuid; actor_role text; existing public.pending_receipts%rowtype;
begin
  select u.id,u.role into actor_id,actor_role
  from private.app_sessions s join private.app_users u on u.id=s.user_id
  where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and s.expires_at>now() and s.revoked_at is null and u.active;
  if (actor_role is distinct from 'admin' or not private.has_permission(actor_id,'fiscal.pending.cancel')) then
    raise exception 'Somente o Gestor pode cancelar notas pendentes.' using errcode='42501';
  end if;
  -- Same lock order as inventory_save: inventory first, pending row second.
  -- Otherwise simultaneous cancellation and posting can race or deadlock.
  perform 1 from public.shared_inventory where id=true for update;
  if not found then raise exception 'Estoque compartilhado indisponível.' using errcode='22023'; end if;
  select * into existing from public.pending_receipts where id=p_id for update;
  if not found or existing.state <> 'pending' then
    raise exception 'Nota não está mais pendente.' using errcode='22023';
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

-- Existing grants are preserved by CREATE OR REPLACE. Explicitly refuse PUBLIC.
revoke all on function private.inventory_save_impl(text,jsonb) from public;
revoke all on function public.pending_receipt_cancel(text,uuid) from public;
revoke all on function public.pending_receipt_save(text,uuid,jsonb,bigint) from public;
revoke all on function public.pending_receipt_mark_posted(text,uuid) from public;
commit;
