-- v404 / 1단계: 대화 이미지 첨부 전 현재 구조 확인
-- 읽기 전용입니다. 테이블·권한·설정을 변경하지 않습니다.
-- 대화 본문, 사진 파일, 회원 정보, 비밀키는 조회하지 않습니다.
-- SQL Editor의 새 쿼리에 전체 내용을 붙여넣어 한 번 실행해 주세요.

with target_tables as (
 select c.oid, n.nspname as schema_name, c.relname as table_name,
        c.relrowsecurity, c.relforcerowsecurity
 from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and (
   (n.nspname='public' and c.relname in ('member_inquiries','inquiry_messages','inquiry_message_images','member_community_reads'))
   or (n.nspname='storage' and c.relname in ('buckets','objects'))
   or (n.nspname='center_inquiry_retention_private' and c.relname='member_deletions')
 )
), target_functions as (
 select p.oid, n.nspname as schema_name, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
        p.prosecdef, p.provolatile
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and (
   (n.nspname='public' and p.proname in (
     'create_member_inquiry','sync_inquiry_after_message','member_community_mark_read',
     'member_inquiry_visible_v400','member_delete_inquiry_v400','admin_inquiry_member_deletions_v400',
     'admin_delete_inquiry_reply_v333','admin_inquiry_reply_read_state','admin_search_inquiry_threads',
     'center_member_features_allowed','center_account_active_v310','is_current_user_admin'
   )) or (n.nspname='center_deletion_private' and p.proname in (
     'media','scopes','guard_storage_write','guard_member_write','user_active'
   )) or (n.nspname='center_inquiry_retention_private' and p.proname in (
     'mark_deleted','intercept_member_delete','guard_message_write'
   ))
 )
), results as (
 select '00_preflight'::text as section, 'v404 inquiry image inspection'::text as item,
  jsonb_build_object(
   'result','v404 대화 이미지 첨부 전 설정 확인',
   'inquiries_exist',to_regclass('public.member_inquiries') is not null,
   'messages_exist',to_regclass('public.inquiry_messages') is not null,
   'storage_exists',to_regclass('storage.objects') is not null,
   'retention_installed',to_regprocedure('public.member_delete_inquiry_v400(uuid,uuid)') is not null,
   'account_deletion_installed',to_regprocedure('center_deletion_private.media(uuid)') is not null
  ) as details
 union all
 select '01_tables',schema_name||'.'||table_name,
  jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,
   'anon_select',has_table_privilege('anon',oid,'SELECT'),
   'authenticated_select',has_table_privilege('authenticated',oid,'SELECT'),
   'authenticated_insert',has_table_privilege('authenticated',oid,'INSERT'),
   'authenticated_update',has_table_privilege('authenticated',oid,'UPDATE'),
   'authenticated_delete',has_table_privilege('authenticated',oid,'DELETE'))
 from target_tables
 union all
 select '02_columns',t.schema_name||'.'||t.table_name||'.'||a.attname,
  jsonb_build_object('position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'default',pg_catalog.pg_get_expr(ad.adbin,ad.adrelid))
 from target_tables t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
 union all
 select '03_constraints',t.schema_name||'.'||t.table_name||'.'||c.conname,
  jsonb_build_object('kind',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid))
 from target_tables t join pg_catalog.pg_constraint c on c.conrelid=t.oid
 union all
 select '04_policies',p.schemaname||'.'||p.tablename||'.'||p.policyname,
  jsonb_build_object('command',p.cmd,'permissive',p.permissive,'roles',p.roles,'using',p.qual,'with_check',p.with_check)
 from pg_catalog.pg_policies p join target_tables t on t.schema_name=p.schemaname and t.table_name=p.tablename
 union all
 select '05_triggers',t.schema_name||'.'||t.table_name||'.'||tr.tgname,
  jsonb_build_object('enabled',tr.tgenabled,'definition',pg_catalog.pg_get_triggerdef(tr.oid))
 from target_tables t join pg_catalog.pg_trigger tr on tr.tgrelid=t.oid and not tr.tgisinternal
 union all
 select '06_functions',schema_name||'.'||proname||'('||arguments||')',
  jsonb_build_object('security_definer',prosecdef,'volatility',provolatile,
   'anon_execute',has_function_privilege('anon',oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',oid,'EXECUTE'),
   'service_execute',has_function_privilege('service_role',oid,'EXECUTE'),
   'definition',pg_catalog.pg_get_functiondef(oid))
 from target_functions
 union all
 select '07_buckets',b.id,
  jsonb_build_object('public',b.public,
   'file_size_limit',to_jsonb(b)->'file_size_limit',
   'allowed_mime_types',to_jsonb(b)->'allowed_mime_types')
 from storage.buckets b where b.id in ('workout-photos','routine-images','community-images','inquiry-images')
 union all
 select '08_realtime',p.pubname||'.'||p.schemaname||'.'||p.tablename,
  jsonb_build_object('published',true)
 from pg_catalog.pg_publication_tables p
 where p.schemaname='public' and p.tablename in ('member_inquiries','inquiry_messages','inquiry_message_images')
)
select section,item,details from results order by section,item;
