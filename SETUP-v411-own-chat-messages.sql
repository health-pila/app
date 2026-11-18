-- v410 설정 완료 후 Supabase SQL Editor에서 전체를 실행하세요.
BEGIN;
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '20s';

-- Verify the three existing functions before updating them. Re-running v411 is supported.
DO $guard$
DECLARE expected record; actual text;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public.member_hide_chat_message_v410(uuid,uuid)','ec48b89767cc73b1da425b5b772c448c','a14fd899399f29c21f6a687901dcf834'),
    ('public.member_chat_history_v410(uuid,timestamptz,uuid,integer)','772d797eccc220c470a0be43e1900ebd','f89ac809f509b0af208944ea4f1d6cc0'),
    ('center_inquiry_retention_private.mark_deleted(uuid,uuid)','fa67db5bbeb9143be67a2f5ed5fa24fc','7d440057635e261a1904ba4923e48072')
  ) AS v(signature,previous,current_hash) LOOP
    SELECT md5(replace(p.prosrc,chr(13),'')) INTO actual
      FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
    IF actual IS NULL OR actual NOT IN (expected.previous,expected.current_hash) THEN
      RAISE EXCEPTION 'v411: 먼저 현재 함수 정의를 확인해 주세요. %',expected.signature;
    END IF;
  END LOOP;
END $guard$;

CREATE OR REPLACE FUNCTION public.member_hide_chat_message_v410(p_expected_user_id uuid, p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='3s' AS $$
DECLARE
  room public.member_inquiries%ROWTYPE;
  first_id uuid;
  marked_at timestamptz;
BEGIN
  IF center_inquiry_media_private.assert_actor(p_expected_user_id) <> 'member' THEN
    RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-delete:'||p_expected_user_id::text,0));
  PERFORM center_inquiry_media_private.assert_actor(p_expected_user_id);
  SELECT i.* INTO room FROM public.member_inquiries i
    JOIN public.inquiry_messages m ON m.inquiry_id=i.id
    WHERE m.id=p_message_id AND i.user_id=p_expected_user_id
      AND m.sender_role='member' AND m.sender_id=p_expected_user_id
    FOR UPDATE OF i;
  IF NOT FOUND OR NOT public.member_inquiry_visible_v400(room.id) THEN
    RAISE EXCEPTION 'MESSAGE_UNAVAILABLE' USING ERRCODE='P0002';
  END IF;
  SELECT id INTO first_id FROM public.inquiry_messages WHERE inquiry_id=room.id
    ORDER BY created_at,id LIMIT 1;
  INSERT INTO center_inquiry_retention_private.message_deletions(message_id,user_id,original_title)
    VALUES(p_message_id,p_expected_user_id,CASE WHEN first_id=p_message_id THEN room.title END)
    ON CONFLICT(message_id) DO NOTHING RETURNING deleted_at INTO marked_at;
  IF FOUND THEN
    -- Legacy clients show the first message preview from the parent row.
    -- Retain that original title privately and notify existing realtime listeners.
    UPDATE public.member_inquiries SET updated_at=greatest(updated_at,marked_at),
      title=CASE WHEN first_id=p_message_id THEN '센터 문의' ELSE title END
      WHERE id=room.id;
  ELSE
    SELECT d.deleted_at INTO STRICT marked_at FROM center_inquiry_retention_private.message_deletions d
      WHERE d.message_id=p_message_id AND d.user_id=p_expected_user_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'message_id',p_message_id,'deleted_at',marked_at);
END $$;

CREATE OR REPLACE FUNCTION public.member_chat_history_v410(p_expected_user_id uuid,
  p_before_at timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb;
BEGIN
  IF center_inquiry_media_private.assert_actor(p_expected_user_id) <> 'member' THEN
    RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF (p_before_at IS NULL) <> (p_before_id IS NULL) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_CHAT_PAGE' USING ERRCODE='22023';
  END IF;
  WITH page AS MATERIALIZED (
    SELECT m.id,m.inquiry_id,m.sender_role,m.body,m.created_at,
      (m.sender_role='member' AND m.sender_id=p_expected_user_id) AS can_delete
    FROM public.member_inquiries i JOIN public.inquiry_messages m ON i.id=m.inquiry_id
    WHERE i.user_id=p_expected_user_id AND public.member_inquiry_visible_v400(i.id)
      AND public.member_chat_message_visible_v410(m.id)
      AND (p_before_at IS NULL OR (m.created_at,m.id)<(p_before_at,p_before_id))
    ORDER BY m.created_at DESC,m.id DESC LIMIT (p_limit+1)
  )
  SELECT jsonb_build_object('ok',true,'has_more',(SELECT count(*)>p_limit FROM page),
    'messages',coalesce(jsonb_agg(to_jsonb(p) ORDER BY created_at DESC,id DESC),'[]'::jsonb))
    INTO result FROM (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit) p;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION center_inquiry_retention_private.mark_deleted(i uuid, u uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE at timestamptz;
BEGIN
  IF center_inquiry_media_private.assert_actor(u) <> 'member' THEN
    RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT d.deleted_at INTO at FROM center_inquiry_retention_private.member_deletions d
    WHERE d.inquiry_id=i AND d.user_id=u;
  IF NOT FOUND THEN
    RAISE EXCEPTION '앱을 새로고침한 뒤 직접 보낸 말풍선 옆의 삭제 버튼을 눌러 주세요.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('ok',true,'version',400,'inquiry_id',i,'deleted_at',at,'already_deleted',true);
END $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT 'v411 회원 본인 말풍선 삭제 설정 완료' AS result;
