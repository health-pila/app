-- v346: 사진과 세트표를 한 운동 기록에 함께 저장하도록 허용합니다.
-- 기존 세트표 검증 함수, 120자 제한, RLS, 회원 삭제 보호는 변경하지 않습니다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, pg_catalog;

DO $migration$
DECLARE
  old_definition text;
  new_definition text;
BEGIN
  IF to_regclass('public.workout_records') IS NULL
     OR to_regprocedure('public.valid_workout_set_records_v244(jsonb)') IS NULL THEN
    RAISE EXCEPTION '기존 운동 기록 테이블과 세트표 검증 함수를 확인해 주세요.';
  END IF;

  LOCK TABLE public.workout_records IN ACCESS EXCLUSIVE MODE;

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\s+', '', 'g')
  INTO old_definition
  FROM pg_constraint
  WHERE conrelid = 'public.workout_records'::regclass
    AND conname = 'workout_set_records_v244_check' AND contype = 'c';

  SELECT regexp_replace(pg_get_constraintdef(oid, true), '\s+', '', 'g')
  INTO new_definition
  FROM pg_constraint
  WHERE conrelid = 'public.workout_records'::regclass
    AND conname = 'workout_set_records_v346_check' AND contype = 'c';

  IF old_definition IS NOT NULL AND old_definition <>
     'CHECK(valid_workout_set_records_v244(set_records)AND(set_recordsISNULLORphoto_pathISNULL))' THEN
    RAISE EXCEPTION '기존 v244 제약이 확인된 정의와 다릅니다. 변경하지 않고 중단합니다.';
  END IF;
  IF new_definition IS NOT NULL AND new_definition <>
     'CHECK(valid_workout_set_records_v244(set_records))' THEN
    RAISE EXCEPTION '동명의 v346 제약이 다른 정의로 존재합니다. 변경하지 않고 중단합니다.';
  END IF;
  IF old_definition IS NULL AND new_definition IS NULL THEN
    RAISE EXCEPTION '기존 v244 제약이 없습니다. 변경하지 않고 중단합니다.';
  END IF;

  IF new_definition IS NULL THEN
    ALTER TABLE public.workout_records
      ADD CONSTRAINT workout_set_records_v346_check
      CHECK (public.valid_workout_set_records_v244(set_records));
  ELSE
    ALTER TABLE public.workout_records
      VALIDATE CONSTRAINT workout_set_records_v346_check;
  END IF;

  IF old_definition IS NOT NULL THEN
    ALTER TABLE public.workout_records
      DROP CONSTRAINT workout_set_records_v244_check;
  END IF;
END
$migration$;

COMMIT;

SELECT 'v346_photo_and_sets_enabled' AS check_name,
       EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.workout_records'::regclass
           AND conname = 'workout_set_records_v346_check'
           AND convalidated
       ) AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.workout_records'::regclass
           AND conname = 'workout_set_records_v244_check'
       ) AS ok;
