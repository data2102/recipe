-- =====================================================================
--  개발용 예시 데이터  (작업 순서 3번의 완료 판단 — "데이터를 손으로 넣어 돌아감")
--
--  **마이그레이션이 아니다.** supabase/migrations/ 에 들어가지 않는다.
--  실제 DB 에 올리지 마라 — 손으로 돌려볼 때만 쓴다.
--
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed_dev.sql
--
--  날짜는 오늘 기준 상대값이다. 언제 돌려도 탭 2 의 정렬(오래된 순)과
--  60일 넘은 것의 warm 색이 보이게 잡아뒀다.
--
--  재료의 raw_name 은 **일부러 표기가 제각각이다** (고추가루·간마늘·간장).
--  화면에 나가는 건 이 원문이고, 표준화는 ingredient_id 쪽에서만 한다
--  (원칙 ①). 사전에 없는 표기(묵은지·고등어)도 섞어뒀다.
-- =====================================================================

BEGIN;

-- 여러 번 돌려도 같은 상태가 되게. 예시 데이터만 지운다.
--
-- 장보기에 담긴 걸 먼저 뺀다. shopping_list_recipe.recipe_id 에는
-- ON DELETE CASCADE 가 없다 — 장보기 목록에 올라간 레시피가 말없이
-- 사라지면 안 되기 때문이다(제품에는 레시피 삭제가 없다. '별로였어요'
-- 는 status 를 BAD 로 바꿀 뿐이다). 그 규칙은 그대로 두고 여기서만 푼다.
DELETE FROM shopping_list_recipe
 WHERE recipe_id IN (
    SELECT id FROM recipe WHERE title IN (
        '묵은지 고등어조림', '제육볶음', '된장찌개', '두부조림',
        '닭볶음탕', '김치볶음밥'
    )
);

DELETE FROM recipe WHERE title IN (
    '묵은지 고등어조림', '제육볶음', '된장찌개', '두부조림',
    '닭볶음탕', '김치볶음밥'
);

WITH r AS (
    INSERT INTO recipe (title, status, source_url, source_kind,
                        servings_note, cook_count, last_cooked_on, created_at)
    VALUES
      ('묵은지 고등어조림', 'GOOD', 'https://example.com/mackerel', 'BLOG',
       '2인분', 2, CURRENT_DATE - 74, now() - interval '120 days'),
      ('제육볶음',         'GOOD', 'https://example.com/jeyuk',    'BLOG',
       '저는 600g으로', 5, CURRENT_DATE - 61, now() - interval '150 days'),
      ('된장찌개',         'GOOD', NULL, 'MANUAL',
       NULL, 9, CURRENT_DATE - 12, now() - interval '200 days'),
      ('김치볶음밥',       'GOOD', 'https://example.com/kimchi-rice', 'YOUTUBE',
       NULL, 3, CURRENT_DATE - 3,  now() - interval '60 days'),
      ('두부조림',         'WISH', 'https://example.com/dubu',     'INSTAGRAM',
       NULL, 0, NULL, now() - interval '2 days'),
      ('닭볶음탕',         'WISH', NULL, 'MANUAL',
       NULL, 0, NULL, now() - interval '9 days')
    RETURNING id, title
)
INSERT INTO recipe_ingredient
    (recipe_id, raw_name, raw_qty, section, ingredient_id, origin, evidence, confirmed)
SELECT r.id, v.raw_name, v.raw_qty, v.section,
       i.id,          -- 사전에 없으면 NULL 로 남는다. 추측하지 않는다 (원칙 ④)
       v.origin, v.evidence, v.confirmed
  FROM r
  JOIN (VALUES
    -- 묵은지고등어조림 — '무' 는 재료 목록엔 없고 조리 단계에만 나왔다.
    -- 확인 전(confirmed=false)이라 화면 요약에도, 장보기에도 안 나간다.
    ('묵은지 고등어조림', '묵은지',   '1/4포기', '재료', 'LIST', NULL, TRUE),
    ('묵은지 고등어조림', '고등어',   '2마리',   '재료', 'LIST', NULL, TRUE),
    ('묵은지 고등어조림', '고추가루', '2T',      '양념', 'LIST', NULL, TRUE),
    ('묵은지 고등어조림', '간마늘',   '1T',      '양념', 'LIST', NULL, TRUE),
    ('묵은지 고등어조림', '무',       '1/3개',   NULL,   'BODY',
       '4번 단계 - 냄비에 무 먼저 깔아주고', FALSE),

    ('제육볶음', '돼지고기',  '600g', '재료', 'LIST', NULL, TRUE),
    ('제육볶음', '양파',      '1개',  '재료', 'LIST', NULL, TRUE),
    ('제육볶음', '고추장',    '2T',   '양념', 'LIST', NULL, TRUE),
    ('제육볶음', '올리브유',  NULL,   NULL,   'BODY',
       '2번 단계 - 팬에 올리브유 두르고', FALSE),

    ('된장찌개', '된장',   '2T',   '양념', 'LIST', NULL, TRUE),
    ('된장찌개', '두부',   '1모',  '재료', 'LIST', NULL, TRUE),
    ('된장찌개', '애호박', '1/2개','재료', 'LIST', NULL, TRUE),
    ('된장찌개', '대파',   '1대',  '재료', 'LIST', NULL, TRUE),

    ('김치볶음밥', '김치', '1컵', '재료', 'LIST', NULL, TRUE),
    ('김치볶음밥', '밥',   '2공기','재료', 'LIST', NULL, TRUE),
    ('김치볶음밥', '참기름','1t',  '양념', 'LIST', NULL, TRUE),

    ('두부조림', '두부',   '1모', '재료', 'LIST', NULL, TRUE),
    ('두부조림', '간장',   '3T',  '양념', 'LIST', NULL, TRUE),
    ('두부조림', '고춧가루','1T', '양념', 'LIST', NULL, TRUE)
  ) AS v(title, raw_name, raw_qty, section, origin, evidence, confirmed)
    ON v.title = r.title
  LEFT JOIN ingredient i ON i.canonical_name = v.raw_name;

-- 사전 별칭으로 걸리는 표기도 붙여준다 (고추가루 -> 고춧가루 등).
UPDATE recipe_ingredient ri
   SET ingredient_id = a.ingredient_id
  FROM ingredient_alias a
 WHERE ri.ingredient_id IS NULL
   AND a.alias = ri.raw_name;

-- 요리 이력. recipe.last_cooked_on 은 이 로그의 캐시다.
INSERT INTO cook_log (recipe_id, cooked_on)
SELECT r.id, r.last_cooked_on
  FROM recipe r
 WHERE r.last_cooked_on IS NOT NULL;

COMMIT;

-- 확인:
--   SELECT title, status, last_cooked_on, cook_count FROM recipe
--    ORDER BY last_cooked_on ASC NULLS FIRST;
--   -- 사전에 없어서 못 붙인 표기 (작업 순서 5번이 볼 것)
--   SELECT raw_name FROM recipe_ingredient WHERE ingredient_id IS NULL;
