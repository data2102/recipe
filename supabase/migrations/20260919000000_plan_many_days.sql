-- 한 주에 같은 요리를 여러 날짜에 — 기본키를 푼다
--
-- 쓰는 사람이 겪은 것: 살치살 스테이크를 9/17 에 담아뒀다가 9/21 로
-- 바꾸니 **9/17 자리가 사라졌다.** 옮긴 게 아니라 사라진 것처럼 보였다.
--
-- 원인은 기본키였다. `PRIMARY KEY (list_id, recipe_id)` 라 한 주에 한
-- 요리는 **행이 하나뿐**이고, 날짜는 그 행의 `day_of_week` 컬럼 하나다.
-- 날짜를 바꾸면 그 컬럼을 UPDATE 하니 앞 날짜는 남을 자리가 없었다.
--
-- 이제 행을 여럿 둔다. 날짜마다 한 행이다.
--
--   9/16 · 9/21 에 같은 요리   -> 행 둘 (허용)
--   9/16 에 같은 요리 두 번    -> 막는다 (아래 부분 인덱스)
--   "날짜 미정" 은 한 주에 하나 (여럿이면 담긴 개수만 부풀어난다)
--
-- **이번 주/다음 주는 원래 됐다** — 목록(list_id)이 다르니 다른 행이다.
-- 여기서 푸는 건 같은 주 안의 중복뿐이다.

-- 대리키를 쓴다. (list_id, recipe_id, day_of_week) 를 기본키로 하면
-- day_of_week 가 NULL 일 수 없는데, NULL 이 "날짜 미정" 이라 못 버린다.
ALTER TABLE shopping_list_recipe DROP CONSTRAINT shopping_list_recipe_pkey;
ALTER TABLE shopping_list_recipe ADD COLUMN id BIGSERIAL PRIMARY KEY;

-- 같은 날 같은 요리를 두 번 담지는 않는다. 누르면 빠지는 자리라
-- (담긴 날을 다시 누르면 토글) 두 번 눌러 두 줄이 되면 안 된다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slr_day
    ON shopping_list_recipe (list_id, recipe_id, day_of_week)
 WHERE day_of_week IS NOT NULL;

-- "날짜 미정" 은 한 주에 한 줄. PostgreSQL 은 UNIQUE 에서 NULL 을 서로
-- 다른 값으로 보기 때문에, 위 인덱스만으로는 미정이 여러 줄 생긴다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slr_someday
    ON shopping_list_recipe (list_id, recipe_id)
 WHERE day_of_week IS NULL;
