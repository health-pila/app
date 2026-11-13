-- 관리자 작업 화면의 '상품 적용 대기' 목록과 전체 건수만 조회합니다.
-- 기존 결제 승인·취소·상품 적용·알림 확인 기록은 변경하지 않습니다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_workspace_payment_queue(
  p_expected_admin_id uuid, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_admin_id
     or not coalesce(public.is_current_user_admin(), false) then
    raise exception 'Administrator authentication required' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Invalid offset' using errcode = '22023';
  end if;
  with pending as materialized (
    select o.id, o.user_id, o.product_name, o.product_code, o.amount,
      o.clothing, o.locker, o.pt_exercises, o.created_at, o.last_event_at,
      e.paid_at, s.fulfillment_state
    from public.center_payapp_orders o
    join public.center_payapp_history_evidence e on e.order_id = o.id
    join center_payment_private.order_statuses s on s.order_id = o.id
    where o.payment_state = 'paid' and s.fulfillment_state in ('pending', 'legacy')
  ), page as (
    select * from pending
    order by last_event_at desc, id desc offset p_offset limit 20
  )
  select jsonb_build_object(
    'ok', true, 'version', 1, 'total_count', (select count(*) from pending),
    'offset', p_offset, 'page_size', 20,
    'has_more', (select count(*) from pending) > p_offset + 20,
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'user_id', q.user_id,
      'member_name', coalesce(nullif(left(btrim(p.display_name), 100), ''),
        case when q.user_id is null then '탈퇴 회원' else '회원 정보 없음' end),
      'phone_last4', case when p.phone_last4 ~ '^[0-9]{4}$' then p.phone_last4 else '' end,
      'product_name', q.product_name, 'product_code', q.product_code,
      'amount', q.amount, 'payment_state', 'paid', 'application_state', q.fulfillment_state,
      'options', jsonb_build_object('clothing', q.clothing, 'locker', q.locker),
      'pt_exercises', case when q.product_code = 'one-day-pt' then (
        select coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(x.value->>'name', ''), 100))
          order by x.ord) filter (where x.ord <= 5), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(q.pt_exercises) = 'array'
          then q.pt_exercises else '[]'::jsonb end) with ordinality as x(value, ord)
      ) else '[]'::jsonb end,
      'requested_at', q.created_at, 'paid_at', q.paid_at
    ) order by q.last_event_at desc, q.id desc)
    from page q left join public.profiles p on p.id = q.user_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_workspace_payment_queue(uuid, integer) from public, anon, service_role;
grant execute on function public.admin_workspace_payment_queue(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
commit;

select
  to_regprocedure('public.admin_workspace_payment_queue(uuid,integer)') is not null as payment_queue_ready,
  has_function_privilege('authenticated', 'public.admin_workspace_payment_queue(uuid,integer)', 'execute') as authenticated_rpc_ready,
  not has_function_privilege('anon', 'public.admin_workspace_payment_queue(uuid,integer)', 'execute') as anonymous_blocked;
