-- ==================================================================
--  재료 정규화 사전 시드
--
--  자동 생성 파일 — 직접 고치지 말 것.
--  원본: db/seed_dictionary.sql
--  생성: python tools/build_migrations.py
--
--  data/ingredient-dictionary.csv 가 원본이다. 사전을 키우려면 CSV 를
--  고치고 build_dictionary_seed.py 를 돌린 뒤 이 스크립트를 다시 돌린다.
--  여러 번 돌려도 안전하다 (ON CONFLICT DO NOTHING).
--
--  방언: PostgreSQL (Supabase). 로컬 검증은 tools/verify_migration.py
-- ==================================================================

-- ==================================================================
--  재료 정규화 사전 시드  (개발 순서 1번)
--
--  자동 생성 파일 — 직접 고치지 말 것.
--  원본: data/ingredient-dictionary.csv
--  생성: python tools/build_dictionary_seed.py
--
--  방언: PostgreSQL
--  전제: db/schema.sql 을 먼저 실행해 테이블이 있어야 한다.
--  성질: 여러 번 돌려도 안전하다 (중복은 무시).
--
--  CSV 표기 47개 -> 표준 40종 + 별칭 11개
--
--  shelf_life_days · aisle 은 CSV 에 없다. 카테고리 단위 대략치이고
--  일부러 짧게 잡았다 — 있는데 없다고 하는 쪽이 회복 가능한 오류다
--  (docs/v1-spec.md 2장 원칙 ②). 실사용하며 UPDATE 로 조정한다.
-- ==================================================================

-- ------------------------------------------------------------------
--  1. 재료 마스터
-- ------------------------------------------------------------------

INSERT INTO ingredient
    (canonical_name, category, purchasable, shelf_life_days, aisle)
VALUES
    ('감자',        '채소',      TRUE,        5, '청과'),
    ('고추장',      '양념',      TRUE,      120, '양념'),
    ('고춧가루',    '양념',      TRUE,      120, '양념'),
    ('국간장',      '양념',      TRUE,      120, '양념'),
    ('굴소스',      '양념',      TRUE,      120, '양념'),
    ('김치',        '저장식품',  TRUE,       60, '가공식품'),
    ('깨',          '양념',      TRUE,      120, '양념'),
    ('다진마늘',    '양념',      TRUE,      120, '양념'),
    ('닭',          '육류',      TRUE,        3, '정육'),
    ('대파',        '채소',      TRUE,        5, '청과'),
    ('돼지고기',    '육류',      TRUE,        3, '정육'),
    ('된장',        '양념',      TRUE,      120, '양념'),
    ('두부',        '가공식품',  TRUE,       14, '가공식품'),
    ('런천미트',    '가공식품',  TRUE,       14, '가공식품'),
    ('맛술',        '양념',      TRUE,      120, '양념'),
    ('멸치액젓',    '양념',      TRUE,      120, '양념'),
    ('무',          '채소',      TRUE,        5, '청과'),
    ('물',          '기타',      FALSE,    NULL, NULL),
    ('부채살',      '육류',      TRUE,        3, '정육'),
    ('부추',        '채소',      TRUE,        5, '청과'),
    ('삼겹살',      '육류',      TRUE,        3, '정육'),
    ('설탕',        '양념',      TRUE,      120, '양념'),
    ('소고기',      '육류',      TRUE,        3, '정육'),
    ('소금',        '양념',      TRUE,      120, '양념'),
    ('식초',        '양념',      TRUE,      120, '양념'),
    ('쌀뜨물',      '기타',      FALSE,    NULL, NULL),
    ('알룰로스',    '양념',      TRUE,      120, '양념'),
    ('애호박',      '채소',      TRUE,        5, '청과'),
    ('양파',        '채소',      TRUE,        5, '청과'),
    ('연겨자',      '양념',      TRUE,      120, '양념'),
    ('올리고당',    '양념',      TRUE,      120, '양념'),
    ('우삼겹',      '육류',      TRUE,        3, '정육'),
    ('진간장',      '양념',      TRUE,      120, '양념'),
    ('참기름',      '양념',      TRUE,      120, '양념'),
    ('참치액',      '양념',      TRUE,      120, '양념'),
    ('청양고추',    '채소',      TRUE,        5, '청과'),
    ('콩나물',      '채소',      TRUE,        5, '청과'),
    ('팽이버섯',    '채소',      TRUE,        5, '청과'),
    ('항정살',      '육류',      TRUE,        3, '정육'),
    ('후추',        '양념',      TRUE,      120, '양념')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------
--  2. 상위어 (parent_id)
--
--  매칭을 넓게 할 때만 쓴다. 장보기 합산에는 쓰지 않는다.
--  '삼겹살 500g' 과 '돼지고기 300g' 은 따로 산다.
-- ------------------------------------------------------------------

UPDATE ingredient SET parent_id = (SELECT id FROM ingredient WHERE canonical_name = '소고기')
 WHERE canonical_name = '부채살';
UPDATE ingredient SET parent_id = (SELECT id FROM ingredient WHERE canonical_name = '돼지고기')
 WHERE canonical_name = '삼겹살';
UPDATE ingredient SET parent_id = (SELECT id FROM ingredient WHERE canonical_name = '소고기')
 WHERE canonical_name = '우삼겹';
UPDATE ingredient SET parent_id = (SELECT id FROM ingredient WHERE canonical_name = '돼지고기')
 WHERE canonical_name = '항정살';

-- ------------------------------------------------------------------
--  3. 별칭
--
--  AMBIGUOUS 는 "사전에 후보는 있지만 단정하면 안 되는 표기"다.
--  '간장'을 말없이 진간장으로 확정하면 국간장 있는 집이 진간장을 사러 간다
--  (docs/v1-spec.md 2장 원칙 ④, 7장 "대체 불가 주의").
--
--  매핑 코드(개발 순서 3번)는 이 kind 를 보고 확정이 아니라
--  확인 필요로 보내야 한다. 그래서 버리지 않고 kind 로 남긴다.
-- ------------------------------------------------------------------

WITH v(alias, canonical, kind) AS (VALUES
    ('간장',      '진간장',      'AMBIGUOUS'),  -- 어떤 간장인지 불명 - 확인 필요
    ('액젓',      '멸치액젓',    'AMBIGUOUS'),  -- 종류 미지정
    ('리챔',      '런천미트',    'BRAND'),      -- DB속성은 스팸, 본문은 리챔 - 불일치
    ('스팸',      '런천미트',    'BRAND'),
    ('다진 마늘', '다진마늘',    'SPACING'),    -- 공백 차이
    ('깨소금',    '깨',          'SYNONYM'),
    ('닭다리',    '닭',          'SYNONYM'),    -- DB속성은 닭, 본문은 닭다리 - 불일치
    ('맛소금',    '소금',        'SYNONYM'),
    ('토장',      '된장',        'SYNONYM'),    -- 본문에 토장(된장)으로 병기
    ('고추가루',  '고춧가루',    'TYPO'),       -- 맞춤법 오류
    ('고추가룻',  '고춧가루',    'TYPO')        -- 오타
)
INSERT INTO ingredient_alias (ingredient_id, alias, kind)
SELECT i.id, v.alias, v.kind
  FROM v
  JOIN ingredient i ON i.canonical_name = v.canonical
ON CONFLICT DO NOTHING;

-- ==================================================================
--  투입 확인 — 개발 순서 1번의 완료 판단
-- ==================================================================
--
--   SELECT COUNT(*) FROM ingredient;        -- 40
--   SELECT COUNT(*) FROM ingredient_alias;  -- 11
--
--   -- 별칭이 표준명으로 제대로 걸리는지
--   SELECT a.alias, i.canonical_name, a.kind
--     FROM ingredient_alias a
--     JOIN ingredient i ON i.id = a.ingredient_id
--    ORDER BY a.kind, a.alias;
--
--   -- 확정하면 안 되는 표기
--   SELECT alias FROM ingredient_alias WHERE kind = 'AMBIGUOUS';
