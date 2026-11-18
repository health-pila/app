-- v410 · 통합 문의창 준비 확인. 시스템 카탈로그만 조회합니다.
-- 회원 이름, 메시지, 사진 경로, 키 또는 실제 테이블의 행을 조회하지 않습니다.
WITH tables AS (
  SELECT c.oid, n.nspname AS ns, c.relname AS rel, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname,c.relname) IN (
    ('public','member_inquiries'),('public','inquiry_messages'),('public','member_community_reads'),
    ('center_inquiry_retention_private','member_deletions'),('center_inquiry_retention_private','message_deletions'),
    ('center_inquiry_media_private','requests'),('center_inquiry_media_private','images')
  ) AND c.relkind IN ('r','p')
), hooked AS (
  SELECT t.ns,t.rel,g.tgname,g.tgfoid,g.tgenabled,pg_catalog.pg_get_triggerdef(g.oid) AS definition
  FROM tables t JOIN pg_catalog.pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
), functions AS (
  SELECT p.oid,n.nspname AS ns,p.proname,p.prosecdef,p.proconfig
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND (
    (n.nspname='public' AND (p.proname ILIKE '%inquiry%' OR p.proname IN
      ('member_community_mark_read','member_community_read_state','center_member_features_allowed','is_current_user_admin')))
    OR n.nspname='center_inquiry_retention_private'
    OR (n.nspname='center_inquiry_media_private' AND p.proname IN ('room_access','assert_actor'))
    OR (n.nspname='center_deletion_private' AND p.proname IN ('scopes','user_active'))
    OR p.oid IN (SELECT tgfoid FROM hooked)
  )
), results AS (
  SELECT '00_preflight' AS section,'v410' AS item,jsonb_build_object(
    'result','v410 통합 문의창 구조 확인',
    'threads',to_regclass('public.member_inquiries') IS NOT NULL,
    'messages',to_regclass('public.inquiry_messages') IS NOT NULL,
    'room_retention',to_regclass('center_inquiry_retention_private.member_deletions') IS NOT NULL,
    'message_images',to_regclass('center_inquiry_media_private.images') IS NOT NULL) AS details
  UNION ALL
  SELECT '01_table',t.ns||'.'||t.rel,jsonb_build_object('rls',rls,'force_rls',forced,
    'columns',(SELECT jsonb_object_agg(a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod))
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
    'keys',(SELECT jsonb_agg(pg_catalog.pg_get_constraintdef(k.oid) ORDER BY k.conname)
      FROM pg_catalog.pg_constraint k WHERE k.conrelid=t.oid),
    'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_catalog.pg_indexes i
      WHERE i.schemaname=t.ns AND i.tablename=t.rel))
  FROM tables t
  UNION ALL
  SELECT '02_policy',p.schemaname||'.'||p.tablename||'.'||p.policyname,
    jsonb_build_object('cmd',p.cmd,'roles',p.roles,'kind',p.permissive,'using',p.qual,'check',p.with_check)
  FROM pg_catalog.pg_policies p WHERE (p.schemaname,p.tablename) IN (SELECT ns,rel FROM tables)
    OR (p.schemaname='storage' AND p.tablename='objects' AND p.policyname ILIKE '%inquiry%')
  UNION ALL
  SELECT '03_trigger',ns||'.'||rel||'.'||tgname,jsonb_build_object('enabled',tgenabled,'sql',definition) FROM hooked
  UNION ALL
  SELECT '04_function',ns||'.'||proname||'('||pg_catalog.pg_get_function_identity_arguments(oid)||')',
    jsonb_build_object('security_definer',prosecdef,'settings',proconfig,
      'anon_execute',has_function_privilege('anon',oid,'execute'),
      'member_execute',has_function_privilege('authenticated',oid,'execute'),
      'definition',CASE WHEN ns IN ('public','center_inquiry_retention_private','center_inquiry_media_private')
        OR (ns='center_deletion_private' AND proname IN ('scopes','user_active'))
        THEN pg_catalog.pg_get_functiondef(oid) END)
  FROM functions
)
SELECT section,item,details FROM results ORDER BY section,item;
