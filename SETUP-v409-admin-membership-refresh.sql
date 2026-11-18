-- v409 관리자 이용권 갱신. 기존 회원별 재시도 간격과 수집 잠금을 공유한다.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.admin_membership_refresh_begin_v409(p_admin_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='5s'
AS $begin$
DECLARE
  v_group CONSTANT text:='01M67C55ZHBYVAZDVA8E1V56MK';
  v_crm text; v_lease uuid:=gen_random_uuid(); v_attempt timestamptz; v_until timestamptz;
  v_now timestamptz:=clock_timestamp();
BEGIN
  PERFORM center_admin_history_private.assert_server();
  PERFORM center_admin_history_private.assert_admin(p_admin_id);
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user_id::text,0));
  IF NOT center_deletion_private.user_active(p_user_id) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=p_user_id AND role::text='member') THEN
    RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce((SELECT enabled FROM broj_private.sync_settings WHERE singleton),false) THEN
    RETURN jsonb_build_object('started',false,'code','SYNC_DISABLED');
  END IF;
  SELECT crm_member_id INTO v_crm FROM broj_private.member_links WHERE group_id=v_group AND user_id=p_user_id FOR KEY SHARE;
  IF v_crm IS NULL THEN RETURN jsonb_build_object('started',false,'code','NOT_LINKED'); END IF;
  SELECT attempted_at INTO v_attempt FROM broj_private.member_refresh_requests_v345 WHERE user_id=p_user_id;
  IF v_attempt>v_now-interval '60 seconds' THEN
    RETURN jsonb_build_object('started',false,'code','COOLDOWN',
      'retry_after_seconds',greatest(1,ceil(extract(epoch FROM v_attempt+interval '60 seconds'-v_now))::integer));
  END IF;
  INSERT INTO broj_private.membership_snapshots(group_id,crm_member_id,user_id)
    VALUES(v_group,v_crm,p_user_id) ON CONFLICT DO NOTHING;
  BEGIN
    SELECT lease_until INTO v_until FROM broj_private.membership_snapshots
      WHERE group_id=v_group AND crm_member_id=v_crm AND user_id=p_user_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('started',false,'code','BUSY','retry_after_seconds',5);
  END;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF v_until>v_now THEN RETURN jsonb_build_object('started',false,'code','BUSY','retry_after_seconds',5); END IF;
  UPDATE broj_private.membership_snapshots SET lease_id=v_lease,lease_until=v_now+interval '2 minutes'
    WHERE group_id=v_group AND crm_member_id=v_crm AND user_id=p_user_id;
  INSERT INTO broj_private.member_refresh_requests_v345(user_id,attempted_at,lease_id)
    VALUES(p_user_id,v_now,v_lease) ON CONFLICT(user_id) DO UPDATE
      SET attempted_at=excluded.attempted_at,lease_id=excluded.lease_id;
  RETURN jsonb_build_object('started',true,'user_id',p_user_id,'group_id',v_group,'member_id',v_crm,'lease_id',v_lease);
END;
$begin$;

CREATE OR REPLACE FUNCTION public.admin_membership_refresh_commit_v409(p_admin_id uuid, p_user_id uuid,p_lease_id uuid,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='8s'
AS $commit$
DECLARE v_crm text; v_ack jsonb; v_at timestamptz;
BEGIN
  PERFORM center_admin_history_private.assert_server();
  PERFORM center_admin_history_private.assert_admin(p_admin_id);
  IF p_user_id IS NULL OR p_lease_id IS NULL THEN RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user_id::text,0));
  IF NOT center_deletion_private.user_active(p_user_id) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=p_user_id AND role::text='member') THEN
    RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  SELECT s.crm_member_id INTO v_crm FROM broj_private.membership_snapshots s
    JOIN broj_private.member_links l USING(group_id,crm_member_id,user_id)
    JOIN broj_private.member_refresh_requests_v345 r ON r.user_id=s.user_id AND r.lease_id=s.lease_id
    WHERE s.group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND s.user_id=p_user_id
      AND s.lease_id=p_lease_id AND s.lease_until>clock_timestamp() FOR UPDATE OF s FOR KEY SHARE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFRESH_CHANGED' USING ERRCODE='40001'; END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_results)<>1 OR p_results->0->>'crm_member_id' IS DISTINCT FROM v_crm THEN
    RAISE EXCEPTION 'INVALID_REFRESH_RESULT' USING ERRCODE='22023';
  END IF;
  IF p_results->0->'eligibility_complete' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'INCOMPLETE_REFRESH_RESULT' USING ERRCODE='22023';
  END IF;
  v_ack:=public.broj_complete_memberships_with_eligibility(p_lease_id,p_results);
  IF v_ack->>'ok' IS DISTINCT FROM 'true' OR v_ack->>'updated_members' IS DISTINCT FROM '1'
    OR v_ack->>'eligibility_updated_members' IS DISTINCT FROM '1' OR v_ack->>'access_changes' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'REFRESH_UNCONFIRMED' USING ERRCODE='40001';
  END IF;
  SELECT synced_at INTO v_at FROM broj_private.membership_snapshots
    WHERE user_id=p_user_id AND group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND crm_member_id=v_crm
      AND eligibility_complete AND synced_at=eligibility_synced_at AND error_code IS NULL;
  UPDATE broj_private.member_refresh_requests_v345 SET succeeded_at=v_at,lease_id=NULL
    WHERE user_id=p_user_id AND lease_id=p_lease_id;
  IF NOT FOUND OR v_at IS NULL THEN RAISE EXCEPTION 'REFRESH_UNCONFIRMED' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'synced_at',v_at);
END;
$commit$;

REVOKE ALL ON FUNCTION public.admin_membership_refresh_begin_v409(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_membership_refresh_begin_v409(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_membership_refresh_commit_v409(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_membership_refresh_commit_v409(uuid,uuid,uuid,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT 'v409 관리자 이용권 갱신 설정 완료' AS result;
