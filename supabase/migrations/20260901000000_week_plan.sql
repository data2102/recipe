-- ==================================================================
--  이번 주 요일 배정 — shopping_list_recipe.day_of_week
--
--  **손으로 쓴 델타다.** 자동 생성물이 아니다.
--  20260831000000_init_schema.sql 은 이미 운영 DB 에 올라가서 고칠 수
--  없다 (tools/build_migrations.py 머리말). 스키마를 바꾸려면 이렇게
--  델타를 새로 쓰고 db/schema.sql 도 같이 고친다.
--
--  둘이 갈라지지 않았는지는 tools/verify_migration.py 가 잰다 — 글자를
--  비교하는 게 아니라, 마이그레이션을 다 올린 DB 와 schema.sql 만 올린
--  DB 의 컬럼을 하나씩 맞춰본다.
--
--  왜 요일인가
--  ----------
--  담은 요리를 요일에 배정해 한 주 식단을 짠다. 담기와 요일 정하기는
--  다른 행동이라 NULL 을 허용한다 — "이번 주에 이거 먹자"까지만 정하고
--  요일은 안 정할 수도 있어야 한다. 요일을 강제하면 담는 것 자체가
--  무거워진다.
--
--  날짜가 아니라 요일인 이유: 목록이 곧 "이번 주"다 (shopping_list 는
--  한 번에 하나만 OPEN). 어느 주인지는 목록이 이미 안다.
--
--  방언: PostgreSQL (Supabase). 로컬 검증은 tools/verify_migration.py
-- ==================================================================


ALTER TABLE shopping_list_recipe
    ADD COLUMN IF NOT EXISTS day_of_week SMALLINT;

-- 0=월 … 6=일. 여러 번 올려도 안전하게 이미 있으면 넘어간다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'shopping_list_recipe'::regclass
           AND conname  = 'shopping_list_recipe_day_of_week_check'
    ) THEN
        ALTER TABLE shopping_list_recipe
            ADD CONSTRAINT shopping_list_recipe_day_of_week_check
            CHECK (day_of_week BETWEEN 0 AND 6);
    END IF;
END $$;
