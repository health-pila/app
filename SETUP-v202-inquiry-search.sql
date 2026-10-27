begin;

-- 기존 테이블/대화/RLS는 변경하지 않는 관리자 전용 조회 함수입니다.
create or replace function public.admin_search_inquiry_threads(
  p_query text,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_current_user_admin(), false) then
    raise exception '관리자만 문의를 검색할 수 있습니다.' using errcode = '42501';
  end if;
  if char_length(v_query) > 80 then
    raise exception '검색어는 80자 이내로 입력해 주세요.' using errcode = '22023';
  end if;
  if v_query = '' then
    return jsonb_build_object('inquiries', '[]'::jsonb, 'total_count', 0);
  end if;

  -- strpos로 검색어의 %, _, 따옴표도 검색 기호가 아닌 실제 글자로 처리합니다.
  with matched as materialized (
    select i.*,
      jsonb_build_object(
        'id', p.id, 'display_name', p.display_name,
        'email', p.email, 'phone_last4', p.phone_last4
      ) as member_profile
    from public.member_inquiries i
    left join public.profiles p on p.id = i.user_id
    where strpos(lower(coalesce(p.display_name, '')), v_query) > 0
       or strpos(coalesce(p.phone_last4, ''), v_query) > 0
       or strpos(lower(coalesce(i.title, '')), v_query) > 0
       or exists (
         select 1 from public.inquiry_messages m
         where m.inquiry_id = i.id
           and strpos(lower(m.body), v_query) > 0
       )
  ), page as (
    select * from matched
    order by last_message_at desc, id desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total_count', (select count(*) from matched),
    'inquiries', coalesce((
      select jsonb_agg(
        (to_jsonb(page) - 'member_profile') || jsonb_build_object(
          'memberProfile', page.member_profile,
          'latest_member_message', coalesce((
            select jsonb_build_array(jsonb_build_object('body', m.body))
            from public.inquiry_messages m
            where m.inquiry_id = page.id and m.sender_role = 'member'
            order by m.created_at desc, m.id desc
            limit 1
          ), '[]'::jsonb)
        ) order by page.last_message_at desc, page.id desc
      ) from page
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.admin_search_inquiry_threads(text, integer, integer) from public, anon;
grant execute on function public.admin_search_inquiry_threads(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
