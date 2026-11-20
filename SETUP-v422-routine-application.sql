-- 루틴 신청서 선택 범위와 두 메모 칸의 줄바꿈을 허용합니다.
-- 파일 덮어쓰기 전에 Supabase SQL Editor에서 실행합니다. 반복 실행할 수 있습니다.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('routine_application_private.normalize_answers(jsonb)') is null then
    raise exception '기존 루틴 신청서 검증 함수를 찾을 수 없습니다.';
  end if;
end;
$$;

-- 기존 함수의 권한, 과거 신청서와 구버전 앱의 입력값을 유지합니다.
create or replace function routine_application_private.normalize_answers(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  k text;
  other_text text;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p)) <> 9
    or not p ?& array['gender','experience','purposes','purpose_other','interests','frequency','duration','pain','avoid']
  then raise exception 'INVALID_ANSWERS' using errcode='22023'; end if;
  foreach k in array array['gender','experience','purpose_other','frequency','duration','pain','avoid'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then
      raise exception 'INVALID_ANSWERS' using errcode='22023';
    end if;
  end loop;
  if p->>'gender' not in ('여자','남자')
    or p->>'experience' not in ('1개월 미만','1~3개월','3~6개월','6개월~1년','1년 이상','2년 이상',
      '1개월~6개월 미만','6개월~1년 미만')
    or p->>'frequency' not in ('주 1회','주 2회','주 3회','주 4회','주 5회 이상','주 2~3회','주 4회 이상')
    or p->>'duration' not in ('30분 미만','30분 ~ 1시간','1시간 ~ 1시간 30분','1시간 30분 ~ 2시간','2시간 이상','1시간 30분 이상')
    or jsonb_typeof(p->'purposes') is distinct from 'array'
    or jsonb_typeof(p->'interests') is distinct from 'array'
  then raise exception 'INVALID_ANSWERS' using errcode='22023'; end if;
  if jsonb_array_length(p->'purposes') not between 1 and 2
    or jsonb_array_length(p->'interests') not between 1 and 3
    or exists(select 1 from jsonb_array_elements(p->'purposes') v where jsonb_typeof(v)<>'string')
    or exists(select 1 from jsonb_array_elements(p->'interests') v where jsonb_typeof(v)<>'string')
    or exists(select 1 from jsonb_array_elements_text(p->'purposes') v where v not in
      ('체중 감량','근력 증가','체형 개선','건강 관리','기초체력 강화','기타'))
    or exists(select 1 from jsonb_array_elements_text(p->'interests') v where v not in
      ('허벅지','엉덩이','등','복부','팔','어깨','특정부위 없음'))
    or (select count(distinct v) from jsonb_array_elements_text(p->'purposes') v) <> jsonb_array_length(p->'purposes')
    or (select count(distinct v) from jsonb_array_elements_text(p->'interests') v) <> jsonb_array_length(p->'interests')
  then raise exception 'INVALID_SELECTIONS' using errcode='22023'; end if;
  other_text := btrim(p->>'purpose_other');
  if length(other_text)>100 or other_text ~ '[[:cntrl:]]'
    or (p->'purposes' ? '기타' and length(other_text)=0)
    or length(p->>'pain')>500 or replace(p->>'pain', chr(10), '') ~ '[[:cntrl:]]'
    or length(p->>'avoid')>500 or replace(p->>'avoid', chr(10), '') ~ '[[:cntrl:]]'
  then raise exception 'INVALID_TEXT' using errcode='22023'; end if;
  return p || jsonb_build_object('purpose_other',case when p->'purposes' ? '기타' then other_text else '' end,
    'pain',btrim(p->>'pain'),'avoid',btrim(p->>'avoid'));
end;
$$;

-- 회원 데이터에 쓰지 않고 새 입력값과 이전 선택지를 검증합니다.
do $$
declare
  sample jsonb := jsonb_build_object('gender','여자', 'experience','1개월~6개월 미만',
    'purposes',jsonb_build_array('기초체력 강화'), 'purpose_other','',
    'interests',jsonb_build_array('등'), 'frequency','주 2~3회',
    'duration','1시간 30분 이상', 'pain',E'왼쪽 무릎\n오른쪽 손목', 'avoid','');
begin
  if routine_application_private.normalize_answers(sample) is distinct from sample then
    raise exception '새 신청서 검증 실패';
  end if;
  perform routine_application_private.normalize_answers(sample ||
    '{"experience":"6개월~1년 미만","frequency":"주 4회 이상"}'::jsonb);
  perform routine_application_private.normalize_answers(sample ||
    '{"experience":"2년 이상","purposes":["건강 관리"],"interests":["복부"],"frequency":"주 5회 이상","duration":"2시간 이상"}'::jsonb);
end;
$$;
commit;
select 'v422 루틴 신청서 선택지 설정 완료' as result;
