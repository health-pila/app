begin;

-- 회원이 이미 저장한 답변 읽음 기록을 관리자에게만 제공합니다.
-- 기존 대화, 회원 읽음 기록, 회원 권한, 이용 제한은 변경하지 않습니다.
create or replace function public.admin_inquiry_reply_read_state(p_inquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  v_member_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Administrator authentication required' using errcode = '42501';
  end if;
  if p_inquiry_id is null then
    raise exception 'Inquiry ID required' using errcode = '22023';
  end if;

  select i.user_id into v_member_id
  from public.member_inquiries i
  where i.id = p_inquiry_id;
  if not found then
    raise exception 'Inquiry unavailable' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'inquiry_id', p_inquiry_id,
    'read_reply_ids', coalesce((
      select jsonb_agg(m.id::text order by m.created_at, m.id)
      from public.inquiry_messages m
      where m.inquiry_id = p_inquiry_id
        and m.sender_role = 'admin'
        and exists (
          select 1 from public.member_community_reads r
          where r.user_id = v_member_id
            and r.kind = 'reply'
            and r.item_id = m.id::text
        )
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.admin_inquiry_reply_read_state(uuid) from public, anon;
grant execute on function public.admin_inquiry_reply_read_state(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

select
  to_regprocedure('public.admin_inquiry_reply_read_state(uuid)') is not null as admin_read_receipts_ready,
  has_function_privilege('authenticated', 'public.admin_inquiry_reply_read_state(uuid)', 'EXECUTE') as authenticated_rpc_ready,
  not has_function_privilege('anon', 'public.admin_inquiry_reply_read_state(uuid)', 'EXECUTE') as anonymous_blocked;
