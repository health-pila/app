-- 확인 SQL / 읽기 전용입니다. 설정이나 대화 원문을 변경하지 않습니다.
-- 회원이 삭제 처리한 문의별로 원문 개수와 원래 대화 날짜를 확인합니다.
-- 원문 본문·이메일·전체 전화번호는 조회하지 않습니다.
select
  i.id as inquiry_id,
  p.display_name as member_name,
  p.phone_last4,
  to_char(i.created_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as inquiry_created_kst,
  to_char(min(m.created_at) at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as first_message_kst,
  to_char(max(m.created_at) at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as last_message_kst,
  to_char(d.deleted_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') as member_deleted_kst,
  count(m.id)::integer as total_messages,
  count(m.id) filter(where m.sender_role='member')::integer as member_messages,
  count(m.id) filter(where m.sender_role='admin')::integer as admin_messages
from center_inquiry_retention_private.member_deletions d
join public.member_inquiries i on i.id=d.inquiry_id and i.user_id=d.user_id
left join public.profiles p on p.id=i.user_id
left join public.inquiry_messages m on m.inquiry_id=i.id
group by i.id, p.display_name, p.phone_last4, d.deleted_at
order by d.deleted_at desc, i.created_at, i.id;
