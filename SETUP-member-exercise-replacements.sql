-- 회원별 운동 교체. 기존 루틴 JSON/회원/운동 기록은 수정하거나 삭제하지 않습니다.
-- 기존 member_routines에는 배정 버전을 기록하는 AFTER 트리거만 추가합니다.
begin;

do $$
begin
  if to_regclass('public.member_routines') is null then
    raise exception 'member_routines 테이블을 확인해 주세요.';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='member_routines'
      and column_name in ('id','user_id','routine_json','assigned_at','is_active')) <> 5 then
    raise exception 'member_routines 필수 열을 확인해 주세요. 기존 테이블은 변경하지 않았습니다.';
  end if;
end;
$$;

create table if not exists public.member_routine_revisions (
  routine_id text primary key,
  user_id uuid not null,
  revision uuid not null default gen_random_uuid(),
  changed_at timestamptz not null default now()
);
create table if not exists public.member_exercise_replacements (
  user_id uuid not null,
  routine_id text not null,
  routine_revision uuid not null,
  pattern_day integer not null check (pattern_day > 0),
  exercise_order integer not null check (exercise_order > 0),
  original_exercise_id text not null check (original_exercise_id ~ '^EX[0-9]{3,}$'),
  replacement_exercise_id text not null check (replacement_exercise_id ~ '^EX[0-9]{3,}$'),
  sets integer not null check (sets between 1 and 20),
  reps integer not null check (reps between 1 and 1000),
  rest_sec integer not null check (rest_sec between 0 and 3600),
  change_token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (user_id, routine_id, routine_revision, pattern_day, exercise_order),
  check (original_exercise_id <> replacement_exercise_id)
);

alter table public.member_routine_revisions enable row level security;
alter table public.member_exercise_replacements enable row level security;
revoke all on public.member_routine_revisions, public.member_exercise_replacements from public, anon, authenticated;
grant select on public.member_routine_revisions, public.member_exercise_replacements to authenticated;

drop policy if exists member_routine_revisions_own_read on public.member_routine_revisions;
create policy member_routine_revisions_own_read on public.member_routine_revisions
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists member_exercise_replacements_own_read on public.member_exercise_replacements;
create policy member_exercise_replacements_own_read on public.member_exercise_replacements
for select to authenticated using (user_id = (select auth.uid()));

-- 쓰기는 본인·현재 배정·운동 위치를 검사하는 아래 RPC만 허용합니다.
create or replace function public.track_member_routine_replacement_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_routine_revisions (routine_id,user_id,revision,changed_at)
  values (new.id::text,new.user_id,gen_random_uuid(),clock_timestamp())
  on conflict (routine_id) do update set user_id=excluded.user_id,revision=excluded.revision,changed_at=excluded.changed_at;
  return new;
end;
$$;
revoke all on function public.track_member_routine_replacement_revision() from public, anon, authenticated;

drop trigger if exists track_member_routine_replacement_revision on public.member_routines;
create trigger track_member_routine_replacement_revision
  after insert or update of routine_json,assigned_at,is_active,user_id on public.member_routines
  for each row execute function public.track_member_routine_replacement_revision();

-- 기존 루틴을 보조 테이블에만 등록합니다. SQL 재실행 시 배정 버전/변경 내역을 유지합니다.
insert into public.member_routine_revisions (routine_id,user_id)
select id::text,user_id from public.member_routines
on conflict (routine_id) do nothing;

create or replace function public.get_member_exercise_replacements(p_routine_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_revision uuid;
  v_id text;
  v_source jsonb;
  v_rows jsonb;
begin
  if v_user is null then raise exception using errcode='42501', message='LOGIN_REQUIRED'; end if;
  select revision into v_revision from public.member_routine_revisions
    where routine_id=p_routine_id and user_id=v_user for share;
  if not found then raise exception using errcode='42501', message='ROUTINE_UNAVAILABLE'; end if;
  select id::text,to_jsonb(routine_json) into v_id,v_source from public.member_routines
    where user_id=v_user and is_active=true
    order by assigned_at desc nulls last,id desc limit 1;
  if v_id is distinct from p_routine_id or v_source is null then
    raise exception using errcode='P0001', message='ROUTINE_CHANGED';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pattern_day,x.exercise_order),'[]'::jsonb) into v_rows
    from public.member_exercise_replacements x
    where x.user_id=v_user and x.routine_id=p_routine_id and x.routine_revision=v_revision;
  return jsonb_build_object('routine_id',v_id,'revision',v_revision,'source_json',v_source,'replacements',v_rows);
end;
$$;
revoke all on function public.get_member_exercise_replacements(text) from public, anon, authenticated;
grant execute on function public.get_member_exercise_replacements(text) to authenticated;

create or replace function public.set_member_exercise_replacement(
  p_routine_id text, p_revision uuid, p_day integer, p_order integer,
  p_original_id text, p_replacement_id text, p_sets integer, p_reps integer, p_rest_sec integer,
  p_expected_token uuid default null, p_restore boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_revision uuid;
  v_id text;
  v_source jsonb;
  v_original text;
  v_token uuid;
  v_saved public.member_exercise_replacements%rowtype;
begin
  if v_user is null then raise exception using errcode='42501', message='LOGIN_REQUIRED'; end if;
  -- 같은 루틴의 교체/복원을 직렬화해 다른 기기의 변경을 덮어쓰지 않습니다.
  select revision into v_revision from public.member_routine_revisions
    where routine_id=p_routine_id and user_id=v_user for update;
  if not found then raise exception using errcode='42501', message='ROUTINE_UNAVAILABLE'; end if;
  if v_revision is distinct from p_revision then raise exception using errcode='P0001', message='ROUTINE_CHANGED'; end if;
  select id::text,to_jsonb(routine_json) into v_id,v_source from public.member_routines
    where user_id=v_user and is_active=true
    order by assigned_at desc nulls last,id desc limit 1;
  if v_id is distinct from p_routine_id or v_source is null then
    raise exception using errcode='P0001', message='ROUTINE_CHANGED';
  end if;
  select e->>'exerciseId' into v_original
    from jsonb_array_elements(v_source->'days') d
    cross join lateral jsonb_array_elements(d->'exercises') e
    where d->>'day'=p_day::text and e->>'order'=p_order::text;
  if v_original is null or v_original is distinct from p_original_id then
    raise exception using errcode='22023', message='INVALID_EXERCISE_SLOT';
  end if;
  select change_token into v_token from public.member_exercise_replacements
    where user_id=v_user and routine_id=p_routine_id and routine_revision=p_revision
      and pattern_day=p_day and exercise_order=p_order;
  if v_token is distinct from p_expected_token then
    raise exception using errcode='P0001', message='REPLACEMENT_CONFLICT';
  end if;
  if p_restore then
    delete from public.member_exercise_replacements
      where user_id=v_user and routine_id=p_routine_id and routine_revision=p_revision
        and pattern_day=p_day and exercise_order=p_order;
    return jsonb_build_object('restored',true);
  end if;
  -- exercise-data.js의 enabled=true인 운동 목록. 새 종목 추가 시 이 목록도 함께 갱신합니다.
  if p_replacement_id is null or p_replacement_id not in ('EX001','EX002','EX003','EX004','EX005','EX006','EX007','EX008','EX009','EX010','EX011','EX012','EX013','EX014','EX015','EX016','EX017','EX018','EX019','EX020','EX021','EX022','EX023','EX024','EX025','EX026','EX027','EX028','EX029','EX030','EX031','EX032','EX033','EX034','EX035','EX036','EX037','EX038','EX039') or p_replacement_id=v_original
     or p_sets is null or p_sets not between 1 and 20
     or p_reps is null or p_reps not between 1 and 1000
     or p_rest_sec is null or p_rest_sec not between 0 and 3600 then
    raise exception using errcode='22023', message='INVALID_REPLACEMENT';
  end if;
  insert into public.member_exercise_replacements
    (user_id,routine_id,routine_revision,pattern_day,exercise_order,original_exercise_id,replacement_exercise_id,sets,reps,rest_sec)
  values (v_user,p_routine_id,p_revision,p_day,p_order,v_original,p_replacement_id,p_sets,p_reps,p_rest_sec)
  on conflict (user_id,routine_id,routine_revision,pattern_day,exercise_order) do update
    set replacement_exercise_id=excluded.replacement_exercise_id,sets=excluded.sets,reps=excluded.reps,
        rest_sec=excluded.rest_sec,change_token=gen_random_uuid(),updated_at=clock_timestamp()
  returning * into v_saved;
  return jsonb_build_object('restored',false,'replacement',to_jsonb(v_saved));
end;
$$;
revoke all on function public.set_member_exercise_replacement(text,uuid,integer,integer,text,text,integer,integer,integer,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_member_exercise_replacement(text,uuid,integer,integer,text,text,integer,integer,integer,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
