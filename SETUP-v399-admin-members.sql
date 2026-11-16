-- v399: restricted-member filter and administrator-only gym expiry history.
-- Run after the existing access, Broj membership and v345 installations.
-- Existing membership collection, classification and access restrictions are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
 if to_regprocedure('public.center_admin_member_access(uuid)') is null
 or to_regprocedure('center_deletion_private.user_active(uuid)') is null
 or to_regprocedure('public.broj_reserve_api_call(text)') is null
 or to_regclass('broj_private.member_links') is null then
  raise exception 'V399_REQUIRED_INSTALLATION_MISSING';
 end if;
end $$;
create schema if not exists center_admin_history_private;
revoke all on schema center_admin_history_private from public,anon,authenticated,service_role;

create or replace function center_admin_history_private.assert_admin(a uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if a is null or not center_deletion_private.user_active(a)
 or not exists(select 1 from public.profiles where id=a and role='admin') then
  raise exception 'ADMIN_REQUIRED' using errcode='42501';
 end if;
end $$;
create or replace function center_admin_history_private.assert_server()
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
end $$;

-- Reuse the exact access decision shown in the selected member panel.
-- One browser request, no assumptions about the private restriction table layout.
create or replace function public.center_admin_restricted_members_v399(p_expected_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare r record; s jsonb; ids jsonb:='[]';
begin
 if (select auth.uid()) is distinct from p_expected_admin_id then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 perform center_admin_history_private.assert_admin(p_expected_admin_id);
 for r in select id from public.profiles where role='member' and center_deletion_private.user_active(id) order by id loop
  begin
   s:=public.center_admin_member_access(r.id)::jsonb;
   if s->>'user_id' is distinct from r.id::text or jsonb_typeof(s->'restricted') is distinct from 'boolean' then
    raise exception 'MEMBER_ACCESS_INVALID';
   end if;
   if s->>'restricted'='true' then ids:=ids||jsonb_build_array(r.id); end if;
  exception when no_data_found then null; end;
 end loop;
 return jsonb_build_object('ok',true,'version',399,'restricted_ids',ids,'checked_at',now());
end $$;

create table if not exists center_admin_history_private.gym_dates (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 group_id text not null check(group_id='01M67C55ZHBYVAZDVA8E1V56MK'),
 crm_member_id text not null,
 gym jsonb,
 synced_at timestamptz,
 attempted_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 check(gym is null or jsonb_typeof(gym)='object' and octet_length(gym::text)<=8192),
 check(synced_at is null or isfinite(synced_at)),
 check(isfinite(attempted_at)),
 check(lease_until is null or isfinite(lease_until))
);
alter table center_admin_history_private.gym_dates enable row level security;
alter table center_admin_history_private.gym_dates force row level security;
revoke all on center_admin_history_private.gym_dates from public,anon,authenticated,service_role;
drop trigger if exists center_delete_guard_v399 on center_admin_history_private.gym_dates;
create trigger center_delete_guard_v399 before insert or update on center_admin_history_private.gym_dates
 for each row execute function center_deletion_private.guard_member_write('user_id');

create or replace function center_admin_history_private.payload(u uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'version',399,'user_id',s.user_id,'gym',s.gym,'synced_at',s.synced_at)
 from center_admin_history_private.gym_dates s where user_id=u
$$;

create or replace function public.center_admin_history_begin_v399(p_admin_id uuid,p_user_id uuid,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='5s' as $$
declare crm text; s center_admin_history_private.gym_dates; v_now timestamptz:=clock_timestamp(); v_lease uuid:=gen_random_uuid();
begin
 perform center_admin_history_private.assert_server();
 perform center_admin_history_private.assert_admin(p_admin_id);
 if p_user_id is null or not center_deletion_private.user_active(p_user_id)
 or not exists(select 1 from public.profiles where id=p_user_id and role='member') then raise exception 'MEMBER_UNAVAILABLE' using errcode='P0002'; end if;
 if not coalesce((select enabled from broj_private.sync_settings where singleton),false) then
  return jsonb_build_object('started',false,'code','SYNC_DISABLED'); end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-gym-history:'||p_user_id::text,0));
 select crm_member_id into crm from broj_private.member_links
 where user_id=p_user_id and group_id='01M67C55ZHBYVAZDVA8E1V56MK';
 if crm is null then return jsonb_build_object('started',false,'code','NOT_LINKED'); end if;
 select * into s from center_admin_history_private.gym_dates where user_id=p_user_id for update;
 if s.crm_member_id is not distinct from crm and not coalesce(p_force,false) and s.gym is not null
 and s.synced_at>=v_now-interval '6 hours' and s.synced_at<=v_now+interval '1 minute'
 and (s.synced_at at time zone 'Asia/Seoul')::date=(v_now at time zone 'Asia/Seoul')::date then
  return jsonb_build_object('started',false,'code','CACHED','result',center_admin_history_private.payload(p_user_id)); end if;
 if s.lease_until>v_now then return jsonb_build_object('started',false,'code','BUSY','retry_after_seconds',5); end if;
 if s.attempted_at>v_now-interval '60 seconds' then
  return jsonb_build_object('started',false,'code','COOLDOWN','retry_after_seconds',greatest(1,ceil(extract(epoch from s.attempted_at+interval '60 seconds'-v_now))::int)); end if;
 insert into center_admin_history_private.gym_dates(user_id,group_id,crm_member_id,attempted_at,lease_id,lease_until)
 values(p_user_id,'01M67C55ZHBYVAZDVA8E1V56MK',crm,v_now,v_lease,v_now+interval '2 minutes')
 on conflict(user_id) do update set group_id=excluded.group_id,crm_member_id=excluded.crm_member_id,
  gym=case when gym_dates.crm_member_id=excluded.crm_member_id then gym_dates.gym else null end,
  synced_at=case when gym_dates.crm_member_id=excluded.crm_member_id then gym_dates.synced_at else null end,
  attempted_at=excluded.attempted_at,lease_id=excluded.lease_id,lease_until=excluded.lease_until;
 return jsonb_build_object('started',true,'user_id',p_user_id,'group_id','01M67C55ZHBYVAZDVA8E1V56MK','member_id',crm,'lease_id',v_lease);
end $$;

create or replace function public.center_admin_history_commit_v399(p_admin_id uuid,p_user_id uuid,p_lease_id uuid,p_gym jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='5s' as $$
declare k text; d date; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 perform center_admin_history_private.assert_server(); perform center_admin_history_private.assert_admin(p_admin_id);
 if p_user_id is null or not center_deletion_private.user_active(p_user_id)
 or not exists(select 1 from public.profiles where id=p_user_id and role='member') then raise exception 'MEMBER_UNAVAILABLE' using errcode='P0002'; end if;
 if p_gym is null or jsonb_typeof(p_gym)<>'object'
 or not p_gym ?& array['current_end_at','previous_end_at','scheduled_end_at','uncertain']
 or exists(select 1 from jsonb_object_keys(p_gym) f where f not in ('current_end_at','previous_end_at','scheduled_end_at','uncertain'))
 or jsonb_typeof(p_gym->'uncertain') is distinct from 'boolean'
 or jsonb_typeof(p_gym->'scheduled_end_at') is distinct from 'array'
 or jsonb_array_length(p_gym->'scheduled_end_at')>200 or octet_length(p_gym::text)>8192 then
  raise exception 'INVALID_GYM_DATES' using errcode='22023'; end if;
 foreach k in array array['current_end_at','previous_end_at'] loop
  if p_gym->>k is not null then
   if jsonb_typeof(p_gym->k)<>'string' or p_gym->>k !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_GYM_DATES' using errcode='22023'; end if;
   d:=(p_gym->>k)::date;
   if k='previous_end_at' and d>=today or k='current_end_at' and d<today then raise exception 'INVALID_GYM_DATES' using errcode='22023'; end if;
  end if;
 end loop;
 for k in select jsonb_array_elements_text(p_gym->'scheduled_end_at') loop
  if k is null or k !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or k::date<today then raise exception 'INVALID_GYM_DATES' using errcode='22023'; end if;
 end loop;
 update center_admin_history_private.gym_dates s set gym=p_gym,synced_at=clock_timestamp(),lease_id=null,lease_until=null
 where s.user_id=p_user_id and s.lease_id=p_lease_id and s.lease_until>clock_timestamp()
 and exists(select 1 from broj_private.member_links l where l.user_id=s.user_id and l.group_id=s.group_id and l.crm_member_id=s.crm_member_id);
 if not found then raise exception 'HISTORY_CHANGED' using errcode='40001'; end if;
 return center_admin_history_private.payload(p_user_id);
end $$;

create or replace function public.center_admin_history_cancel_v399(p_user_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform center_admin_history_private.assert_server();
 update center_admin_history_private.gym_dates set lease_id=null,lease_until=null
 where user_id=p_user_id and lease_id=p_lease_id;
end $$;

revoke all on all functions in schema center_admin_history_private from public,anon,authenticated,service_role;
revoke all on function public.center_admin_restricted_members_v399(uuid),
 public.center_admin_history_begin_v399(uuid,uuid,boolean),public.center_admin_history_commit_v399(uuid,uuid,uuid,jsonb),
 public.center_admin_history_cancel_v399(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.center_admin_restricted_members_v399(uuid) to authenticated;
grant execute on function public.center_admin_history_begin_v399(uuid,uuid,boolean),
 public.center_admin_history_commit_v399(uuid,uuid,uuid,jsonb),public.center_admin_history_cancel_v399(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
select 'v399 관리자 회원 조회 설정 완료' as result;
