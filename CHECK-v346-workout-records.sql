-- v346 운동 기록 통합 전 확인용. 데이터와 설정을 변경하지 않습니다.
WITH checks AS (
  SELECT oid, conname
  FROM pg_constraint
  WHERE conrelid = 'public.workout_records'::regclass
    AND contype = 'c'
)
SELECT 'CHECK' AS item_type, conname AS name,
       pg_get_constraintdef(oid, true) AS definition
FROM checks
UNION ALL
SELECT DISTINCT 'CHECK_FUNCTION', p.oid::regprocedure::text,
       pg_get_functiondef(p.oid)
FROM checks c
JOIN pg_depend d ON d.classid = 'pg_constraint'::regclass
               AND d.objid = c.oid
               AND d.refclassid = 'pg_proc'::regclass
JOIN pg_proc p ON p.oid = d.refobjid
UNION ALL
SELECT 'WRITE_TRIGGER', t.tgname, pg_get_functiondef(t.tgfoid)
FROM pg_trigger t
WHERE t.tgrelid = 'public.workout_records'::regclass
  AND NOT t.tgisinternal
  AND (t.tgtype::int & 20) <> 0
ORDER BY item_type, name;
