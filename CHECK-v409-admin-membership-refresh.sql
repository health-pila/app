-- v409 / 1단계: 관리자 이용권 갱신 전 현재 설치 구조 확인
-- SQL Editor의 새 쿼리에 전체 내용을 붙여넣어 실행합니다.
-- 구조와 함수 정의만 조회하는 읽기 전용 쿼리입니다.
with target_tables as (
 select c.oid,n.nspname as schema_name,c.relname as table_name,
        c.relrowsecurity,c.relforcerowsecurity
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and (
  (n.nspname='public' and c.relname='profiles') or
  (n.nspname='broj_private' and c.relname in (
   'membership_snapshots','member_links','member_refresh_requests_v345','sync_settings'))
 )
), target_functions as (
 select p.oid,n.nspname as schema_name,p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and (
  (n.nspname='public' and p.proname in (
   'member_membership_refresh_begin_v345','member_membership_refresh_commit_v345',
   'member_membership_refresh_cancel_v345','broj_complete_memberships_with_eligibility',
   'broj_reserve_api_call','admin_member_memberships_v345',
   'center_service_member_features_allowed','broj_admin_member_context')) or
  (n.nspname='center_deletion_private' and p.proname in ('user_active','guard_member_write')) or
  (n.nspname='center_admin_history_private' and p.proname in ('assert_admin','assert_server'))
 )
), results as (
 select '00_preflight'::text as section,'v409'::text as item,
  jsonb_build_object('result','v409 관리자 이용권 갱신 구조 확인',
   'member_refresh_installed',to_regprocedure('public.member_membership_refresh_begin_v345(uuid)') is not null,
   'membership_writer_installed',to_regprocedure('public.broj_complete_memberships_with_eligibility(uuid,jsonb)') is not null,
   'administrator_guard_installed',to_regprocedure('center_admin_history_private.assert_admin(uuid)') is not null,
   'profiles_created_at_exists',exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='created_at')) as details
 union all
 select '01_tables',schema_name||'.'||table_name,
  jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,
   'authenticated_select',has_table_privilege('authenticated',oid,'SELECT'),
   'authenticated_insert',has_table_privilege('authenticated',oid,'INSERT'),
   'authenticated_update',has_table_privilege('authenticated',oid,'UPDATE'),
   'service_select',has_table_privilege('service_role',oid,'SELECT'),
   'service_update',has_table_privilege('service_role',oid,'UPDATE')) from target_tables
 union all
 select '02_columns',t.schema_name||'.'||t.table_name||'.'||a.attname,
  jsonb_build_object('type',pg_catalog.format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid))
 from target_tables t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
 left join pg_catalog.pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
 union all
 select '03_constraints',t.schema_name||'.'||t.table_name||'.'||c.conname,
  jsonb_build_object('kind',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid,true))
 from target_tables t join pg_catalog.pg_constraint c on c.conrelid=t.oid
 union all
 select '04_triggers',t.schema_name||'.'||t.table_name||'.'||g.tgname,
  jsonb_build_object('enabled',g.tgenabled,'definition',pg_catalog.pg_get_triggerdef(g.oid,true))
 from target_tables t join pg_catalog.pg_trigger g on g.tgrelid=t.oid and not g.tgisinternal
 union all
 select '05_functions',schema_name||'.'||proname||'('||arguments||')',
  jsonb_build_object('security_definer',prosecdef,'settings',proconfig,
   'anon_execute',has_function_privilege('anon',oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',oid,'EXECUTE'),
   'service_execute',has_function_privilege('service_role',oid,'EXECUTE'),
   'definition',pg_catalog.pg_get_functiondef(oid)) from target_functions
)
select section,item,details from results order by section,item;
