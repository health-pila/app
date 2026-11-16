-- v400 / 회원 대화 삭제: 회원 화면에서 숨기고 관리자 원문·삭제 시각 보관
-- 기존 대화는 수정/삭제하지 않습니다. 향후 회원의 대화 삭제부터 적용됩니다.
-- 회원 계정 전체 탈퇴 처리의 기존 삭제 절차는 유지합니다.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
 if to_regclass('public.member_inquiries') is null or to_regclass('public.inquiry_messages') is null
 or to_regclass('center_deletion_private.jobs') is null
 or to_regprocedure('public.center_member_features_allowed()') is null
 or to_regprocedure('public.member_community_mark_read(text[],text[])') is null then
  raise exception 'V400_REQUIRED_INSTALLATION_MISSING';
 end if;
 if not (select relrowsecurity from pg_catalog.pg_class where oid='public.member_inquiries'::regclass)
 or not (select relrowsecurity from pg_catalog.pg_class where oid='public.inquiry_messages'::regclass) then
  raise exception 'V400_EXISTING_RLS_REQUIRED'; end if;
end $$;

create schema if not exists center_inquiry_retention_private;
revoke all on schema center_inquiry_retention_private from public,anon,authenticated,service_role;
create table if not exists center_inquiry_retention_private.member_deletions (
 inquiry_id uuid primary key references public.member_inquiries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 deleted_at timestamptz not null default clock_timestamp() check(isfinite(deleted_at))
);
create index if not exists member_inquiry_deletions_owner_v400 on center_inquiry_retention_private.member_deletions(user_id);
alter table center_inquiry_retention_private.member_deletions enable row level security;
alter table center_inquiry_retention_private.member_deletions force row level security;
revoke all on center_inquiry_retention_private.member_deletions from public,anon,authenticated,service_role;

-- This helper only reports the caller's own hidden rows. It never reads the
-- protected public inquiry table, avoiding recursive RLS policies.
create or replace function public.member_inquiry_visible_v400(p_inquiry_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.is_current_user_admin(),false) or not exists(
  select 1 from center_inquiry_retention_private.member_deletions d
  where d.inquiry_id=p_inquiry_id and d.user_id=(select auth.uid())
 )
$$;
revoke all on function public.member_inquiry_visible_v400(uuid) from public,anon,authenticated,service_role;
grant execute on function public.member_inquiry_visible_v400(uuid) to authenticated;

-- Add restrictions to the existing ownership, access and deletion policies.
-- No existing permissive policy is removed or broadened.
drop policy if exists member_inquiry_retention_read_v400 on public.member_inquiries;
create policy member_inquiry_retention_read_v400 on public.member_inquiries as restrictive
 for select to authenticated using(public.member_inquiry_visible_v400(id));
drop policy if exists member_inquiry_retention_read_v400 on public.inquiry_messages;
create policy member_inquiry_retention_read_v400 on public.inquiry_messages as restrictive
 for select to authenticated using(public.member_inquiry_visible_v400(inquiry_id));

create or replace function center_inquiry_retention_private.mark_deleted(i uuid,u uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row_user uuid; at timestamptz; inserted boolean;
begin
 if u is null or (select auth.uid()) is distinct from u
 or not center_deletion_private.user_active(u)
 or not coalesce(public.center_member_features_allowed(),false)
 or not exists(select 1 from public.profiles where id=u and role='member') then
  raise exception 'MEMBER_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('account-delete:'||u::text,0));
 if not center_deletion_private.user_active(u) then raise exception 'APP_ACCOUNT_DELETING' using errcode='42501'; end if;
 select user_id into row_user from public.member_inquiries where id=i for update;
 if not found or row_user is distinct from u then raise exception 'INQUIRY_UNAVAILABLE' using errcode='P0002'; end if;
 insert into center_inquiry_retention_private.member_deletions(inquiry_id,user_id)
 values(i,u) on conflict(inquiry_id) do nothing returning deleted_at into at;
 inserted:=found;
 if not inserted then
  select deleted_at into at from center_inquiry_retention_private.member_deletions where inquiry_id=i and user_id=u;
 else
  -- Notify existing administrator realtime listeners without changing message
  -- chronology, status or the administrator's archive choice.
  update public.member_inquiries set updated_at=greatest(updated_at,at) where id=i;
 end if;
 return jsonb_build_object('ok',true,'version',400,'inquiry_id',i,'deleted_at',at,'already_deleted',not inserted);
end $$;

create or replace function public.member_delete_inquiry_v400(p_inquiry_id uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='5s' as $$
begin
 if p_inquiry_id is null then raise exception 'INQUIRY_REQUIRED' using errcode='22023'; end if;
 return center_inquiry_retention_private.mark_deleted(p_inquiry_id,p_expected_user_id);
end $$;

-- Old installed clients still send DELETE. Intercept it before the FK cascade.
create or replace function center_inquiry_retention_private.intercept_member_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Account withdrawal/admin service cleanup must still physically remove data.
 if (select auth.role())='authenticated' and (select auth.uid())=old.user_id
 and not coalesce(public.is_current_user_admin(),false)
 and not exists(select 1 from center_deletion_private.jobs where user_id=old.user_id) then
  -- DELETE already owns a row lock: never wait in the inverse account-lock order.
  if not pg_try_advisory_xact_lock(hashtextextended('account-delete:'||old.user_id::text,0)) then
   raise exception 'APP_ACCOUNT_BUSY' using errcode='40001'; end if;
  perform center_inquiry_retention_private.mark_deleted(old.id,old.user_id);
  return null;
 end if;
 return old;
end $$;
drop trigger if exists retain_member_inquiry_v400 on public.member_inquiries;
create trigger retain_member_inquiry_v400 before delete on public.member_inquiries
 for each row execute function center_inquiry_retention_private.intercept_member_delete();

-- Deleted conversations remain readable by administrators, but a new answer
-- must not be sent into a conversation the member can no longer receive.
create or replace function center_inquiry_retention_private.guard_message_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.member_inquiries where id=new.inquiry_id;
 if owner_id is null then raise exception 'INQUIRY_UNAVAILABLE' using errcode='42501'; end if;
 if (select auth.role())='authenticated' and not coalesce(public.is_current_user_admin(),false)
 and (select auth.uid()) is distinct from owner_id then raise exception 'INQUIRY_UNAVAILABLE' using errcode='42501'; end if;
 -- The existing sender-account guard runs first. A nonblocking owner lock avoids
 -- a deadlock with account deletion and concurrent member hiding.
 if not pg_try_advisory_xact_lock(hashtextextended('account-delete:'||owner_id::text,0)) then
  raise exception 'INQUIRY_BUSY' using errcode='40001'; end if;
 perform 1 from public.member_inquiries where id=new.inquiry_id for update;
 if exists(select 1 from center_inquiry_retention_private.member_deletions where inquiry_id=new.inquiry_id) then
  raise exception 'MEMBER_DELETED_INQUIRY' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists retain_member_message_write_v400 on public.inquiry_messages;
create trigger retain_member_message_write_v400 before insert or update on public.inquiry_messages
 for each row execute function center_inquiry_retention_private.guard_message_write();

create or replace function public.admin_inquiry_member_deletions_v400(p_inquiry_ids uuid[],p_expected_admin_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare entries jsonb;
begin
 if (select auth.uid()) is null or (select auth.uid()) is distinct from p_expected_admin_id
 or not coalesce(public.is_current_user_admin(),false)
 or not center_deletion_private.user_active(p_expected_admin_id) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_inquiry_ids is null or cardinality(p_inquiry_ids)>500
 or array_position(p_inquiry_ids,null) is not null then raise exception 'INVALID_INQUIRY_IDS' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('inquiry_id',d.inquiry_id,'deleted_at',d.deleted_at) order by d.deleted_at,d.inquiry_id),'[]')
 into entries from center_inquiry_retention_private.member_deletions d
 join public.member_inquiries i on i.id=d.inquiry_id and i.user_id=d.user_id
 where d.inquiry_id=any(p_inquiry_ids);
 return jsonb_build_object('ok',true,'version',400,'entries',entries);
end $$;

-- Keep existing read receipts for administrator history. Prevent a member from
-- creating new read receipts for a conversation they have deleted.
create or replace function public.member_community_mark_read(p_news_ids text[] default '{}',p_reply_ids text[] default '{}')
returns void language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare uid uuid:=auth.uid();
begin
 if not coalesce(public.center_member_features_allowed(),false) then raise exception 'CENTER_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if uid is null or not exists(select 1 from public.profiles p join auth.users a on a.id=p.id where p.id=uid and p.role='member') then
  raise exception 'Member authentication required' using errcode='42501'; end if;
 if p_news_ids is null or p_reply_ids is null or cardinality(p_news_ids)+cardinality(p_reply_ids)>500
 or exists(select 1 from unnest(p_news_ids||p_reply_ids) x where x is null or length(x) not between 1 and 100) then
  raise exception 'Invalid read markers' using errcode='22023'; end if;
 insert into public.member_community_reads(user_id,kind,item_id)
 select uid,'news',p.id::text from public.community_posts p where p.is_published=true and p.id::text=any(p_news_ids)
 on conflict do nothing;
 insert into public.member_community_reads(user_id,kind,item_id)
 select uid,'reply',m.id::text from public.inquiry_messages m join public.member_inquiries i on i.id=m.inquiry_id
 where i.user_id=uid and m.sender_role='admin' and m.id::text=any(p_reply_ids)
 and public.member_inquiry_visible_v400(i.id) on conflict do nothing;
end $$;

revoke all on all functions in schema center_inquiry_retention_private from public,anon,authenticated,service_role;
revoke all on function public.member_delete_inquiry_v400(uuid,uuid),public.admin_inquiry_member_deletions_v400(uuid[],uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.member_delete_inquiry_v400(uuid,uuid),public.admin_inquiry_member_deletions_v400(uuid[],uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v400 회원 대화 삭제·관리자 보관 설정 완료' as result;
