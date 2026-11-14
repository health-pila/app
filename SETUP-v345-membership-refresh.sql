BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Add a separate, self-only refresh path. Existing collectors and classifiers stay intact.
DO $guard$
DECLARE c text;
BEGIN
  IF to_regprocedure('public.broj_complete_memberships_with_eligibility(uuid,jsonb)') IS NULL
    OR to_regprocedure('public.broj_reserve_api_call(text)') IS NULL
    OR to_regprocedure('public.broj_my_memberships()') IS NULL
    OR to_regprocedure('center_deletion_private.user_active(uuid)') IS NULL
    OR to_regprocedure('public.center_service_member_features_allowed(uuid)') IS NULL
    OR to_regprocedure('center_deletion_private.guard_member_write()') IS NULL THEN
    RAISE EXCEPTION 'Existing membership, eligibility and deletion installation is required';
  END IF;
  FOREACH c IN ARRAY ARRAY['group_id','crm_member_id','user_id','tickets','synced_at','next_due_at',
    'lease_id','lease_until','error_code','eligibility_tickets','eligibility_complete','eligibility_synced_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='broj_private' AND table_name='membership_snapshots' AND column_name=c) THEN
      RAISE EXCEPTION 'Membership snapshot column missing: %',c;
    END IF;
  END LOOP;
END;
$guard$;

CREATE TABLE IF NOT EXISTS broj_private.member_refresh_requests_v345 (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL CHECK (isfinite(attempted_at)),
  succeeded_at timestamptz CHECK (succeeded_at IS NULL OR isfinite(succeeded_at)),
  lease_id uuid
);
ALTER TABLE broj_private.member_refresh_requests_v345 ENABLE ROW LEVEL SECURITY;
ALTER TABLE broj_private.member_refresh_requests_v345 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON broj_private.member_refresh_requests_v345 FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS center_delete_guard_v345 ON broj_private.member_refresh_requests_v345;
CREATE TRIGGER center_delete_guard_v345 BEFORE INSERT OR UPDATE ON broj_private.member_refresh_requests_v345
  FOR EACH ROW EXECUTE FUNCTION center_deletion_private.guard_member_write('user_id');

CREATE OR REPLACE FUNCTION public.member_membership_refresh_begin_v345(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='5s'
AS $begin$
DECLARE
  v_group CONSTANT text:='01M67C55ZHBYVAZDVA8E1V56MK';
  v_crm text; v_lease uuid:=gen_random_uuid(); v_attempt timestamptz; v_until timestamptz;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user_id::text,0));
  IF NOT center_deletion_private.user_active(p_user_id) OR NOT public.center_service_member_features_allowed(p_user_id) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=p_user_id AND role::text='member') THEN
    RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce((SELECT enabled FROM broj_private.sync_settings WHERE singleton),false) THEN
    RETURN jsonb_build_object('started',false,'code','SYNC_DISABLED');
  END IF;
  SELECT crm_member_id INTO v_crm FROM broj_private.member_links WHERE group_id=v_group AND user_id=p_user_id;
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

CREATE OR REPLACE FUNCTION public.member_membership_refresh_commit_v345(p_user_id uuid,p_lease_id uuid,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='8s'
AS $commit$
DECLARE v_crm text; v_ack jsonb; v_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_lease_id IS NULL THEN RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user_id::text,0));
  IF NOT center_deletion_private.user_active(p_user_id) OR NOT public.center_service_member_features_allowed(p_user_id) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=p_user_id AND role::text='member') THEN
    RAISE EXCEPTION 'MEMBER_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  SELECT s.crm_member_id INTO v_crm FROM broj_private.membership_snapshots s
    JOIN broj_private.member_links l USING(group_id,crm_member_id,user_id)
    JOIN broj_private.member_refresh_requests_v345 r ON r.user_id=s.user_id AND r.lease_id=s.lease_id
    WHERE s.group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND s.user_id=p_user_id
      AND s.lease_id=p_lease_id AND s.lease_until>clock_timestamp() FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFRESH_CHANGED' USING ERRCODE='40001'; END IF;
  IF p_results IS NULL OR jsonb_typeof(p_results) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_results)<>1 OR p_results->0->>'crm_member_id' IS DISTINCT FROM v_crm THEN
    RAISE EXCEPTION 'INVALID_REFRESH_RESULT' USING ERRCODE='22023';
  END IF;
  v_ack:=public.broj_complete_memberships_with_eligibility(p_lease_id,p_results);
  IF v_ack->>'ok' IS DISTINCT FROM 'true' OR v_ack->>'updated_members' IS DISTINCT FROM '1'
    OR v_ack->>'eligibility_updated_members' IS DISTINCT FROM '1' OR v_ack->>'access_changes' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'REFRESH_UNCONFIRMED' USING ERRCODE='40001';
  END IF;
  SELECT synced_at INTO v_at FROM broj_private.membership_snapshots
    WHERE user_id=p_user_id AND group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND crm_member_id=v_crm;
  UPDATE broj_private.member_refresh_requests_v345 SET succeeded_at=v_at,lease_id=NULL
    WHERE user_id=p_user_id AND lease_id=p_lease_id;
  IF NOT FOUND OR v_at IS NULL THEN RAISE EXCEPTION 'REFRESH_UNCONFIRMED' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('ok',true,'user_id',p_user_id,'synced_at',v_at);
END;
$commit$;

CREATE OR REPLACE FUNCTION public.member_membership_refresh_cancel_v345(p_user_id uuid,p_lease_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='5s'
AS $cancel$
BEGIN
  IF p_user_id IS NULL OR p_lease_id IS NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_user_id::text,0));
  IF NOT center_deletion_private.user_active(p_user_id) THEN RETURN jsonb_build_object('ok',true); END IF;
  -- Do not replace known data, error flags or the periodic collection deadline on failure.
  UPDATE broj_private.membership_snapshots SET lease_id=NULL,lease_until=NULL
    WHERE user_id=p_user_id AND group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND lease_id=p_lease_id;
  UPDATE broj_private.member_refresh_requests_v345 SET lease_id=NULL WHERE user_id=p_user_id AND lease_id=p_lease_id;
  RETURN jsonb_build_object('ok',true);
END;
$cancel$;

CREATE OR REPLACE FUNCTION broj_private.expiry_summary_v345(p_tickets jsonb,p_scope text,p_today date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $summary$
DECLARE t jsonb; v_start date; v_end date; v_current date; v_previous date; v_scheduled date[]:='{}'; v_uncertain boolean:=false;
BEGIN
  IF p_tickets IS NULL OR jsonb_typeof(p_tickets)<>'array' THEN
    RETURN jsonb_build_object('current_end_at',NULL,'previous_end_at',NULL,'scheduled_end_at','[]'::jsonb,'uncertain',true);
  END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_tickets) LOOP
    IF t->>'scope' IS DISTINCT FROM p_scope THEN CONTINUE; END IF;
    IF t->>'uncertain' IS DISTINCT FROM 'false' OR coalesce(t->>'status','') NOT IN ('ACTIVE','INACTIVE','SOON_ACTIVE','SOON_INACTIVE','HOLDING')
      OR (p_scope='gym' AND t->>'kind' IS DISTINCT FROM 'MEMBERSHIP')
      OR (p_scope='pilates' AND coalesce(t->>'kind','') NOT IN ('CLASS','ENTRY'))
      OR coalesce(t->>'start_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      OR coalesce(t->>'end_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
      v_uncertain:=true; CONTINUE;
    END IF;
    BEGIN v_start:=(t->>'start_at')::date; v_end:=(t->>'end_at')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN v_uncertain:=true; CONTINUE; END;
    IF v_start IS NULL OR v_end IS NULL OR v_start>v_end THEN v_uncertain:=true; CONTINUE; END IF;
    IF v_end<p_today THEN v_previous:=greatest(v_previous,v_end); CONTINUE; END IF;
    IF t->>'status'='INACTIVE' THEN CONTINUE; END IF;
    IF t->>'status'='SOON_ACTIVE' OR v_start>p_today THEN v_scheduled:=array_append(v_scheduled,v_end);
    ELSE v_current:=greatest(v_current,v_end); END IF;
  END LOOP;
  RETURN jsonb_build_object('current_end_at',v_current,'previous_end_at',v_previous,
    'scheduled_end_at',coalesce((SELECT jsonb_agg(x ORDER BY x) FROM (SELECT DISTINCT unnest(v_scheduled) x) q),'[]'::jsonb),
    'uncertain',v_uncertain);
END;
$summary$;

CREATE OR REPLACE FUNCTION public.admin_member_memberships_v345(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
SET statement_timeout='5s'
AS $admin$
DECLARE v_admin uuid:=auth.uid(); v_data record; v_state text; v_today date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF v_admin IS NULL OR NOT center_deletion_private.user_active(v_admin) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=v_admin AND role::text='admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR NOT center_deletion_private.user_active(p_user_id) OR NOT EXISTS
    (SELECT 1 FROM public.profiles WHERE id=p_user_id AND role::text='member') THEN
    RAISE EXCEPTION 'Member unavailable' USING ERRCODE='P0002';
  END IF;
  SELECT l.user_id,s.synced_at,s.eligibility_synced_at,s.eligibility_tickets,s.eligibility_complete,s.error_code INTO v_data
    FROM broj_private.member_links l LEFT JOIN broj_private.membership_snapshots s USING(group_id,crm_member_id,user_id)
    WHERE l.group_id='01M67C55ZHBYVAZDVA8E1V56MK' AND l.user_id=p_user_id;
  v_state:=CASE WHEN NOT FOUND THEN 'not_linked' WHEN v_data.eligibility_synced_at IS NULL THEN 'not_collected'
    WHEN v_data.error_code IS NOT NULL THEN 'sync_error'
    WHEN v_data.synced_at IS DISTINCT FROM v_data.eligibility_synced_at
      OR v_data.eligibility_synced_at<now()-interval '8 hours' OR v_data.eligibility_synced_at>now()+interval '1 minute' THEN 'stale'
    WHEN NOT coalesce(v_data.eligibility_complete,false) THEN 'incomplete' ELSE 'ready' END;
  RETURN jsonb_build_object('ok',true,'version',1,'user_id',p_user_id,'state',v_state,
    'synced_at',v_data.eligibility_synced_at,
    'gym',CASE WHEN v_state='ready' THEN broj_private.expiry_summary_v345(v_data.eligibility_tickets,'gym',v_today) ELSE NULL END,
    'pilates',CASE WHEN v_state='ready' THEN broj_private.expiry_summary_v345(v_data.eligibility_tickets,'pilates',v_today) ELSE NULL END);
END;
$admin$;

REVOKE ALL ON FUNCTION public.member_membership_refresh_begin_v345(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.member_membership_refresh_commit_v345(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.member_membership_refresh_cancel_v345(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.member_membership_refresh_begin_v345(uuid),
  public.member_membership_refresh_commit_v345(uuid,uuid,jsonb),public.member_membership_refresh_cancel_v345(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION broj_private.expiry_summary_v345(jsonb,text,date) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_member_memberships_v345(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_member_memberships_v345(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
