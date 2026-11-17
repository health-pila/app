-- v404 / 2단계: 회원·관리자 대화 사진 저장 및 권한 설정
-- 설치만으로 기존 대화·사진을 수정하거나 삭제하지 않습니다.
-- 사진 최대 3장 / 장당 1 MiB / 비공개 저장소 / 중복 전송 방지.
-- 계정 삭제 함수 교체와 앱 덮어쓰기는 설치 결과 확인 후 진행합니다.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

do $$ begin
 if to_regprocedure('public.create_member_inquiry(text,text)') is null
 or to_regprocedure('public.member_inquiry_visible_v400(uuid)') is null
 or to_regprocedure('center_deletion_private.media(uuid)') is null
 or to_regprocedure('center_deletion_private.scopes()') is null
 or to_regclass('storage.objects') is null then raise exception 'V404_PREREQUISITES_MISSING'; end if;
 if not(select relrowsecurity from pg_catalog.pg_class where oid='public.inquiry_messages'::regclass)
 or not(select relrowsecurity from pg_catalog.pg_class where oid='storage.objects'::regclass)
 then raise exception 'V404_EXISTING_RLS_REQUIRED'; end if;
end $$;

create schema if not exists center_inquiry_media_private;
revoke all on schema center_inquiry_media_private from public,anon,authenticated,service_role;
create table if not exists center_inquiry_media_private.requests (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null,
 sender_id uuid not null references auth.users(id) on delete cascade,
 member_id uuid not null references auth.users(id) on delete cascade,
 inquiry_id uuid references public.member_inquiries(id) on delete cascade,
 new_inquiry boolean not null,
 spec jsonb not null check(jsonb_typeof(spec)='array' and jsonb_array_length(spec) between 1 and 3),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 sent_message_id uuid,
 sent_body text,
 sent_at timestamptz,
 unique(sender_id,client_id),
 check((sent_message_id is null and sent_body is null and sent_at is null)
    or (sent_message_id is not null and sent_body is not null and sent_at is not null))
);
create index if not exists inquiry_media_requests_member_v404 on center_inquiry_media_private.requests(member_id);
create table if not exists center_inquiry_media_private.images (
 id uuid primary key,
 request_id uuid not null references center_inquiry_media_private.requests(id) on delete cascade,
 message_id uuid references public.inquiry_messages(id) on delete set null,
 path text not null unique,
 position integer not null check(position between 0 and 2),
 mime_type text not null check(mime_type in ('image/webp','image/jpeg')),
 bytes integer not null check(bytes between 1 and 1048576),
 width integer not null check(width between 1 and 2048),
 height integer not null check(height between 1 and 2048),
 unique(request_id,position)
);
create index if not exists inquiry_media_images_message_v404 on center_inquiry_media_private.images(message_id) where message_id is not null;
alter table center_inquiry_media_private.requests enable row level security;
alter table center_inquiry_media_private.requests force row level security;
alter table center_inquiry_media_private.images enable row level security;
alter table center_inquiry_media_private.images force row level security;
revoke all on all tables in schema center_inquiry_media_private from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inquiry-images','inquiry-images',false,1048576,array['image/webp','image/jpeg']) on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='inquiry-images' and public=false
  and file_size_limit=1048576 and allowed_mime_types @> array['image/webp','image/jpeg']
  and allowed_mime_types <@ array['image/webp','image/jpeg']
  and coalesce(to_jsonb(buckets)->>'versioning_status','DISABLED')='DISABLED'
  and coalesce(to_jsonb(buckets)->>'type','STANDARD')='STANDARD')
 then raise exception 'V404_BUCKET_SETTINGS_REVIEW_REQUIRED'; end if;
end $$;

create or replace function center_inquiry_media_private.assert_actor(expected uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare actual_role text;
begin
 if (select auth.uid()) is null or (select auth.uid()) is distinct from expected
 or (select auth.role()) is distinct from 'authenticated'
 or not center_deletion_private.user_active(expected)
 or not coalesce(public.center_member_features_allowed(),false) then
  raise exception 'INQUIRY_AUTH_REQUIRED' using errcode='42501'; end if;
 select role into actual_role from public.profiles where id=expected;
 if actual_role not in ('member','admin') or actual_role is null then
  raise exception 'INQUIRY_AUTH_REQUIRED' using errcode='42501'; end if;
 return actual_role;
end $$;

-- Nonblocking locks use the same account keys as existing account withdrawal.
-- A retryable conflict is safer than waiting in an inverse Storage row-lock order.
create or replace function center_inquiry_media_private.lock_accounts(a uuid,m uuid)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 for u in select distinct x from unnest(array[a,m]) x order by x loop
  if u is null or not pg_try_advisory_xact_lock(hashtextextended('account-delete:'||u::text,0)) then
   raise exception 'INQUIRY_IMAGE_BUSY' using errcode='40001'; end if;
  if not center_deletion_private.user_active(u) then raise exception 'APP_ACCOUNT_DELETING' using errcode='42501'; end if;
 end loop;
end $$;
create or replace function center_inquiry_media_private.lock_request(r uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not pg_try_advisory_xact_lock(hashtextextended('inquiry-image:'||r::text,0)) then
  raise exception 'INQUIRY_IMAGE_BUSY' using errcode='40001'; end if;
end $$;

create or replace function center_inquiry_media_private.room_access(i uuid,a uuid,writing boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_inquiries q where q.id=i
  and center_deletion_private.user_active(q.user_id)
  and (coalesce(public.is_current_user_admin(),false) or q.user_id=a)
  and (not writing and coalesce(public.is_current_user_admin(),false)
       or not exists(select 1 from center_inquiry_retention_private.member_deletions d where d.inquiry_id=q.id)))
$$;

-- Path access never depends on a caller-supplied member or sender identity.
create or replace function public.inquiry_image_access_v404(p_path text,p_action text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r center_inquiry_media_private.requests; img center_inquiry_media_private.images; a uuid:=auth.uid(); adm boolean;
begin
 if a is null or (select auth.role()) is distinct from 'authenticated'
 or not exists(select 1 from public.profiles where id=a and role in ('member','admin'))
 or not center_deletion_private.user_active(a)
 or not coalesce(public.center_member_features_allowed(),false) then return false; end if;
 select * into img from center_inquiry_media_private.images where path=p_path;
 if not found then return false; end if;
 select * into r from center_inquiry_media_private.requests where id=img.request_id;
 if not found or not center_deletion_private.user_active(r.member_id)
 or not center_deletion_private.user_active(r.sender_id) then return false; end if;
 adm:=coalesce(public.is_current_user_admin(),false);
 if p_action='read' then
  if img.message_id is not null then
   return center_inquiry_media_private.room_access(r.inquiry_id,a,false);
  end if;
  return r.sender_id=a and r.sent_message_id is null and r.expires_at>now()
    and (r.inquiry_id is null or center_inquiry_media_private.room_access(r.inquiry_id,a,true))
    or adm and (r.sent_message_id is not null or r.expires_at<=now());
 elsif p_action='insert' then
  return r.sender_id=a and r.sent_message_id is null and r.expires_at>now()
   and (r.inquiry_id is null or center_inquiry_media_private.room_access(r.inquiry_id,a,true))
   and (adm or exists(select 1 from public.app_settings where setting_key='member_inquiry_enabled' and is_enabled));
 elsif p_action='delete' then
  return img.message_id is null and (r.sender_id=a and r.sent_message_id is null
    or adm and (r.sent_message_id is not null or r.expires_at<=now()));
 end if;
 return false;
end $$;

-- Preserve other buckets' policies, adding scoped permissions and restrictions.
drop policy if exists inquiry_images_read_v404 on storage.objects;
create policy inquiry_images_read_v404 on storage.objects for select to authenticated
 using(bucket_id='inquiry-images' and public.inquiry_image_access_v404(name,'read'));
drop policy if exists inquiry_images_insert_v404 on storage.objects;
create policy inquiry_images_insert_v404 on storage.objects for insert to authenticated
 with check(bucket_id='inquiry-images' and public.inquiry_image_access_v404(name,'insert'));
drop policy if exists inquiry_images_delete_v404 on storage.objects;
create policy inquiry_images_delete_v404 on storage.objects for delete to authenticated
 using(bucket_id='inquiry-images' and public.inquiry_image_access_v404(name,'delete'));
drop policy if exists inquiry_images_read_guard_v404 on storage.objects;
create policy inquiry_images_read_guard_v404 on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'inquiry-images' or public.inquiry_image_access_v404(name,'read'));
drop policy if exists inquiry_images_insert_guard_v404 on storage.objects;
create policy inquiry_images_insert_guard_v404 on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'inquiry-images' or public.inquiry_image_access_v404(name,'insert'));
drop policy if exists inquiry_images_delete_guard_v404 on storage.objects;
create policy inquiry_images_delete_guard_v404 on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'inquiry-images' or public.inquiry_image_access_v404(name,'delete'));
drop policy if exists inquiry_images_no_update_v404 on storage.objects;
create policy inquiry_images_no_update_v404 on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'inquiry-images') with check(bucket_id<>'inquiry-images');

create or replace function center_inquiry_media_private.guard_storage()
returns trigger language plpgsql security definer set search_path='' as $$
declare r center_inquiry_media_private.requests; img center_inquiry_media_private.images; obj storage.objects;
begin
 if tg_op='DELETE' then obj:=old; else obj:=new; end if;
 if obj.bucket_id<>'inquiry-images' or (select auth.role()) is distinct from 'authenticated' then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='UPDATE' then raise exception 'INQUIRY_IMAGE_IMMUTABLE' using errcode='42501'; end if;
 select * into img from center_inquiry_media_private.images where path=obj.name;
 if not found then raise exception 'INQUIRY_IMAGE_NOT_RESERVED' using errcode='42501'; end if;
 select * into r from center_inquiry_media_private.requests where id=img.request_id;
 perform center_inquiry_media_private.lock_accounts(auth.uid(),r.member_id);
 perform center_inquiry_media_private.lock_request(r.id);
 -- A concurrent commit is serialized before checking whether deletion is legal.
 perform 1 from center_inquiry_media_private.requests where id=r.id for update;
 select * into img from center_inquiry_media_private.images where id=img.id for update;
 if tg_op='DELETE' and img.message_id is not null then raise exception 'INQUIRY_IMAGE_ALREADY_SENT' using errcode='42501'; end if;
 if tg_op='INSERT' and (obj.owner is not null and obj.owner is distinct from auth.uid()
  or obj.owner_id is not null and obj.owner_id is distinct from auth.uid()::text) then
  raise exception 'INQUIRY_IMAGE_OWNER_MISMATCH' using errcode='42501'; end if;
 if not public.inquiry_image_access_v404(obj.name,case when tg_op='DELETE' then 'delete' else 'insert' end) then
  raise exception 'INQUIRY_IMAGE_ACCESS_DENIED' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists inquiry_images_guard_v404 on storage.objects;
create trigger inquiry_images_guard_v404 before insert or update or delete on storage.objects
 for each row execute function center_inquiry_media_private.guard_storage();

create or replace function public.prepare_inquiry_images_v404(
 p_expected_user_id uuid,p_client_id uuid,p_inquiry_id uuid,p_files jsonb
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='8s' as $$
declare a uuid:=auth.uid(); actor text; m uuid; r center_inquiry_media_private.requests; f jsonb; spec jsonb:='[]'; files jsonb; pos integer:=0; fid uuid; mt text; w integer; h integer; b integer;
begin
 actor:=center_inquiry_media_private.assert_actor(p_expected_user_id);
 if p_client_id is null or p_files is null or jsonb_typeof(p_files)<>'array' then raise exception 'INVALID_INQUIRY_IMAGES' using errcode='22023'; end if;
 if jsonb_array_length(p_files) not between 1 and 3 then raise exception 'INQUIRY_IMAGE_LIMIT' using errcode='22023'; end if;
 if p_inquiry_id is null then
  if actor<>'member' then raise exception 'INQUIRY_REQUIRED' using errcode='42501'; end if;
  m:=a;
 else
  select user_id into m from public.member_inquiries where id=p_inquiry_id;
  if m is null or not center_inquiry_media_private.room_access(p_inquiry_id,a,true) then raise exception 'INQUIRY_UNAVAILABLE' using errcode='42501'; end if;
 end if;
 perform center_inquiry_media_private.lock_accounts(a,m);
 for f in select value from jsonb_array_elements(p_files) loop
  if jsonb_typeof(f)<>'object' or not(f ?& array['id','mime_type','width','height','bytes'])
   or exists(select 1 from jsonb_object_keys(f) k where k not in ('id','mime_type','width','height','bytes'))
   or coalesce(f->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(f->'mime_type')<>'string'
   or jsonb_typeof(f->'width')<>'number' or (f->>'width')!~'^[0-9]{1,4}$'
   or jsonb_typeof(f->'height')<>'number' or (f->>'height')!~'^[0-9]{1,4}$'
   or jsonb_typeof(f->'bytes')<>'number' or (f->>'bytes')!~'^[0-9]{1,7}$'
  then raise exception 'INVALID_INQUIRY_IMAGES' using errcode='22023'; end if;
  fid:=(f->>'id')::uuid; mt:=f->>'mime_type'; w:=(f->>'width')::integer; h:=(f->>'height')::integer; b:=(f->>'bytes')::integer;
  if mt not in ('image/webp','image/jpeg') or w not between 1 and 2048 or h not between 1 and 2048 or b not between 1 and 1048576
  or exists(select 1 from jsonb_array_elements(spec) x where x->>'id'=fid::text) then raise exception 'INVALID_INQUIRY_IMAGES' using errcode='22023'; end if;
  spec:=spec||jsonb_build_array(jsonb_build_object('id',fid,'mime_type',mt,'width',w,'height',h,'bytes',b));
 end loop;
 select * into r from center_inquiry_media_private.requests where sender_id=a and client_id=p_client_id;
 if found then
  perform center_inquiry_media_private.lock_request(r.id);
  select * into r from center_inquiry_media_private.requests where id=r.id for update;
  if r.spec<>spec or r.member_id<>m or r.new_inquiry is distinct from (p_inquiry_id is null)
   or (not r.new_inquiry and r.inquiry_id is distinct from p_inquiry_id) then raise exception 'INQUIRY_ATTEMPT_MISMATCH' using errcode='22023'; end if;
  if r.sent_message_id is null and r.expires_at<=now() then raise exception 'INQUIRY_UPLOAD_EXPIRED' using errcode='22023'; end if;
 else
  if (select count(*) from center_inquiry_media_private.requests where sender_id=a and sent_at is null and expires_at>now())>=10 then
   raise exception 'INQUIRY_UPLOAD_RETRY_LIMIT' using errcode='22023'; end if;
  if actor='member' and not exists(select 1 from public.app_settings where setting_key='member_inquiry_enabled' and is_enabled) then
   raise exception 'INQUIRY_INTAKE_CLOSED' using errcode='42501'; end if;
  insert into center_inquiry_media_private.requests(client_id,sender_id,member_id,inquiry_id,new_inquiry,spec)
  values(p_client_id,a,m,p_inquiry_id,p_inquiry_id is null,spec) returning * into r;
  for f in select value from jsonb_array_elements(spec) loop
   insert into center_inquiry_media_private.images(id,request_id,path,position,mime_type,width,height,bytes)
   values((f->>'id')::uuid,r.id,m::text||'/'||a::text||'/'||p_client_id::text||'/'||(f->>'id')||case when f->>'mime_type'='image/webp' then '.webp' else '.jpg' end,
    pos,f->>'mime_type',(f->>'width')::integer,(f->>'height')::integer,(f->>'bytes')::integer);
   pos:=pos+1;
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'path',i.path,'position',i.position,
  'uploaded',exists(select 1 from storage.objects o where o.bucket_id='inquiry-images' and o.name=i.path
    and o.metadata->>'size'=i.bytes::text and o.metadata->>'mimetype'=i.mime_type)) order by i.position),'[]')
 into files from center_inquiry_media_private.images i where request_id=r.id;
 return jsonb_build_object('ok',true,'version',404,'client_id',p_client_id,'expires_at',r.expires_at,
  'already_sent',r.sent_message_id is not null,'message_id',r.sent_message_id,'inquiry_id',r.inquiry_id,'files',files);
end $$;

-- One transaction creates the message and every attachment. Retrying the same
-- sender/client ID returns the original result instead of inserting a duplicate.
create or replace function public.send_inquiry_images_v404(
 p_expected_user_id uuid,p_client_id uuid,p_inquiry_id uuid,p_body text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='8s' as $$
declare a uuid:=auth.uid(); actor text; r center_inquiry_media_private.requests; img center_inquiry_media_private.images;
 raw_body text:=btrim(coalesce(p_body,'')); body text; q uuid; msg uuid; title text; n integer:=0;
begin
 actor:=center_inquiry_media_private.assert_actor(p_expected_user_id);
 if length(raw_body)>5000 then raise exception 'INQUIRY_BODY_TOO_LONG' using errcode='22023'; end if;
 select * into r from center_inquiry_media_private.requests where sender_id=a and client_id=p_client_id;
 if not found then raise exception 'INQUIRY_UPLOAD_NOT_PREPARED' using errcode='22023'; end if;
 perform center_inquiry_media_private.lock_accounts(a,r.member_id);
 perform center_inquiry_media_private.lock_request(r.id);
 select * into r from center_inquiry_media_private.requests where id=r.id for update;
 if r.new_inquiry is distinct from (p_inquiry_id is null) or (not r.new_inquiry and r.inquiry_id is distinct from p_inquiry_id) then
  raise exception 'INQUIRY_ATTEMPT_MISMATCH' using errcode='22023'; end if;
 if r.sent_message_id is not null then
  if r.sent_body is distinct from raw_body then raise exception 'INQUIRY_ATTEMPT_MISMATCH' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'version',404,'client_id',p_client_id,'inquiry_id',r.inquiry_id,'message_id',r.sent_message_id,'already_sent',true);
 end if;
 if r.expires_at<=now() then raise exception 'INQUIRY_UPLOAD_EXPIRED' using errcode='22023'; end if;
 if actor='member' and not exists(select 1 from public.app_settings where setting_key='member_inquiry_enabled' and is_enabled) then
  raise exception 'INQUIRY_INTAKE_CLOSED' using errcode='42501'; end if;
 if r.inquiry_id is not null then
  perform 1 from public.member_inquiries where id=r.inquiry_id for update;
  if not found or not center_inquiry_media_private.room_access(r.inquiry_id,a,true) then raise exception 'MEMBER_DELETED_INQUIRY' using errcode='42501'; end if;
 end if;
 for img in select * from center_inquiry_media_private.images where request_id=r.id order by position loop
  perform 1 from storage.objects o where o.bucket_id='inquiry-images' and o.name=img.path
   and o.metadata->>'size'=img.bytes::text and o.metadata->>'mimetype'=img.mime_type for key share;
  if not found then raise exception 'INQUIRY_IMAGE_UPLOAD_INCOMPLETE' using errcode='22023'; end if;
  n:=n+1;
 end loop;
 if n<>jsonb_array_length(r.spec) then raise exception 'INQUIRY_IMAGE_UPLOAD_INCOMPLETE' using errcode='22023'; end if;
 body:=case when raw_body='' then '사진을 보냈습니다.' else raw_body end;
 if r.new_inquiry then
  title:=left(regexp_replace(body,'[[:space:]]+',' ','g'),100);
  q:=public.create_member_inquiry(title,body);
  select id into msg from public.inquiry_messages where inquiry_id=q and sender_id=a order by created_at,id limit 1;
 else
  q:=r.inquiry_id;
  insert into public.inquiry_messages(inquiry_id,sender_id,sender_role,body) values(q,a,actor,body) returning id into msg;
 end if;
 if msg is null then raise exception 'INQUIRY_MESSAGE_NOT_CREATED'; end if;
 update center_inquiry_media_private.images set message_id=msg where request_id=r.id;
 update center_inquiry_media_private.requests set inquiry_id=q,sent_message_id=msg,sent_body=raw_body,sent_at=now() where id=r.id;
 return jsonb_build_object('ok',true,'version',404,'client_id',p_client_id,'inquiry_id',q,'message_id',msg,'already_sent',false);
end $$;

create or replace function public.read_inquiry_images_v404(p_expected_user_id uuid,p_message_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare entries jsonb;
begin
 perform center_inquiry_media_private.assert_actor(p_expected_user_id);
 if p_message_ids is null or cardinality(p_message_ids)>200 or array_position(p_message_ids,null) is not null then
  raise exception 'INVALID_INQUIRY_MESSAGE_IDS' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'message_id',i.message_id,'path',i.path,
  'position',i.position,'mime_type',i.mime_type,'bytes',i.bytes,'width',i.width,'height',i.height) order by m.created_at,m.id,i.position),'[]')
 into entries from center_inquiry_media_private.images i
 join center_inquiry_media_private.requests r on r.id=i.request_id
 join public.inquiry_messages m on m.id=i.message_id and m.inquiry_id=r.inquiry_id
 where i.message_id=any(p_message_ids) and center_inquiry_media_private.room_access(r.inquiry_id,auth.uid(),false);
 return jsonb_build_object('ok',true,'version',404,'entries',entries);
end $$;

-- The admin app removes a bounded batch through Storage's API on startup/idle.
-- SQL only removes tracking rows after the physical Storage object is absent.
create or replace function public.inquiry_media_cleanup_list_v404(p_expected_admin_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare entries jsonb;
begin
 if center_inquiry_media_private.assert_actor(p_expected_admin_id)<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'path',x.path) order by x.path),'[]') into entries from (
  select i.id,i.path from center_inquiry_media_private.images i join center_inquiry_media_private.requests r on r.id=i.request_id
  where i.message_id is null and (r.sent_message_id is not null or r.expires_at<=now())
   and center_deletion_private.user_active(r.member_id) and center_deletion_private.user_active(r.sender_id)
  order by i.path limit 25
 ) x;
 return jsonb_build_object('ok',true,'version',404,'entries',entries);
end $$;
create or replace function public.inquiry_media_cleanup_finish_v404(p_expected_admin_id uuid,p_image_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare n integer;
begin
 if center_inquiry_media_private.assert_actor(p_expected_admin_id)<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_image_ids is null or cardinality(p_image_ids)>25 or array_position(p_image_ids,null) is not null then
  raise exception 'INVALID_INQUIRY_IMAGE_IDS' using errcode='22023'; end if;
 delete from center_inquiry_media_private.images i using center_inquiry_media_private.requests r
 where r.id=i.request_id and i.id=any(p_image_ids) and i.message_id is null
  and (r.sent_message_id is not null or r.expires_at<=now())
  and not exists(select 1 from storage.objects o where o.bucket_id='inquiry-images' and o.name=i.path);
 get diagnostics n=row_count;
 delete from center_inquiry_media_private.requests r where sent_message_id is null and expires_at<=now()
  and not exists(select 1 from center_inquiry_media_private.images i where i.request_id=r.id);
 return jsonb_build_object('ok',true,'version',404,'removed',n);
end $$;

-- Retain the exact installed legacy cleanup rules, then add the new bucket.
-- Storage bytes are still removed exclusively through the Storage API.
do $$ declare d text; b text; begin
 if to_regprocedure('center_deletion_private.base_media_v404(uuid)') is null then
  d:=pg_get_functiondef('center_deletion_private.media(uuid)'::regprocedure);
  b:=replace(d,'FUNCTION center_deletion_private.media(','FUNCTION center_deletion_private.base_media_v404(');
  if b=d then raise exception 'V404_MEDIA_DEFINITION_MISMATCH'; end if; execute b;
 end if;
 if to_regprocedure('center_deletion_private.base_scopes_v404()') is null then
  d:=pg_get_functiondef('center_deletion_private.scopes()'::regprocedure);
  b:=replace(d,'FUNCTION center_deletion_private.scopes()','FUNCTION center_deletion_private.base_scopes_v404()');
  if b=d then raise exception 'V404_SCOPES_DEFINITION_MISMATCH'; end if; execute b;
 end if;
end $$;
create or replace function center_deletion_private.scopes()
returns table(s text,t text,c text) language sql immutable set search_path='' as $$
 select * from center_deletion_private.base_scopes_v404()
 union select 'center_inquiry_media_private','requests','member_id'
$$;
create or replace function center_deletion_private.media(u uuid)
returns table(bucket_id text,name text,blocked boolean) language sql stable security definer set search_path='' as $$
 with refs as (
  select i.path,r.member_id from center_inquiry_media_private.images i
  join center_inquiry_media_private.requests r on r.id=i.request_id
 )
 select * from center_deletion_private.base_media_v404(u) where bucket_id<>'inquiry-images'
 union all
 select o.bucket_id,o.name,
  not(coalesce(o.owner=u,false) or coalesce(o.owner_id=u::text,false) or lower(split_part(o.name,'/',1))=u::text)
  or exists(select 1 from refs r where r.path=o.name and r.member_id<>u)
  or coalesce(o.is_versioned,false) or coalesce(o.is_delete_marker,false) or o.archived_at is not null
 from storage.objects o where o.bucket_id='inquiry-images' and (o.owner=u or o.owner_id=u::text
  or lower(split_part(o.name,'/',1))=u::text or exists(select 1 from refs r where r.path=o.name and r.member_id=u))
$$;

revoke all on all functions in schema center_inquiry_media_private from public,anon,authenticated,service_role;
revoke all on function center_deletion_private.base_media_v404(uuid),center_deletion_private.base_scopes_v404() from public,anon,authenticated,service_role;
revoke all on function public.inquiry_image_access_v404(text,text),public.prepare_inquiry_images_v404(uuid,uuid,uuid,jsonb),
 public.send_inquiry_images_v404(uuid,uuid,uuid,text),public.read_inquiry_images_v404(uuid,uuid[]),
 public.inquiry_media_cleanup_list_v404(uuid),public.inquiry_media_cleanup_finish_v404(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.inquiry_image_access_v404(text,text) to anon,authenticated;
grant execute on function public.prepare_inquiry_images_v404(uuid,uuid,uuid,jsonb),public.send_inquiry_images_v404(uuid,uuid,uuid,text),
 public.read_inquiry_images_v404(uuid,uuid[]),public.inquiry_media_cleanup_list_v404(uuid),public.inquiry_media_cleanup_finish_v404(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v404 대화 사진 저장·권한 설정 완료' as result;
