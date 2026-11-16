-- v398 / 관리자 서버 푸시 알림: 2단계 설정 SQL
-- 2026-11-16 확인 결과(PostgreSQL 17.6)에 맞춘 설치 파일입니다.
-- 기존 회원·문의·결제 데이터는 수정하지 않고 과거 알림도 전송하지 않습니다.
-- PC 알림은 Edge Function 배포 후 관리자가 직접 허용한 기기에서만 시작됩니다.
-- 키/토큰은 서버에서 생성하고 Vault에 보관합니다. 결과에 출력하지 않습니다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$ begin
 if (select count(*) from pg_catalog.pg_extension
     where extname in ('pg_net','pg_cron','pgcrypto','supabase_vault')) <> 4 then
  raise exception 'PUSH_REQUIRED_EXTENSION_MISSING';
 end if;
 if to_regprocedure('center_deletion_private.user_active(uuid)') is null
    or to_regprocedure('public.is_current_user_admin()') is null then
  raise exception 'PUSH_REQUIRED_ACCESS_HELPER_MISSING';
 end if;
end $$;

create schema if not exists center_push_private;
revoke all on schema center_push_private from public, anon, authenticated, service_role;

create table if not exists center_push_private.settings (
 singleton boolean primary key default true check (singleton),
 public_key text,
 private_key_secret uuid,
 dispatch_secret uuid not null,
 installed_at timestamptz not null default now(),
 check ((public_key is null) = (private_key_secret is null))
);
-- No rotation on repeated installation: existing browser subscriptions stay valid.
do $$ begin
 if not exists (select 1 from center_push_private.settings) then
  insert into center_push_private.settings(dispatch_secret)
  values (vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
    'center_admin_push_dispatch_v398','Administrator push dispatcher only'));
 end if;
end $$;

create table if not exists center_push_private.subscriptions (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check (length(endpoint) between 30 and 2048),
 p256dh text not null check (p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
 auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}$'),
 binding uuid not null,
 sound boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 test_at timestamptz,
 check (endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$')
);
create index if not exists center_push_subscriptions_admin on center_push_private.subscriptions(admin_id);
drop trigger if exists center_push_delete_guard on center_push_private.subscriptions;
create trigger center_push_delete_guard before insert or update on center_push_private.subscriptions
 for each row execute function center_deletion_private.guard_member_write('admin_id');

create table if not exists center_push_private.events (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique check (length(event_key) <= 220),
 kind text not null check (kind in ('signup','inquiry','routine','oneDayPt','payment','test')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '10 minutes'
);
create table if not exists center_push_private.deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references center_push_private.events(id) on delete cascade,
 subscription_id uuid not null references center_push_private.subscriptions(id) on delete cascade,
 attempts integer not null default 0 check (attempts between 0 and 5),
 next_attempt_at timestamptz not null default now(),
 lease_until timestamptz,
 lease_token uuid,
 sent_at timestamptz,
 last_status integer,
 unique(event_id, subscription_id)
);
create index if not exists center_push_delivery_pending on center_push_private.deliveries(next_attempt_at)
 where sent_at is null and attempts < 5;

do $$ declare t text; begin
 foreach t in array array['settings','subscriptions','events','deliveries'] loop
  execute format('alter table center_push_private.%I enable row level security',t);
  execute format('alter table center_push_private.%I force row level security',t);
  execute format('revoke all on center_push_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create or replace function center_push_private.assert_admin(expected uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid());
begin
 if u is null or expected is distinct from u
    or not public.is_current_user_admin()
    or not center_deletion_private.user_active(u) then
  raise exception 'PUSH_ADMIN_REQUIRED' using errcode = '42501';
 end if;
 return u;
end $$;

create or replace function center_push_private.assert_server()
returns void language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then
  raise exception 'PUSH_SERVER_ONLY' using errcode = '42501';
 end if;
end $$;

create or replace function center_push_private.wake()
returns void language plpgsql security definer set search_path = '' as $$
declare token text;
begin
 if not exists (select 1 from center_push_private.settings where public_key is not null)
    or not exists (
     select 1 from center_push_private.deliveries d
     join center_push_private.events e on e.id=d.event_id
     where d.sent_at is null and d.attempts < 5 and e.expires_at > now()
       and d.next_attempt_at <= now() and (d.lease_until is null or d.lease_until < now())
    ) then return; end if;
 select v.decrypted_secret into token from center_push_private.settings s
 join vault.decrypted_secrets v on v.id=s.dispatch_secret;
 if token is null then return; end if;
 perform net.http_post(
  url := 'https://cithfqbzszgiqjifhrqy.supabase.co/functions/v1/admin-web-push',
  headers := jsonb_build_object('Content-Type','application/json','x-center-dispatch',token),
  body := '{"action":"dispatch"}'::jsonb,
  timeout_milliseconds := 5000
 );
end $$;

create or replace function center_push_private.enqueue(k text, ek text, only_subscription uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
 -- Do not backfill events created before any PC has opted in.
 if not exists (select 1 from center_push_private.settings where public_key is not null)
    or not exists (select 1 from center_push_private.subscriptions s
      join public.profiles p on p.id=s.admin_id and p.role='admin'
      where s.updated_at > now()-interval '90 days'
        and (only_subscription is null or s.id=only_subscription)
        and center_deletion_private.user_active(s.admin_id)) then return; end if;
 insert into center_push_private.events(kind,event_key) values(k,ek)
 on conflict(event_key) do nothing returning id into event_id;
 if event_id is null then return; end if;
 insert into center_push_private.deliveries(event_id,subscription_id)
 select event_id,s.id from center_push_private.subscriptions s
 join public.profiles p on p.id=s.admin_id and p.role='admin'
 where s.updated_at > now()-interval '90 days'
   and (only_subscription is null or s.id=only_subscription)
   and center_deletion_private.user_active(s.admin_id);
 -- Queueing an HTTP request is asynchronous. Network failure never blocks a member write.
 begin perform center_push_private.wake(); exception when others then
  raise warning 'ADMIN_PUSH_WAKE_DEFERRED';
 end;
end $$;

create or replace function public.center_admin_push_register_v398(
 p_expected_admin_id uuid, p_subscription jsonb, p_binding uuid,
 p_public_key text, p_sound boolean default true
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; ep text := p_subscription->>'endpoint'; s center_push_private.subscriptions;
begin
 u:=center_push_private.assert_admin(p_expected_admin_id);
 if p_binding is null or p_sound is null or p_public_key is null
    or not exists(select 1 from center_push_private.settings where public_key=p_public_key) then
  raise exception 'PUSH_CONFIG_NOT_READY';
 end if;
 if ep is null or jsonb_typeof(p_subscription) is distinct from 'object'
    or length(p_subscription::text)>4096
    or p_subscription->'keys'->>'p256dh' is null
    or p_subscription->'keys'->>'auth' is null then raise exception 'PUSH_SUBSCRIPTION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-push:'||u::text,0));
 perform pg_advisory_xact_lock(hashtextextended('admin-push-endpoint:'||ep,0));
 select * into s from center_push_private.subscriptions where endpoint=ep;
 if s.id is not null and s.admin_id <> u then raise exception 'PUSH_ENDPOINT_IN_USE'; end if;
 if s.id is null and (select count(*) from center_push_private.subscriptions where admin_id=u) >= 10 then
  raise exception 'PUSH_DEVICE_LIMIT';
 end if;
 insert into center_push_private.subscriptions(admin_id,endpoint,p256dh,auth_key,binding,sound)
 values(u,ep,p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth',p_binding,p_sound)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,
  binding=excluded.binding,sound=excluded.sound,updated_at=now()
 returning * into s;
 return jsonb_build_object('ok',true,'id',s.id,'binding',s.binding,'sound',s.sound);
end $$;

create or replace function public.center_admin_push_state_v398(p_expected_admin_id uuid,p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; s center_push_private.subscriptions; pk text;
begin
 u:=center_push_private.assert_admin(p_expected_admin_id);
 select public_key into pk from center_push_private.settings;
 select * into s from center_push_private.subscriptions where admin_id=u and endpoint=p_endpoint;
 return jsonb_build_object('ok',true,'public_key',pk,'subscribed',
  s.id is not null and s.updated_at > now()-interval '90 days',
  'binding',s.binding,'sound',s.sound);
end $$;

create or replace function public.center_admin_push_disable_v398(p_expected_admin_id uuid,p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
 u:=center_push_private.assert_admin(p_expected_admin_id);
 delete from center_push_private.subscriptions where admin_id=u and endpoint=p_endpoint;
 return '{"ok":true}'::jsonb;
end $$;

create or replace function public.center_admin_push_sound_v398(p_expected_admin_id uuid,p_endpoint text,p_sound boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
 u:=center_push_private.assert_admin(p_expected_admin_id);
 if p_sound is null then raise exception 'PUSH_SOUND_INVALID'; end if;
 update center_push_private.subscriptions set sound=p_sound,updated_at=now()
 where admin_id=u and endpoint=p_endpoint;
 return jsonb_build_object('ok',found);
end $$;

create or replace function public.center_admin_push_test_v398(p_expected_admin_id uuid,p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; sid uuid;
begin
 u:=center_push_private.assert_admin(p_expected_admin_id);
 update center_push_private.subscriptions set test_at=now(),updated_at=now()
 where admin_id=u and endpoint=p_endpoint and (test_at is null or test_at < now()-interval '15 seconds')
 returning id into sid;
 if sid is null then raise exception 'PUSH_TEST_NOT_READY'; end if;
 perform center_push_private.enqueue('test','test:'||gen_random_uuid()::text,sid);
 return '{"ok":true}'::jsonb;
end $$;

-- These functions are callable by the Edge Function only, never by a browser.
create or replace function public.center_admin_push_server_config_v398()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform center_push_private.assert_server();
 select jsonb_build_object('public_key',s.public_key,'private_key',v.decrypted_secret,
   'dispatch_token',d.decrypted_secret) into result
 from center_push_private.settings s
 left join vault.decrypted_secrets v on v.id=s.private_key_secret
 join vault.decrypted_secrets d on d.id=s.dispatch_secret;
 return result;
end $$;

create or replace function public.center_admin_push_server_init_v398(p_public_key text,p_private_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 perform center_push_private.assert_server();
 if p_public_key is null or p_private_key is null
    or p_public_key !~ '^B[A-Za-z0-9_-]{86}$' or p_private_key !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception 'PUSH_KEY_INVALID';
 end if;
 perform 1 from center_push_private.settings for update;
 if exists(select 1 from center_push_private.settings where public_key is not null) then return; end if;
 update center_push_private.settings set public_key=p_public_key,
  private_key_secret=vault.create_secret(p_private_key,'center_admin_push_vapid_v398','Web Push VAPID private key');
end $$;

create or replace function public.center_admin_push_server_claim_v398()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform center_push_private.assert_server();
 with candidates as (
  select d.id from center_push_private.deliveries d
  join center_push_private.events e on e.id=d.event_id
  join center_push_private.subscriptions s on s.id=d.subscription_id
  join public.profiles p on p.id=s.admin_id and p.role='admin'
  where d.sent_at is null and d.attempts<5 and d.next_attempt_at<=now()
    and (d.lease_until is null or d.lease_until<now()) and e.expires_at>now()
    and s.updated_at>now()-interval '90 days'
    and center_deletion_private.user_active(s.admin_id)
  order by d.next_attempt_at,d.id limit 25 for update of d skip locked
 ), claimed as (
  update center_push_private.deliveries d set attempts=d.attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where c.id=d.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'lease_token',d.lease_token,'event_id',e.id,'kind',e.kind,
  'created_at',e.created_at,'expires_at',e.expires_at,
  'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key,
  'binding',s.binding,'sound',s.sound
 )), '[]'::jsonb) into result from claimed d
 join center_push_private.events e on e.id=d.event_id
 join center_push_private.subscriptions s on s.id=d.subscription_id;
 return result;
end $$;

create or replace function public.center_admin_push_server_finish_v398(p_delivery_id uuid,p_lease_token uuid,p_status integer)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
 perform center_push_private.assert_server();
 if p_status is null or p_status<0 or p_status>599 then raise exception 'PUSH_STATUS_INVALID'; end if;
 if p_status in (404,410) then
  select subscription_id into sid from center_push_private.deliveries
  where id=p_delivery_id and lease_token=p_lease_token and sent_at is null for update;
  if sid is not null then delete from center_push_private.subscriptions where id=sid; end if;
  return;
 end if;
 update center_push_private.deliveries set last_status=p_status,
  sent_at=case when p_status between 200 and 299 then now() else null end,
  lease_until=null, lease_token=null,
  attempts=case when p_status in (400,401,403,422) then 5 else attempts end,
  next_attempt_at=now()+make_interval(secs=>least(120,15*attempts))
 where id=p_delivery_id and lease_token=p_lease_token and sent_at is null;
end $$;

create or replace function center_push_private.capture_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order_id uuid;
begin
 if tg_table_name='profiles' then
  if tg_op='INSERT' and new.role='member' then
   perform center_push_private.enqueue('signup','signup:'||new.id::text);
  elsif tg_op='UPDATE' and new.role is distinct from 'admin' then
   delete from center_push_private.subscriptions where admin_id=new.id;
  end if;
 elsif tg_table_name='inquiry_messages' then
  if new.sender_role='member' then perform center_push_private.enqueue('inquiry','inquiry:'||new.id::text); end if;
 elsif tg_table_name='routine_requests' then
  if tg_op='UPDATE' then
   if old.status is not distinct from new.status and old.requested_at is not distinct from new.requested_at
      and old.application_revision is not distinct from new.application_revision then return new; end if;
  end if;
  if new.status='pending' then
   perform center_push_private.enqueue('routine','routine:'||new.id::text||':'||
    extract(epoch from new.requested_at)::text||':'||coalesce(new.application_revision::text,''));
  end if;
 elsif tg_table_name='one_day_pt_requests' then
  if tg_op='INSERT' and new.status='pending' then
   perform center_push_private.enqueue('oneDayPt','oneDayPt:'||new.id::text);
  end if;
 else
  if tg_table_name='center_payapp_orders' then
   if tg_op='UPDATE' then
    if old.payment_state is not distinct from new.payment_state then return new; end if;
   end if;
   v_order_id:=new.id;
  else
   if tg_op='UPDATE' then
    if old.event_state is not distinct from new.event_state and old.paid_at is not distinct from new.paid_at then return new; end if;
   end if;
   v_order_id:=new.order_id;
  end if;
  -- Either write order is supported. Do not alert on an unverified client order.
  if exists(select 1 from public.center_payapp_orders o
    join public.center_payapp_history_evidence e on e.order_id=o.id
    where o.id=v_order_id and o.payment_state='paid' and e.event_state=4 and e.paid_at is not null) then
   perform center_push_private.enqueue('payment','payment:'||v_order_id::text||':paid');
  end if;
 end if;
 return new;
exception when others then
 -- Keep signup, messaging and payment processing available if push is unavailable.
 raise warning 'ADMIN_PUSH_EVENT_DEFERRED';
 return new;
end $$;

drop trigger if exists center_admin_push_v398 on public.profiles;
create trigger center_admin_push_v398 after insert or update of role on public.profiles
 for each row execute function center_push_private.capture_event();
drop trigger if exists center_admin_push_v398 on public.inquiry_messages;
create trigger center_admin_push_v398 after insert on public.inquiry_messages
 for each row execute function center_push_private.capture_event();
drop trigger if exists center_admin_push_v398 on public.routine_requests;
create trigger center_admin_push_v398 after insert or update on public.routine_requests
 for each row execute function center_push_private.capture_event();
drop trigger if exists center_admin_push_v398 on public.one_day_pt_requests;
create trigger center_admin_push_v398 after insert on public.one_day_pt_requests
 for each row execute function center_push_private.capture_event();
drop trigger if exists center_admin_push_v398 on public.center_payapp_orders;
create trigger center_admin_push_v398 after insert or update of payment_state on public.center_payapp_orders
 for each row execute function center_push_private.capture_event();
drop trigger if exists center_admin_push_v398 on public.center_payapp_history_evidence;
create trigger center_admin_push_v398 after insert or update on public.center_payapp_history_evidence
 for each row execute function center_push_private.capture_event();

create or replace function center_push_private.maintenance()
returns void language plpgsql security definer set search_path = '' as $$
begin
 delete from center_push_private.events where expires_at < now()-interval '1 day';
 delete from center_push_private.subscriptions s where updated_at<now()-interval '90 days'
  or not exists(select 1 from public.profiles p where p.id=s.admin_id and p.role='admin')
  or not center_deletion_private.user_active(s.admin_id);
 perform center_push_private.wake();
end $$;

revoke all on all functions in schema center_push_private from public,anon,authenticated,service_role;
-- Default PUBLIC execute is revoked for every exposed RPC, including future reruns.
do $$ declare r record; begin
 for r in select p.oid::regprocedure as signature,p.proname from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'center_admin_push_%_v398' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  if r.proname like 'center_admin_push_server_%' then
   execute format('grant execute on function %s to service_role',r.signature);
  else execute format('grant execute on function %s to authenticated',r.signature); end if;
 end loop;
end $$;

-- A dormant retry job: no HTTP request occurs until a PC is subscribed and work is pending.
select cron.schedule('center-admin-push-v398','* * * * *','select center_push_private.maintenance()');
commit;

select 'v398 관리자 푸시 서버 설정 완료' as result,
 (select count(*) from center_push_private.subscriptions) as registered_devices,
 (select count(*) from center_push_private.events) as queued_events,
 (select public_key is not null from center_push_private.settings) as function_initialized;
