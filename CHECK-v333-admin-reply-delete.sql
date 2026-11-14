-- Read-only installation checks. Every ok value should be true.
with target as (
  select p.* from pg_proc p where p.oid = to_regprocedure('public.admin_delete_inquiry_reply_v333(uuid,uuid)')
), checks as (
  select '01_reply_delete_rpc_present'::text as check_name, exists(select 1 from target) as ok
  union all select '02_authenticated_execute', coalesce(has_function_privilege('authenticated',
    to_regprocedure('public.admin_delete_inquiry_reply_v333(uuid,uuid)'), 'EXECUTE'), false)
  union all select '03_anon_blocked', not coalesce(has_function_privilege('anon',
    to_regprocedure('public.admin_delete_inquiry_reply_v333(uuid,uuid)'), 'EXECUTE'), true)
  union all select '04_public_execute_blocked', exists(select 1 from target) and not exists(
    select 1 from target p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  union all select '05_definer_fixed_search_path', coalesce((select p.prosecdef and exists(
    select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path=')) from target p), false)
  union all select '06_mutation_is_volatile', coalesce((select provolatile = 'v' from target), false)
  union all select '07_no_rpc_overload', (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_delete_inquiry_reply_v333')
  union all select '08_existing_member_tables_rls', (select count(*) = 3 and bool_and(c.relrowsecurity)
    from pg_class c where c.oid in (to_regclass('public.inquiry_messages'), to_regclass('public.member_inquiries'), to_regclass('public.member_community_reads')))
  union all select '09_account_deletion_helper_present', to_regprocedure('center_deletion_private.user_active(uuid)') is not null
  union all select '10_existing_read_rpc_preserved', to_regprocedure('public.admin_inquiry_reply_read_state(uuid)') is not null
)
select check_name, ok from checks order by check_name;
