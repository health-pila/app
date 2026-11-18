-- v410 회원 통합 문의창. Supabase SQL Editor에서 파일 전체를 한 번 실행합니다.
BEGIN;
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '40s';

-- Keep a member's display choice separate from the original message and its attachments.
CREATE TABLE IF NOT EXISTS center_inquiry_retention_private.message_deletions (
  message_id uuid PRIMARY KEY REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  original_title text
);
CREATE INDEX IF NOT EXISTS inquiry_hidden_by_member_v410
  ON center_inquiry_retention_private.message_deletions(user_id);
ALTER TABLE center_inquiry_retention_private.message_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_inquiry_retention_private.message_deletions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON center_inquiry_retention_private.message_deletions FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.member_chat_message_visible_v410(p_message_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT public.is_current_user_admin()) OR NOT EXISTS (
    SELECT 1 FROM center_inquiry_retention_private.message_deletions d
    WHERE d.message_id=p_message_id AND d.user_id=(SELECT auth.uid())
  );
$$;

DROP POLICY IF EXISTS member_chat_message_visibility_v410 ON public.inquiry_messages;
CREATE POLICY member_chat_message_visibility_v410 ON public.inquiry_messages
  AS RESTRICTIVE FOR SELECT TO authenticated USING (public.member_chat_message_visible_v410(id));

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
    WHERE m.id=p_message_id AND i.user_id=p_expected_user_id FOR UPDATE OF i;
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

-- Newest-first keyset paging across every visible inquiry for this account.
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
    SELECT m.id,m.inquiry_id,m.sender_role,m.body,m.created_at
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

CREATE OR REPLACE FUNCTION public.admin_chat_message_deletions_v410(p_expected_admin_id uuid, p_message_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE entries jsonb;
BEGIN
  IF center_inquiry_media_private.assert_actor(p_expected_admin_id) <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_message_ids IS NULL OR cardinality(p_message_ids)>500 OR array_position(p_message_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_MESSAGE_IDS' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('message_id',message_id,'deleted_at',deleted_at)),'[]'::jsonb)
    INTO entries FROM center_inquiry_retention_private.message_deletions WHERE message_id=ANY(p_message_ids);
  RETURN jsonb_build_object('ok',true,'entries',entries);
END $$;

-- Rank once per member, then apply the inbox tab or search. An older pending room
-- cannot surface a second time after the latest question has received a reply.
CREATE OR REPLACE FUNCTION public.admin_chat_inbox_v410(p_expected_admin_id uuid, p_filter text DEFAULT 'all',
  p_query text DEFAULT '', p_member_id uuid DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb; term text:=lower(btrim(coalesce(p_query,'')));
BEGIN
  IF center_inquiry_media_private.assert_actor(p_expected_admin_id) <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_filter IS NULL OR p_filter NOT IN ('all','alerts','waiting','answered','archived') OR
     length(term)>80 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_offset IS NULL OR p_offset<0 THEN
    RAISE EXCEPTION 'INVALID_INBOX_PAGE' USING ERRCODE='22023';
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON (i.user_id) i.id,i.user_id,i.title,i.created_at,i.updated_at,i.last_message_at,i.archived_at,
      CASE WHEN last_msg.sender_role='admin' THEN 'answered'
           WHEN last_msg.sender_role='member' AND last_msg.created_at IS DISTINCT FROM i.last_message_at THEN 'waiting'
           ELSE i.status END AS status,
      coalesce(last_msg.created_at,i.last_message_at,i.created_at) AS sort_at
    FROM public.member_inquiries i
    LEFT JOIN center_inquiry_retention_private.member_deletions hidden ON hidden.inquiry_id=i.id
    LEFT JOIN LATERAL (SELECT m.id,m.created_at,m.sender_role FROM public.inquiry_messages m
      WHERE m.inquiry_id=i.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last_msg ON true
    WHERE p_member_id IS NULL OR i.user_id=p_member_id
    ORDER BY i.user_id,(hidden.inquiry_id IS NULL) DESC,
      coalesce(last_msg.created_at,i.last_message_at,i.created_at) DESC,last_msg.id DESC NULLS LAST,i.id DESC
  ), matched AS MATERIALIZED (
    SELECT l.* FROM latest l
    WHERE (p_filter IN ('alerts','all') OR p_filter='archived' AND l.archived_at IS NOT NULL
      OR p_filter=l.status AND l.archived_at IS NULL)
      AND (term='' OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=l.user_id AND
          (strpos(lower(p.display_name),term)>0 OR strpos(p.phone_last4,term)>0))
        OR EXISTS(SELECT 1 FROM public.member_inquiries i WHERE i.user_id=l.user_id AND
          (strpos(lower(i.title),term)>0 OR EXISTS(SELECT 1 FROM public.inquiry_messages m
            WHERE m.inquiry_id=i.id AND strpos(lower(m.body),term)>0))))
  ), page AS (
    SELECT * FROM matched ORDER BY sort_at DESC,id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('ok',true,'total_count',(SELECT count(*) FROM matched),
    'inquiries',coalesce(jsonb_agg((to_jsonb(p)-'sort_at'-'title') ||
      CASE WHEN p_filter='alerts' THEN '{}'::jsonb ELSE jsonb_build_object(
        'title',p.title,'memberProfile',(SELECT jsonb_build_object('id',pr.id,'display_name',pr.display_name,
          'email',pr.email,'phone_last4',pr.phone_last4) FROM public.profiles pr WHERE pr.id=p.user_id),
        'latest_member_message',coalesce((SELECT jsonb_build_array(jsonb_build_object('body',m.body))
          FROM public.inquiry_messages m WHERE m.inquiry_id=p.id AND m.sender_role='member'
          ORDER BY m.created_at DESC,m.id DESC LIMIT 1),'[]'::jsonb)) END
      ORDER BY p.sort_at DESC,p.id DESC),'[]'::jsonb)) INTO result FROM page p;
  RETURN result;
END $$;

-- The following functions also serve installed older clients. Preserve all of
-- their existing rules, and abort the transaction if a newer version is present.
DO $guard$
DECLARE f record; actual text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('public.inquiry_image_access_v404(text,text)','e70268b26c6d44b101b19a5167ce88cd','3054579b46a897b4ac567e799d8416b4'),
  ('public.read_inquiry_images_v404(uuid,uuid[])','0bee29b6f97dcc41ca1e36f6299e8966','93e20cb13f04aa4340dde655bc7e6363'),
  ('public.member_community_mark_read(text[],text[])','3e64cf1be065913f4cc4f6d03bb3719b','4dc659e7dab53324f816b44eefe88841'),
  ('center_deletion_private.scopes()','26aaf6ce48088efe415d51fbbb686634','591c931977fb343f61d87e2d3496ac40')
 ) AS known(signature,before_change,after_change) LOOP
   SELECT md5(replace(p.prosrc,chr(13),'')) INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature);
   IF actual IS NULL OR actual NOT IN (f.before_change,f.after_change) THEN
     RAISE EXCEPTION 'v410: inspect current definition of %', f.signature;
   END IF;
 END LOOP;
END $guard$;

CREATE OR REPLACE FUNCTION public.inquiry_image_access_v404(p_path text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r center_inquiry_media_private.requests; img center_inquiry_media_private.images; a uuid:=auth.uid(); adm boolean;
begin
 if a is null or (select auth.role()) is distinct from 'authenticated'
 or not exists(select 1 from public.profiles where id=a and role in ('member','admin'))
 or not center_deletion_private.user_active(a)
 or not coalesce(public.center_member_features_allowed(),false) then return false; end if;
 select * into img from center_inquiry_media_private.images where path=p_path;
 if not found then return false; end if;
 select * into r from center_inquiry_media_private.requests where id=img.request_id;
 if not found or not center_deletion_private.user_active(r.member_id)
 or not center_deletion_private.user_active(r.sender_id) then return false; end if;
 adm:=coalesce(public.is_current_user_admin(),false);
 if p_action='read' then
  if img.message_id is not null then
   return center_inquiry_media_private.room_access(r.inquiry_id,a,false)
     and public.member_chat_message_visible_v410(img.message_id);
  end if;
  return r.sender_id=a and r.sent_message_id is null and r.expires_at>now()
    and (r.inquiry_id is null or center_inquiry_media_private.room_access(r.inquiry_id,a,true))
    or adm and (r.sent_message_id is not null or r.expires_at<=now());
 elsif p_action='insert' then
  return r.sender_id=a and r.sent_message_id is null and r.expires_at>now()
   and (r.inquiry_id is null or center_inquiry_media_private.room_access(r.inquiry_id,a,true))
   and (adm or exists(select 1 from public.app_settings where setting_key='member_inquiry_enabled' and is_enabled));
 elsif p_action='delete' then
  return img.message_id is null and (r.sender_id=a and r.sent_message_id is null
    or adm and (r.sent_message_id is not null or r.expires_at<=now()));
 end if;
 return false;
end $function$;

CREATE OR REPLACE FUNCTION public.read_inquiry_images_v404(p_expected_user_id uuid, p_message_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare entries jsonb;
begin
 perform center_inquiry_media_private.assert_actor(p_expected_user_id);
 if p_message_ids is null or cardinality(p_message_ids)>200 or array_position(p_message_ids,null) is not null then
  raise exception 'INVALID_INQUIRY_MESSAGE_IDS' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'message_id',i.message_id,'path',i.path,
  'position',i.position,'mime_type',i.mime_type,'bytes',i.bytes,'width',i.width,'height',i.height) order by m.created_at,m.id,i.position),'[]')
 into entries from center_inquiry_media_private.images i
 join center_inquiry_media_private.requests r on r.id=i.request_id
 join public.inquiry_messages m on m.id=i.message_id and m.inquiry_id=r.inquiry_id
 where i.message_id=any(p_message_ids) and center_inquiry_media_private.room_access(r.inquiry_id,auth.uid(),false)
   and public.member_chat_message_visible_v410(m.id);
 return jsonb_build_object('ok',true,'version',404,'entries',entries);
end $function$;

CREATE OR REPLACE FUNCTION public.member_community_mark_read(p_news_ids text[] DEFAULT '{}'::text[], p_reply_ids text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare uid uuid:=auth.uid();
begin
 if not coalesce(public.center_member_features_allowed(),false) then raise exception 'CENTER_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if uid is null or not exists(select 1 from public.profiles p join auth.users a on a.id=p.id where p.id=uid and p.role='member') then
  raise exception 'Member authentication required' using errcode='42501'; end if;
 if p_news_ids is null or p_reply_ids is null or cardinality(p_news_ids)+cardinality(p_reply_ids)>500
 or exists(select 1 from unnest(p_news_ids||p_reply_ids) x where x is null or length(x) not between 1 and 100) then
  raise exception 'Invalid read markers' using errcode='22023'; end if;
 insert into public.member_community_reads(user_id,kind,item_id)
 select uid,'news',p.id::text from public.community_posts p where p.is_published=true and p.id::text=any(p_news_ids)
 on conflict do nothing;
 insert into public.member_community_reads(user_id,kind,item_id)
 select uid,'reply',m.id::text from public.inquiry_messages m join public.member_inquiries i on i.id=m.inquiry_id
 where i.user_id=uid and m.sender_role='admin' and m.id::text=any(p_reply_ids)
 and public.member_inquiry_visible_v400(i.id) and public.member_chat_message_visible_v410(m.id) on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION center_deletion_private.scopes()
 RETURNS TABLE(s text, t text, c text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select * from center_deletion_private.base_scopes_v404()
 union select 'center_inquiry_media_private','requests','member_id'
 union select 'center_inquiry_retention_private','message_deletions','user_id'
$function$;

REVOKE ALL ON FUNCTION
  public.member_chat_message_visible_v410(uuid),
  public.member_hide_chat_message_v410(uuid,uuid),
  public.member_chat_history_v410(uuid,timestamptz,uuid,integer),
  public.admin_chat_message_deletions_v410(uuid,uuid[]),
  public.admin_chat_inbox_v410(uuid,text,text,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.member_chat_message_visible_v410(uuid),
  public.member_hide_chat_message_v410(uuid,uuid),
  public.member_chat_history_v410(uuid,timestamptz,uuid,integer),
  public.admin_chat_message_deletions_v410(uuid,uuid[]),
  public.admin_chat_inbox_v410(uuid,text,text,uuid,integer,integer)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT 'v410 회원 통합 문의·말풍선 삭제 설정 완료' AS result;
