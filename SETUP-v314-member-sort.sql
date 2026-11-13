BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Read existing snapshots only. No collection, account, access or ticket writes.
DO $guard$
BEGIN
  IF to_regprocedure('public.broj_admin_member_eligibility()') IS NULL
    OR to_regclass('broj_private.membership_snapshots') IS NULL
    OR to_regclass('broj_private.member_links') IS NULL THEN
    RAISE EXCEPTION 'Existing membership classification is required';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION broj_private.gym_sort_expiry_v314(p_tickets jsonb,p_today date)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $expiry$
DECLARE t jsonb; v_start date; v_end date; v_current date; v_expired date;
BEGIN
  IF jsonb_typeof(p_tickets) IS DISTINCT FROM 'array' OR p_today IS NULL THEN RETURN NULL; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_tickets) LOOP
    IF t->>'scope' IS DISTINCT FROM 'gym' OR t->>'kind' IS DISTINCT FROM 'MEMBERSHIP'
      OR t->>'uncertain' IS DISTINCT FROM 'false'
      OR coalesce(t->>'status','') NOT IN ('ACTIVE','SOON_INACTIVE','HOLDING')
      OR coalesce(t->>'start_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      OR coalesce(t->>'end_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN CONTINUE; END IF;
    BEGIN
      v_start:=(t->>'start_at')::date; v_end:=(t->>'end_at')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN CONTINUE;
    END;
    -- Future tickets are not the current gym membership's expiry.
    IF v_start>v_end OR v_start>p_today THEN CONTINUE; END IF;
    IF v_end>=p_today THEN v_current:=greatest(v_current,v_end);
    ELSE v_expired:=greatest(v_expired,v_end); END IF;
  END LOOP;
  RETURN coalesce(v_current,v_expired);
END;
$expiry$;

CREATE OR REPLACE FUNCTION public.broj_admin_member_sort_facts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET statement_timeout = '5s'
AS $admin$
DECLARE v_user uuid:=auth.uid(); v_members jsonb;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users a ON a.id=p.id
    WHERE p.id=v_user AND p.role::text='admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.id,'synced_at',s.eligibility_synced_at,
    'gym_end_at',CASE WHEN l.user_id IS NOT NULL AND s.error_code IS NULL AND s.eligibility_complete
      AND s.synced_at=s.eligibility_synced_at AND s.eligibility_synced_at>=now()-interval '8 hours'
      AND s.eligibility_synced_at<=now()+interval '1 minute'
      THEN broj_private.gym_sort_expiry_v314(s.eligibility_tickets,(now() AT TIME ZONE 'Asia/Seoul')::date)
      ELSE NULL END) ORDER BY p.id),'[]'::jsonb) INTO v_members
    FROM public.profiles p LEFT JOIN broj_private.member_links l
      ON l.user_id=p.id AND l.group_id='01M67C55ZHBYVAZDVA8E1V56MK'
    LEFT JOIN broj_private.membership_snapshots s
      ON s.group_id=l.group_id AND s.crm_member_id=l.crm_member_id AND s.user_id=l.user_id
    WHERE p.role::text='member';
  RETURN jsonb_build_object('ok',true,'version',1,'checked_at',now(),'members',v_members);
END;
$admin$;

REVOKE ALL ON FUNCTION broj_private.gym_sort_expiry_v314(jsonb,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.broj_admin_member_sort_facts() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.broj_admin_member_sort_facts() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT
  to_regprocedure('public.broj_admin_member_sort_facts()') IS NOT NULL AS sort_rpc_ready,
  has_function_privilege('authenticated','public.broj_admin_member_sort_facts()','EXECUTE') AS authenticated_rpc_ready,
  NOT has_function_privilege('anon','public.broj_admin_member_sort_facts()','EXECUTE') AS anonymous_blocked,
  NOT has_table_privilege('authenticated','broj_private.membership_snapshots','SELECT,INSERT,UPDATE,DELETE') AS private_snapshot_blocked,
  to_regprocedure('public.broj_admin_member_eligibility()') IS NOT NULL AS existing_eligibility_ready;
