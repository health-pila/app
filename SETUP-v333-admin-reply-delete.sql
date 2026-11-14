begin;

-- Install only the own-reply deletion RPC. Existing tables, RLS, policies and access helpers stay intact.
do $preflight$
begin
  if to_regclass('public.inquiry_messages') is null or to_regclass('public.member_inquiries') is null
     or to_regclass('public.member_community_reads') is null
     or to_regprocedure('public.is_current_user_admin()') is null
     or to_regprocedure('center_deletion_private.user_active(uuid)') is null then
    raise exception 'V333_PREREQUISITES_MISSING';
  end if;
end;
$preflight$;

create or replace function public.admin_delete_inquiry_reply_v333(
  p_message_id uuid,
  p_expected_admin_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $function$
declare
  v_admin uuid := auth.uid();
  v_member uuid;
  v_user uuid;
  v_message public.inquiry_messages%rowtype;
  v_inquiry public.member_inquiries%rowtype;
  v_latest_id uuid;
  v_deleted_id uuid;
  v_last_at timestamptz;
  v_last_sender text;
  v_status public.member_inquiries.status%type;
begin
  if v_admin is null or v_admin is distinct from p_expected_admin_id
     or not coalesce(public.is_current_user_admin(), false) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_message_id is null then raise exception 'MESSAGE_REQUIRED' using errcode = '22023'; end if;

  select m.* into v_message from public.inquiry_messages m where m.id = p_message_id;
  if not found then
    return jsonb_build_object('ok', true, 'message_id', p_message_id, 'already_absent', true);
  end if;
  if v_message.sender_role is distinct from 'admin' or v_message.sender_id is distinct from v_admin then
    raise exception 'OWN_ADMIN_REPLY_ONLY' using errcode = '42501';
  end if;
  select i.user_id into v_member from public.member_inquiries i where i.id = v_message.inquiry_id;
  if not found or v_member is null then raise exception 'INQUIRY_UNAVAILABLE' using errcode = 'P0002'; end if;

  -- Follow the existing account-deletion lock order before taking inquiry/message row locks.
  for v_user in select distinct u from unnest(array[v_admin, v_member]) as ids(u) order by u loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-delete:' || v_user::text, 0));
  end loop;
  if not center_deletion_private.user_active(v_admin) or not center_deletion_private.user_active(v_member)
     or not coalesce(public.is_current_user_admin(), false) then
    raise exception 'APP_ACCOUNT_DELETING' using errcode = '42501';
  end if;

  select i.* into v_inquiry from public.member_inquiries i where i.id = v_message.inquiry_id for update;
  if not found or v_inquiry.user_id is distinct from v_member then
    raise exception 'INQUIRY_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select m.* into v_message from public.inquiry_messages m where m.id = p_message_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'message_id', p_message_id, 'already_absent', true);
  end if;
  if v_message.inquiry_id is distinct from v_inquiry.id or v_message.sender_role is distinct from 'admin'
     or v_message.sender_id is distinct from v_admin then
    raise exception 'OWN_ADMIN_REPLY_ONLY' using errcode = '42501';
  end if;

  select m.id into v_latest_id from public.inquiry_messages m where m.inquiry_id = v_inquiry.id
    order by m.created_at desc, m.id desc limit 1;
  delete from public.inquiry_messages where id = p_message_id and sender_id = v_admin and sender_role = 'admin'
    returning id into v_deleted_id;
  if not found then raise exception 'REPLY_NOT_DELETED'; end if;
  delete from public.member_community_reads
    where user_id = v_member and kind = 'reply' and item_id = p_message_id::text;

  select m.created_at, m.sender_role into v_last_at, v_last_sender
    from public.inquiry_messages m where m.inquiry_id = v_inquiry.id
    order by m.created_at desc, m.id desc limit 1;
  v_status := v_inquiry.status;
  -- An older reply must not undo an explicit completion or change a newer conversation's status.
  if v_latest_id = p_message_id and v_last_sender is distinct from 'admin' then v_status := 'waiting'; end if;
  update public.member_inquiries set
    last_message_at = coalesce(v_last_at, v_inquiry.created_at),
    status = v_status,
    updated_at = clock_timestamp()
    where id = v_inquiry.id;
  if not found then raise exception 'INQUIRY_NOT_UPDATED'; end if;

  return jsonb_build_object('ok', true, 'message_id', p_message_id, 'inquiry_id', v_inquiry.id,
    'already_absent', false, 'status', v_status);
end;
$function$;

revoke all on function public.admin_delete_inquiry_reply_v333(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_delete_inquiry_reply_v333(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
