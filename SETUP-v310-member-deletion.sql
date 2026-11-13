-- v310: administrator-only app account deletion foundation.
-- Installing this file does NOT delete a member or any stored file.
-- Storage bytes are removed by the Edge Function, never by SQL.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create schema if not exists center_deletion_private;
revoke all on schema center_deletion_private from public,anon,authenticated,service_role;
create table if not exists center_deletion_private.jobs (
  user_id uuid primary key,
  operation_id uuid not null unique default gen_random_uuid(),
  phase text not null default 'files' check(phase in ('files','auth')),
  identity_snapshot jsonb not null,
  fingerprint text not null,
  naver_subjects text[] not null default '{}',
  started_at timestamptz not null default now()
);
alter table center_deletion_private.jobs enable row level security;
revoke all on center_deletion_private.jobs from public,anon,authenticated,service_role;

-- Fixed allowlist from the v310 schema inspection. No client-supplied SQL names.
create or replace function center_deletion_private.scopes()
returns table(s text,t text,c text) language sql immutable set search_path='' as $$
 values
 ('routine_application_private','submissions','user_id'),
 ('routine_application_private','assignment_goals','user_id'),
 ('routine_application_private','applications','user_id'),
 ('routine_form_private','response_goals','user_id'),
 ('routine_form_private','receipts','user_id'),
 ('center_payment_private','admin_notice_reads','admin_id'),
 ('center_usage_private','batches','user_id'),
 ('center_usage_private','daily','user_id'),
 ('center_usage_private','excluded','user_id'),
 ('center_usage_private','report_daily','user_id'),
 ('center_access_private','member_restrictions','user_id'),
 ('center_admin_private','signup_legacy_pending','member_id'),
 ('center_admin_private','signup_legacy_members','member_id'),
 ('center_admin_private','signup_reads','member_id'),
 ('broj_private','attendance_events','user_id'),
 ('broj_private','member_sync_state','user_id'),
 ('broj_private','membership_snapshots','user_id'),
 ('broj_private','member_links','user_id'),
 ('public','member_custom_exercises','user_id'),
 ('public','member_exercise_replacements','user_id'),
 ('public','member_pattern_added_exercises','user_id'),
 ('public','member_routine_revisions','user_id'),
 ('public','member_tutorial_exercise_replacements','user_id'),
 ('public','stretching_video_picks','user_id'),
 ('public','workout_records','user_id'),
 ('public','member_community_reads','user_id'),
 ('public','inquiry_messages','sender_id'),
 ('public','member_inquiries','user_id'),
 ('public','one_day_pt_requests','user_id'),
 ('public','routine_requests','user_id'),
 ('public','member_routines','user_id'),
 ('public','center_payapp_orders','user_id'),
 ('public','profiles','id')
$$;

create or replace function center_deletion_private.assert_admin(a uuid,u uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then
  raise exception 'SERVER_ONLY' using errcode='42501';
 end if;
 if a is null or u is null or a=u or not exists(
  select 1 from public.profiles p join auth.users x on x.id=p.id where p.id=a and p.role='admin'
 ) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if exists(select 1 from public.profiles where id=u and role is distinct from 'member') then
  raise exception 'MEMBER_ONLY' using errcode='42501';
 end if;
end $$;

create or replace function center_deletion_private.user_active(u uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select u is not null and exists(select 1 from public.profiles p join auth.users a on a.id=p.id where p.id=u)
 and not exists(select 1 from center_deletion_private.jobs j where j.user_id=u)
$$;
create or replace function public.center_account_active_v310()
returns boolean language sql stable security definer set search_path='' as $$
 select center_deletion_private.user_active((select auth.uid()))
$$;
revoke all on function public.center_account_active_v310() from public,anon,authenticated,service_role;
grant execute on function public.center_account_active_v310() to authenticated,service_role;

-- Keep the original access rules, adding the deletion check at the same function
-- OIDs used by the existing guarded member RPCs and PayApp server.
do $$
declare d text; b text;
begin
 if to_regprocedure('center_deletion_private.base_member_features_allowed()') is null then
  d:=pg_get_functiondef('public.center_member_features_allowed()'::regprocedure);
  b:=replace(d,'FUNCTION public.center_member_features_allowed()',
                'FUNCTION center_deletion_private.base_member_features_allowed()');
  if b=d then raise exception 'ACCESS_HELPER_DEFINITION_MISMATCH'; end if;
  execute b;
 end if;
 if to_regprocedure('center_deletion_private.base_service_member_features_allowed(uuid)') is null then
  d:=pg_get_functiondef('public.center_service_member_features_allowed(uuid)'::regprocedure);
  b:=replace(d,'FUNCTION public.center_service_member_features_allowed(',
                'FUNCTION center_deletion_private.base_service_member_features_allowed(');
  if b=d then raise exception 'SERVICE_HELPER_DEFINITION_MISMATCH'; end if;
  execute b;
 end if;
end $$;
create or replace function public.center_member_features_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select center_deletion_private.user_active((select auth.uid()))
 and center_deletion_private.base_member_features_allowed()
$$;
create or replace function public.center_service_member_features_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.role())='service_role'
 and center_deletion_private.user_active(p_user_id)
 and center_deletion_private.base_service_member_features_allowed(p_user_id)
$$;
revoke all on function public.center_service_member_features_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.center_service_member_features_allowed(uuid) to service_role;

-- Serialize member writes against begin-deletion, including SECURITY DEFINER
-- writes, background CRM sync and routines uploaded by an administrator.
create or replace function center_deletion_private.guard_member_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; ids uuid[]; v text;
begin
 v:=to_jsonb(new)->>tg_argv[0];
 if v is not null then ids:=array[v::uuid]; end if;
 if tg_op='UPDATE' then
  v:=to_jsonb(old)->>tg_argv[0];
  if v is not null then ids:=array_append(ids,v::uuid); end if;
 end if;
 for u in select distinct x from unnest(ids) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||u::text,0));
  if exists(select 1 from center_deletion_private.jobs where user_id=u)
     or not exists(select 1 from auth.users where id=u) then
   raise exception 'APP_ACCOUNT_DELETING' using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
create or replace function center_deletion_private.guard_storage_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare v text; u uuid; x jsonb;
begin
 for x in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
  for v in select x->>'owner' union select x->>'owner_id' union select split_part(x->>'name','/',1) loop
   if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    u:=v::uuid;
    perform pg_advisory_xact_lock(hashtextextended('account-delete:'||u::text,0));
    if exists(select 1 from center_deletion_private.jobs where user_id=u)
       or not exists(select 1 from auth.users where id=u) then
     raise exception 'APP_ACCOUNT_DELETING' using errcode='42501';
    end if;
   end if;
  end loop;
 end loop;
 return new;
end $$;
do $$
declare r record;
begin
 for r in select * from center_deletion_private.scopes() loop
  if not exists(select 1 from information_schema.columns where table_schema=r.s and table_name=r.t and column_name=r.c and udt_name='uuid') then
   raise exception 'SCHEMA_MISMATCH: %.%.%',r.s,r.t,r.c;
  end if;
  execute format('drop trigger if exists center_delete_guard_v310 on %I.%I',r.s,r.t);
  execute format('create trigger center_delete_guard_v310 before insert or update on %I.%I for each row execute function center_deletion_private.guard_member_write(%L)',r.s,r.t,r.c);
  if r.s='public' then
   if not (select relrowsecurity from pg_class where oid=format('%I.%I',r.s,r.t)::regclass) then raise exception 'EXPECTED_RLS: %',r.t; end if;
   execute format('drop policy if exists center_delete_guard_v310 on %I.%I',r.s,r.t);
   execute format('create policy center_delete_guard_v310 on %I.%I as restrictive for all to authenticated using ((select public.center_account_active_v310())) with check ((select public.center_account_active_v310()))',r.s,r.t);
  end if;
 end loop;
end $$;
drop trigger if exists center_delete_guard_v310 on storage.objects;
create trigger center_delete_guard_v310 before insert or update on storage.objects for each row execute function center_deletion_private.guard_storage_write();
drop policy if exists center_delete_guard_v310 on storage.objects;
create policy center_delete_guard_v310 on storage.objects as restrictive for all to authenticated
 using((select public.center_account_active_v310())) with check((select public.center_account_active_v310()));

create or replace function center_deletion_private.counts(u uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; n bigint; result jsonb:='{}';
begin
 for r in select * from center_deletion_private.scopes() loop
  execute format('select count(*) from %I.%I where %I=$1',r.s,r.t,r.c) into n using u;
  result:=result||jsonb_build_object(r.s||'.'||r.t,n);
 end loop;
 return result;
end $$;
create or replace function center_deletion_private.media(u uuid)
returns table(bucket_id text,name text,blocked boolean) language sql stable security definer set search_path='' as $$
 with refs as (
  select 'workout-photos'::text b,photo_path n,user_id from public.workout_records where photo_path is not null
  union all select 'routine-images',routine_image_path,user_id from public.member_routines where routine_image_path is not null
  union all select 'routine-images',e->>'image_path',r.user_id from public.member_routines r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.routine_images)='array' then r.routine_images else '[]' end) e
    where e->>'image_path' is not null
 ), candidates as (
  select o.* from storage.objects o where o.owner=u or o.owner_id=u::text
   or (o.bucket_id in ('workout-photos','routine-images') and lower(split_part(o.name,'/',1))=u::text)
   or exists(select 1 from refs r where r.user_id=u and r.b=o.bucket_id and r.n=o.name)
 )
 select o.bucket_id,o.name,
  o.bucket_id not in ('workout-photos','routine-images')
  or not (coalesce(o.owner=u,false) or coalesce(o.owner_id=u::text,false) or coalesce(lower(split_part(o.name,'/',1))=u::text,false))
  or exists(select 1 from refs r where r.user_id<>u and r.b=o.bucket_id and r.n=o.name)
  or coalesce(o.is_versioned,false) or coalesce(o.is_delete_marker,false) or o.archived_at is not null
 from candidates o
$$;
create or replace function center_deletion_private.open_payments(u uuid)
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.center_payapp_orders where user_id=u
 and request_status in ('creating','ready','uncertain') and payment_state in ('requested','pending')
$$;

create or replace function public.admin_member_deletion_preview_v310(p_admin_user_id uuid,p_member_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare j center_deletion_private.jobs; ident jsonb; subjects text[]; fingerprint text; files bigint; blocked bigint; counts jsonb;
begin
 perform center_deletion_private.assert_admin(p_admin_user_id,p_member_user_id);
 select * into j from center_deletion_private.jobs where user_id=p_member_user_id;
 select jsonb_build_object('id',p.id,'name',coalesce(p.display_name,''),'last4',coalesce(p.phone_last4,''),'email',coalesce(p.email,'')) into ident
 from public.profiles p join auth.users a on a.id=p.id where p.id=p_member_user_id and p.role='member';
 if ident is null and j.user_id is null then raise exception 'MEMBER_NOT_FOUND' using errcode='P0002'; end if;
 ident:=coalesce(ident,j.identity_snapshot);
 fingerprint:=coalesce(j.fingerprint,md5(ident::text));
 counts:=center_deletion_private.counts(p_member_user_id);
 select count(*),count(*) filter(where m.blocked) into files,blocked from center_deletion_private.media(p_member_user_id) m;
 return jsonb_build_object('ok',true,'member',ident,'fingerprint',fingerprint,'phase',coalesce(j.phase,'preview'),
  'operation_id',j.operation_id,'counts',counts,'files',files,'blocked_files',blocked,
  'open_payments',center_deletion_private.open_payments(p_member_user_id));
end $$;

create or replace function public.admin_member_deletion_pending_v310(p_admin_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare entries jsonb; total bigint;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
 if p_admin_user_id is null or not exists(select 1 from public.profiles p join auth.users a on a.id=p.id where p.id=p_admin_user_id and p.role='admin') then
  raise exception 'ADMIN_REQUIRED' using errcode='42501';
 end if;
 select count(*) into total from center_deletion_private.jobs;
 select coalesce(jsonb_agg(jsonb_build_object('member',j.identity_snapshot,'operation_id',j.operation_id,'phase',j.phase) order by j.started_at),'[]') into entries
 from (select * from center_deletion_private.jobs order by started_at,user_id limit 100) j;
 return jsonb_build_object('ok',true,'entries',entries,'total',total);
end $$;

create or replace function public.admin_member_deletion_begin_v310(p_admin_user_id uuid,p_member_user_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare preview jsonb; j center_deletion_private.jobs; subjects text[];
begin
 perform center_deletion_private.assert_admin(p_admin_user_id,p_member_user_id);
 perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_member_user_id::text,0));
 perform 1 from public.profiles where id=p_member_user_id for update;
 preview:=public.admin_member_deletion_preview_v310(p_admin_user_id,p_member_user_id);
 if p_fingerprint is distinct from preview->>'fingerprint' then raise exception 'MEMBER_CHANGED'; end if;
 if (preview->>'open_payments')::bigint>0 then raise exception 'OPEN_PAYMENT_REQUEST'; end if;
 if (preview->>'blocked_files')::bigint>0 then raise exception 'MEDIA_REVIEW_REQUIRED'; end if;
 -- Naver custom-provider subjects come from this member's verified Auth identity.
 -- Never guess a subject from a name, phone number or email address.
 select coalesce(array_agg(distinct subject),'{}'::text[]) into subjects from (
  select unnest(array[i.provider_id,i.identity_data->>'sub']) subject from auth.identities i
   where i.user_id=p_member_user_id and i.provider='custom:naver'
 ) x where subject is not null and length(subject) between 1 and 512
 and not exists(select 1 from auth.identities other where other.user_id<>p_member_user_id
   and other.provider='custom:naver' and (other.provider_id=subject or other.identity_data->>'sub'=subject));
 insert into center_deletion_private.jobs(user_id,identity_snapshot,fingerprint,naver_subjects)
 values(p_member_user_id,preview->'member',p_fingerprint,subjects) on conflict(user_id) do nothing;
 select * into j from center_deletion_private.jobs where user_id=p_member_user_id;
 return jsonb_build_object('ok',true,'operation_id',j.operation_id,'phase',j.phase);
end $$;

create or replace function public.admin_member_deletion_step_v310(p_admin_user_id uuid,p_member_user_id uuid,p_operation_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare j center_deletion_private.jobs; r record; items jsonb; n bigint; remaining jsonb;
begin
 perform center_deletion_private.assert_admin(p_admin_user_id,p_member_user_id);
 perform pg_advisory_xact_lock(hashtextextended('account-delete:'||p_member_user_id::text,0));
 select * into j from center_deletion_private.jobs where user_id=p_member_user_id for update;
 if j.user_id is null then
  if p_action='finish' and not exists(select 1 from auth.users where id=p_member_user_id)
    and not exists(select 1 from jsonb_each_text(center_deletion_private.counts(p_member_user_id)) x where x.value::bigint<>0)
    and not exists(select 1 from center_deletion_private.media(p_member_user_id)) then
   return jsonb_build_object('ok',true,'deleted',true);
  end if;
  raise exception 'DELETION_NOT_STARTED';
 end if;
 if p_operation_id is distinct from j.operation_id then raise exception 'OPERATION_MISMATCH' using errcode='42501'; end if;
 if p_action='manifest' then
  if exists(select 1 from center_deletion_private.media(p_member_user_id) where blocked) then raise exception 'MEDIA_REVIEW_REQUIRED'; end if;
  select count(*) into n from center_deletion_private.media(p_member_user_id);
  select coalesce(jsonb_agg(jsonb_build_object('bucket',m.bucket_id,'name',m.name)),'[]') into items
   from (select * from center_deletion_private.media(p_member_user_id) order by bucket_id,name limit 100) m;
  return jsonb_build_object('ok',true,'phase',j.phase,'remaining_files',n,'objects',items);
 elsif p_action='purge' then
  if exists(select 1 from center_deletion_private.media(p_member_user_id)) then raise exception 'FILES_REMAIN'; end if;
  if center_deletion_private.open_payments(p_member_user_id)>0 then raise exception 'OPEN_PAYMENT_REQUEST'; end if;
  -- Explicitly covers the seven tables without member FKs and order records
  -- whose original FK uses SET NULL. Child evidence/chat rows cascade normally.
  -- Keep the profile until Auth Admin deleteUser succeeds. Staff can still find
  -- a pending account if the Auth API is temporarily unavailable.
  for r in select * from center_deletion_private.scopes() where not(s='public' and t='profiles') loop
   execute format('delete from %I.%I where %I=$1',r.s,r.t,r.c) using p_member_user_id;
  end loop;
  delete from naver_auth_private.profile_proofs where subject=any(j.naver_subjects);
  delete from naver_auth_private.connection_states where subject=any(j.naver_subjects);
  remaining:=center_deletion_private.counts(p_member_user_id);
  if exists(select 1 from jsonb_each_text(remaining) x where x.key<>'public.profiles' and x.value::bigint<>0) then raise exception 'APP_DATA_REMAIN'; end if;
  update center_deletion_private.jobs set phase='auth' where user_id=p_member_user_id;
  return jsonb_build_object('ok',true,'phase','auth');
 elsif p_action='finish' then
  if j.phase<>'auth' or exists(select 1 from auth.users where id=p_member_user_id)
    or exists(select 1 from center_deletion_private.media(p_member_user_id))
    or exists(select 1 from jsonb_each_text(center_deletion_private.counts(p_member_user_id)) x where x.value::bigint<>0)
    or exists(select 1 from naver_auth_private.profile_proofs where subject=any(j.naver_subjects))
    or exists(select 1 from naver_auth_private.connection_states where subject=any(j.naver_subjects)) then raise exception 'DELETION_INCOMPLETE'; end if;
  delete from center_deletion_private.jobs where user_id=p_member_user_id;
  return jsonb_build_object('ok',true,'deleted',true);
 end if;
 raise exception 'INVALID_ACTION';
end $$;

-- PayApp verifies the provider signature before calling this server-only RPC.
-- A late refund callback for a purged order is acknowledged without recreating
-- payment data. Present orders retain all account/nonce/amount/state checks.
create or replace function public.record_center_payapp_event_v284(
 p_account_code text,p_order_id uuid,p_nonce uuid,p_provider_ref text,
 p_amount integer,p_state integer,p_event_at bigint,p_paid_at timestamptz default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare order_account text; accepted boolean;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'server only' using errcode='42501'; end if;
 if p_account_code is null or p_account_code not in ('legacy','next') then raise exception 'invalid payment account'; end if;
 select provider_account into order_account from public.center_payapp_orders where id=p_order_id for update;
 if not found then return false; end if;
 if order_account is distinct from p_account_code then raise exception 'payment account mismatch'; end if;
 select public.record_center_payapp_event_v231(p_order_id,p_nonce,p_provider_ref,p_amount,p_state,p_event_at,p_paid_at) into accepted;
 return accepted;
end $$;

revoke all on all functions in schema center_deletion_private from public,anon,authenticated,service_role;
revoke all on function public.admin_member_deletion_preview_v310(uuid,uuid),
 public.admin_member_deletion_pending_v310(uuid),public.admin_member_deletion_begin_v310(uuid,uuid,text),public.admin_member_deletion_step_v310(uuid,uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_member_deletion_preview_v310(uuid,uuid),
 public.admin_member_deletion_pending_v310(uuid),public.admin_member_deletion_begin_v310(uuid,uuid,text),public.admin_member_deletion_step_v310(uuid,uuid,uuid,text) to service_role;
revoke all on function public.record_center_payapp_event_v284(text,uuid,uuid,text,integer,integer,bigint,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.record_center_payapp_event_v284(text,uuid,uuid,text,integer,integer,bigint,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;

select
 to_regclass('center_deletion_private.jobs') is not null as deletion_queue_ready,
 has_function_privilege('service_role','public.admin_member_deletion_preview_v310(uuid,uuid)','execute') as server_preview_ready,
 has_function_privilege('service_role','public.admin_member_deletion_begin_v310(uuid,uuid,text)','execute') as server_delete_ready,
 not has_function_privilege('authenticated','public.admin_member_deletion_begin_v310(uuid,uuid,text)','execute') as member_direct_delete_blocked,
 not has_function_privilege('anon','public.admin_member_deletion_preview_v310(uuid,uuid)','execute') as anonymous_blocked,
 (select count(*) from pg_trigger where tgname='center_delete_guard_v310' and not tgisinternal)=34 as write_guards_ready,
 (select count(*) from center_deletion_private.jobs)=0 as no_deletion_started;
