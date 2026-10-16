-- v122 스트레칭 전용 저장소. Supabase SQL Editor에서 프로젝트를 확인한 뒤 한 번 실행합니다.
-- 기존 운동 루틴/회원/소식 테이블 및 정책은 변경하지 않습니다. 재실행해도 등록 영상은 유지됩니다.
begin;

create table if not exists public.stretching_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  video_id text not null unique check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stretching_videos_display_order_idx
  on public.stretching_videos (sort_order, created_at desc, id);

create or replace function public.stretching_videos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stretching_videos_updated_at on public.stretching_videos;
create trigger stretching_videos_updated_at
before update on public.stretching_videos
for each row execute function public.stretching_videos_set_updated_at();

alter table public.stretching_videos enable row level security;
revoke all on table public.stretching_videos from public;
revoke all on table public.stretching_videos from anon;
revoke all on table public.stretching_videos from authenticated;
grant select, insert, update, delete on table public.stretching_videos to authenticated;

-- 현재 로그인 계정의 profiles.role은 기존 앱과 같은 기준으로 확인합니다.
-- 이 테이블 전용 정책만 교체합니다. 다른 테이블의 권한/정책은 건드리지 않습니다.
drop policy if exists stretching_videos_read on public.stretching_videos;
create policy stretching_videos_read on public.stretching_videos
for select to authenticated
using (
  is_published = true
  or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists stretching_videos_insert on public.stretching_videos;
create policy stretching_videos_insert on public.stretching_videos
for insert to authenticated
with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
);

drop policy if exists stretching_videos_update on public.stretching_videos;
create policy stretching_videos_update on public.stretching_videos
for update to authenticated
using (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
)
with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
);

drop policy if exists stretching_videos_delete on public.stretching_videos;
create policy stretching_videos_delete on public.stretching_videos
for delete to authenticated
using (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
);

-- API가 새 테이블을 바로 인식하도록 스키마 캐시를 갱신합니다.
notify pgrst, 'reload schema';
commit;
