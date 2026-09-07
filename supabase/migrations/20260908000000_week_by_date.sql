-- ==================================================================
--  주를 날짜로 — shopping_list.starts_on
--
--  **손으로 쓴 델타다.** 자동 생성물이 아니다 (tools/build_migrations.py
--  머리말). db/schema.sql 도 같이 고쳤다.
--
--  왜 필요한가
--  ----------
--  어느 주인지를 status(OPEN/NEXT)로 가리고 있었다. 그러면 "장보기 끝"
--  을 안 누른 채 한 주가 지나가면 지난 주가 계속 이번 주로 남는다 —
--  실제로 9월 8일에 8월 31일~9월 6일이 "이번 주" 로 보였고, 그 주의
--  식단이 다음 주 자리에 있었다.
--
--  이제 **날짜가 주를 정한다.** starts_on 은 그 주의 월요일(한국 기준)
--  이고, 오늘이 속한 월요일이 곧 이번 주다. status 는 "장을 다 봤나"
--  만 말한다 — 주를 옮기지 않는다.
--
--  요일(day_of_week 0~6)은 starts_on 에 그대로 더하면 날짜가 된다.
--  예전에는 목록을 연 날부터 다가오는 요일을 셌다.
--
--  기존 데이터를 어디로 옮기나
--  --------------------------
--  OPEN  이 주의 월요일 = 만든 날이 속한 주의 월요일
--  NEXT  그 다음 주 월요일 (OPEN 이 있으면 OPEN + 7일)
--  DONE  만든 날이 속한 주의 월요일
--
--  NEXT 를 만든 날로 재면 안 된다. 수요일에 다음 주를 짜기 시작했으면
--  만든 날이 속한 월요일은 이번 주와 같아서 둘이 겹친다.
--
--  겹치는 게 남으면 (예전에 같은 주에 목록이 둘 생긴 경우) 나중 것을
--  한 주씩 뒤로 민다. 지우지 않는다 — 담아둔 요리가 들어 있다.
--
--  방언: PostgreSQL (Supabase). 로컬 검증은 tools/verify_migration.py
-- ==================================================================


-- 1) 컬럼. 채우기 전이라 일단 NULL 을 허용한다.
ALTER TABLE shopping_list
    ADD COLUMN IF NOT EXISTS starts_on DATE;


-- 2) 기존 행 채우기.
DO $$
DECLARE
    open_monday DATE;
    dup RECORD;
BEGIN
    -- 이미 채워져 있으면 (두 번 올린 경우) 아무 일도 안 한다.
    IF EXISTS (SELECT 1 FROM shopping_list WHERE starts_on IS NOT NULL) THEN
        RAISE NOTICE 'starts_on 이미 채워져 있음 — 건너뜀';
    ELSE
        -- OPEN 과 DONE: 만든 날이 속한 주의 월요일
        UPDATE shopping_list
           SET starts_on =
               (created_at AT TIME ZONE 'Asia/Seoul')::date
               - (EXTRACT(ISODOW FROM (created_at AT TIME ZONE 'Asia/Seoul'))::int - 1)
         WHERE status <> 'NEXT';

        -- NEXT: 이번 주 다음 월요일. OPEN 이 없으면 자기 주 + 7일
        SELECT starts_on INTO open_monday
          FROM shopping_list
         WHERE status = 'OPEN'
         ORDER BY id DESC
         LIMIT 1;

        UPDATE shopping_list
           SET starts_on = COALESCE(
                 open_monday,
                 (created_at AT TIME ZONE 'Asia/Seoul')::date
                 - (EXTRACT(ISODOW FROM (created_at AT TIME ZONE 'Asia/Seoul'))::int - 1)
               ) + 7
         WHERE status = 'NEXT';
    END IF;

    -- 그래도 같은 주에 둘 이상 있으면 나중 것을 한 주씩 뒤로 민다.
    LOOP
        SELECT id, starts_on INTO dup
          FROM (
            SELECT id, starts_on,
                   row_number() OVER (PARTITION BY starts_on ORDER BY id) AS n
              FROM shopping_list
             WHERE starts_on IS NOT NULL
          ) t
         WHERE n > 1
         ORDER BY id
         LIMIT 1;
        EXIT WHEN NOT FOUND;
        UPDATE shopping_list SET starts_on = dup.starts_on + 7 WHERE id = dup.id;
    END LOOP;
END $$;


-- 3) 남은 NULL 은 없어야 한다. 비어 있는 표에서도 안전하다.
UPDATE shopping_list
   SET starts_on = (now() AT TIME ZONE 'Asia/Seoul')::date
       - (EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Seoul'))::int - 1)
 WHERE starts_on IS NULL;

ALTER TABLE shopping_list ALTER COLUMN starts_on SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_list_week
    ON shopping_list(starts_on);


-- 4) NEXT 는 없어진다. 날짜가 다음 주라고 말해준다.
UPDATE shopping_list SET status = 'OPEN' WHERE status = 'NEXT';
