-- v206: 회원별 스트레칭 Pick만 새로 저장합니다.
-- 기존 회원/영상/루틴/운동 기록의 데이터와 정책은 변경하지 않습니다.
-- 같은 이름의 테이블이 이미 있다면 중단합니다. 기존 정의를 덮어쓰지 않습니다.
begin;

create table public.stretching_video_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  stretching_video_id uuid not null references public.stretching_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, stretching_video_id)
);

create index stretching_video_picks_video_idx
  on public.stretching_video_picks (stretching_video_id);

alter table public.stretching_video_picks enable row level security;
revoke all on table public.stretching_video_picks from public, anon, authenticated;
grant select, insert, delete on table public.stretching_video_picks to authenticated;

create policy stretching_video_picks_read_own
on public.stretching_video_picks
for select to authenticated
using ((select auth.uid()) = user_id);

create policy stretching_video_picks_insert_own
on public.stretching_video_picks
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stretching_videos v
    where v.id = stretching_video_id and v.is_published = true
  )
);

create policy stretching_video_picks_delete_own
on public.stretching_video_picks
for delete to authenticated
using ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
commit;

-- 예상: rls_enabled=true, policy_count=3, anon_can_read=false,
--       member_can_update=false
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'stretching_video_picks') as policy_count,
  has_table_privilege('anon', 'public.stretching_video_picks', 'select') as anon_can_read,
  has_table_privilege('authenticated', 'public.stretching_video_picks', 'update') as member_can_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'stretching_video_picks';
