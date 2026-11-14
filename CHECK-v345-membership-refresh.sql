SELECT '01_server_refresh_rpcs_present' AS check_name,
  to_regprocedure('public.member_membership_refresh_begin_v345(uuid)') IS NOT NULL
  AND to_regprocedure('public.member_membership_refresh_commit_v345(uuid,uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.member_membership_refresh_cancel_v345(uuid,uuid)') IS NOT NULL AS ok
UNION ALL
SELECT '02_server_refresh_execute',bool_and(has_function_privilege('service_role',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('member_membership_refresh_begin_v345','member_membership_refresh_commit_v345','member_membership_refresh_cancel_v345')
UNION ALL
SELECT '03_browser_refresh_rpc_execute_blocked',bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('member_membership_refresh_begin_v345','member_membership_refresh_commit_v345','member_membership_refresh_cancel_v345')
UNION ALL
SELECT '04_new_rpc_security',count(*)=4 AND bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('member_membership_refresh_begin_v345','member_membership_refresh_commit_v345','member_membership_refresh_cancel_v345','admin_member_memberships_v345')
UNION ALL
SELECT '05_admin_reader_execute',has_function_privilege('authenticated','public.admin_member_memberships_v345(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.admin_member_memberships_v345(uuid)','EXECUTE')
UNION ALL
SELECT '06_refresh_state_private',relrowsecurity AND relforcerowsecurity
  AND NOT has_table_privilege('anon','broj_private.member_refresh_requests_v345','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated','broj_private.member_refresh_requests_v345','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role','broj_private.member_refresh_requests_v345','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  FROM pg_class WHERE oid='broj_private.member_refresh_requests_v345'::regclass
UNION ALL
SELECT '07_deletion_guard_attached',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='broj_private.member_refresh_requests_v345'::regclass
  AND tgname='center_delete_guard_v345' AND NOT tgisinternal AND tgenabled='O')
UNION ALL
SELECT '08_refresh_state_cascades',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='broj_private.member_refresh_requests_v345'::regclass
  AND contype='f' AND confrelid='public.profiles'::regclass AND confdeltype='c')
UNION ALL
SELECT '09_existing_membership_reader_preserved',has_function_privilege('authenticated','public.broj_my_memberships()','EXECUTE')
  AND NOT has_function_privilege('anon','public.broj_my_memberships()','EXECUTE')
UNION ALL
SELECT '10_existing_eligibility_writer_preserved',to_regprocedure('public.broj_complete_memberships_with_eligibility(uuid,jsonb)') IS NOT NULL
  AND has_function_privilege('service_role','public.broj_complete_memberships_with_eligibility(uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.broj_complete_memberships_with_eligibility(uuid,jsonb)','EXECUTE')
UNION ALL
SELECT '11_existing_snapshot_private',relrowsecurity AND relforcerowsecurity
  AND NOT has_table_privilege('authenticated','broj_private.membership_snapshots','SELECT,INSERT,UPDATE,DELETE')
  FROM pg_class WHERE oid='broj_private.membership_snapshots'::regclass
UNION ALL
SELECT '12_helper_private',NOT has_function_privilege('authenticated','broj_private.expiry_summary_v345(jsonb,text,date)','EXECUTE')
  AND NOT has_function_privilege('anon','broj_private.expiry_summary_v345(jsonb,text,date)','EXECUTE')
ORDER BY check_name;
