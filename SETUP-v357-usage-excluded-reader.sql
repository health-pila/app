-- 설정용: 관리자 전용 통계 제외 회원 조회 함수를 추가합니다.
-- 기존 제외 설정과 통계 데이터는 변경하지 않습니다.
BEGIN;
DO $precheck$
BEGIN
  IF to_regclass('center_usage_private.excluded') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regprocedure('public.admin_center_usage_exclude_v242(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '기존 통계 제외 기능의 설치 상태를 확인해 주세요.';
  END IF;
END
$precheck$;

CREATE OR REPLACE FUNCTION public.admin_center_usage_excluded_v357(
  p_expected_admin_id uuid,
  p_after_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  v_admin_id uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_admin_id IS NULL OR p_expected_admin_id IS DISTINCT FROM v_admin_id
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_admin_id AND p.role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Administrator authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid page limit' USING ERRCODE = '22023';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT e.user_id,
           coalesce(nullif(btrim(p.display_name), ''), '이름 없음') AS name,
           CASE WHEN p.phone_last4 ~ '^[0-9]{4}$' THEN p.phone_last4 ELSE NULL END AS last4
    FROM center_usage_private.excluded e
    JOIN public.profiles p ON p.id = e.user_id
    WHERE p.role = 'member'
  ), page AS MATERIALIZED (
    SELECT * FROM eligible
    WHERE p_after_user_id IS NULL OR user_id > p_after_user_id
    ORDER BY user_id LIMIT p_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY user_id LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'ok', true, 'version', 1, 'admin_id', v_admin_id,
    'total', (SELECT count(*) FROM eligible),
    'has_more', (SELECT count(*) FROM page) > p_limit,
    'built_at', statement_timestamp(),
    'excluded_members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'name', name, 'last4', last4) ORDER BY user_id)
      FROM visible
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_center_usage_excluded_v357(uuid,uuid,integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_center_usage_excluded_v357(uuid,uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.admin_center_usage_excluded_v357(uuid,uuid,integer)
  IS 'v357: administrator-only, read-only, paginated list of explicitly excluded member accounts; no email or usage content.';
COMMIT;

WITH target AS (
  SELECT * FROM pg_proc
  WHERE oid = to_regprocedure('public.admin_center_usage_excluded_v357(uuid,uuid,integer)')
), checks AS (
  SELECT '01_reader_present'::text AS check_name, EXISTS(SELECT 1 FROM target) AS ok
  UNION ALL SELECT '02_authenticated_execute', has_function_privilege('authenticated', 'public.admin_center_usage_excluded_v357(uuid,uuid,integer)', 'EXECUTE')
  UNION ALL SELECT '03_anon_and_public_blocked',
    NOT has_function_privilege('anon', 'public.admin_center_usage_excluded_v357(uuid,uuid,integer)', 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM target p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  UNION ALL SELECT '04_reader_security', coalesce((SELECT prosecdef AND provolatile = 's' AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c IN ('search_path=""', 'search_path=')) FROM target), false)
  UNION ALL SELECT '05_private_table_not_exposed', NOT has_table_privilege('authenticated', 'center_usage_private.excluded', 'SELECT') AND NOT has_table_privilege('anon', 'center_usage_private.excluded', 'SELECT')
  UNION ALL SELECT '06_existing_write_rpc_preserved', to_regprocedure('public.admin_center_usage_exclude_v242(uuid,boolean)') IS NOT NULL
)
SELECT check_name, ok FROM checks ORDER BY check_name;
