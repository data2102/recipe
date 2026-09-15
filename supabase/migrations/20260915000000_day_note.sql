-- 그날의 메모 — "저녁 약속 있어요"
--
-- 날짜 하나에 한 줄. 요일(shopping_list_recipe.day_of_week)이 아니라 날짜다 —
-- 약속은 주에 속한 게 아니라 그 하루에 있는 일이고, 주가 넘어가도 남아야 한다.
-- 설계 이유는 db/schema.sql 7번 절에 있다.
CREATE TABLE IF NOT EXISTS day_note (
    on_date     DATE PRIMARY KEY,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v1 에는 로그인이 없다. 새 테이블도 REST 문을 닫아둔다
-- (20260831000002_lock_down.sql 과 같은 이유 — db/policy.sql 머리말).
ALTER TABLE day_note ENABLE ROW LEVEL SECURITY;
