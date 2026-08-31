-- ==================================================================
--  v1 데이터 모델 — 테이블 12개
--
--  자동 생성 파일 — 직접 고치지 말 것.
--  원본: db/schema.sql
--  생성: python tools/build_migrations.py
--
--  레시피·재료사전·구매이력·장보기. 설계 이유는 db/schema.sql 머리말과
--  docs/claude-code-brief.md 6장에 있다.
--
--  방언: PostgreSQL (Supabase). 로컬 검증은 tools/verify_migration.py
-- ==================================================================

-- =====================================================================
--  레시피 · 장보기 앱  v1  데이터 모델
--
--  설계 원칙 (다 이유가 있으니 바꾸기 전에 한 번 더 생각할 것)
--   1. 원문은 절대 덮어쓰지 않는다. 표준화는 별도 컬럼에.
--   2. 재고 테이블은 없다. 대신 "구매 이벤트 로그"로 추정한다.
--   3. 모르는 재료는 추측하지 않는다. ingredient_id = NULL 로 남긴다.
--   4. 원본(이미지/텍스트)은 영구 보관한다. 파서가 좋아지면 재파싱한다.
--
--  방언: PostgreSQL 기준. SQLite면 아래만 치환
--    BIGSERIAL       -> INTEGER PRIMARY KEY AUTOINCREMENT
--    TIMESTAMPTZ     -> TEXT (ISO8601)
--    BOOLEAN         -> INTEGER
--    gen_random_uuid -> 앱에서 생성
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. 재료 마스터  — 모든 것이 여기를 참조한다
-- ---------------------------------------------------------------------

CREATE TABLE ingredient (
    id              BIGSERIAL PRIMARY KEY,
    canonical_name  TEXT NOT NULL UNIQUE,     -- '고춧가루', '국간장'
    category        TEXT NOT NULL,            -- 육류/채소/양념/가공식품/수산물/기타
    parent_id       BIGINT REFERENCES ingredient(id),
                                              -- 삼겹살 -> 돼지고기 (상위어)
                                              -- 매칭을 넓게 할 때만 쓴다.
                                              -- 장보기 합산에는 쓰지 않는다.
    purchasable     BOOLEAN NOT NULL DEFAULT TRUE,
                                              -- 물, 쌀뜨물 = FALSE. 장보기에서 제외
    shelf_life_days INT,                      -- 대략치. '확인 필요' 판정에 사용
    aisle           TEXT,                     -- 마트 동선 정렬용 (정육/청과/양념)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 재료의 다른 표기. 파싱 결과를 표준 ID로 옮길 때 여기를 본다.
CREATE TABLE ingredient_alias (
    id              BIGSERIAL PRIMARY KEY,
    ingredient_id   BIGINT NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
    alias           TEXT NOT NULL,
    kind            TEXT NOT NULL,            -- TYPO/SPACING/SYNONYM/BRAND/DIALECT
    UNIQUE (alias)                            -- 한 표기가 두 재료에 매핑되면 안 된다
);
-- 실측 예시:
--   고추가루, 고추가룻 -> 고춧가루 (TYPO)
--   간마늘, 다진 마늘  -> 다진마늘 (SYNONYM/SPACING)
--   조선간장           -> 국간장   (SYNONYM)
--   미림               -> 맛술     (SYNONYM)
--   리챔               -> 런천미트 (BRAND)

-- 사전에 없어서 매핑 못 한 표기가 쌓이는 곳.
-- 절대 자동으로 추측해 채우지 않는다. 사람이 주기적으로 정리한다.
CREATE TABLE unmapped_term (
    id                  BIGSERIAL PRIMARY KEY,
    raw_name            TEXT NOT NULL UNIQUE,
    hit_count           INT  NOT NULL DEFAULT 1,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_ingredient_id BIGINT REFERENCES ingredient(id)
                                              -- 채워지면 처리 완료. 배치로 재매핑
);


-- ---------------------------------------------------------------------
--  2. 레시피
-- ---------------------------------------------------------------------

CREATE TABLE recipe (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'WISH',
                                              -- WISH  해보고 싶다 (아직 안 만듦)
                                              -- GOOD  만들어봤고 괜찮았다
                                              -- BAD   만들어봤는데 별로
                                              -- 추천 풀은 GOOD 만 쓴다.
                                              -- 장보기 후보에는 WISH 도 올라온다.
    hero_photo_id   BIGINT,                   -- cook_log.photo 로 교체되면 갱신
    source_url      TEXT,                     -- 원본 링크. 항상 보관 (저작권)
    source_kind     TEXT,                     -- INSTAGRAM/YOUTUBE/BLOG/NOTION/MANUAL
    servings_note   TEXT,                     -- '2인분', '저는 600g으로' 등 원문
    cook_count      INT  NOT NULL DEFAULT 0,  -- cook_log 캐시
    last_cooked_on  DATE,                     -- cook_log 캐시. 추천 정렬의 핵심
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_step (
    recipe_id       BIGINT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    seq             INT    NOT NULL,
    body            TEXT   NOT NULL,
    PRIMARY KEY (recipe_id, seq)
);

CREATE TABLE recipe_ingredient (
    id              BIGSERIAL PRIMARY KEY,
    recipe_id       BIGINT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,

    -- 원문 층 : 사용자에게 보여주는 것. 절대 건드리지 않는다.
    raw_name        TEXT NOT NULL,            -- '간마늘'
    raw_qty         TEXT,                     -- '1T', '반스푼', '갈갈', NULL
    section         TEXT,                     -- 재료 / 양념

    -- 표준 층 : 장보기 합산과 재료 매칭에만 쓴다. 화면에 안 보인다.
    ingredient_id   BIGINT REFERENCES ingredient(id),
                                              -- NULL = 미분류. 추측 금지.
                                              -- 미분류는 장보기에 개별 항목으로 나간다.

    -- 출처 : 3번 화면(저장 확인)이 여기서 나온다
    origin          TEXT NOT NULL DEFAULT 'LIST',
                                              -- LIST 재료 목록에 있었음
                                              -- BODY 조리 단계에만 나옴  <-- 확인 필요
                                              -- USER 사용자가 직접 추가
    evidence        TEXT,                     -- '4번 단계 - 냄비에 무 먼저 깔아주고'
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
                                              -- origin=BODY 는 사용자가 확인해야 TRUE

    -- 택1 : '대패삼겹살 OR 앞다리살', '알룰로스(or 설탕)'
    choice_group    TEXT                      -- 같은 값끼리 한 묶음. 장보기에선 하나만.
);

CREATE INDEX idx_ri_recipe     ON recipe_ingredient(recipe_id);
CREATE INDEX idx_ri_ingredient ON recipe_ingredient(ingredient_id);


-- ---------------------------------------------------------------------
--  3. 원본 보관  — 파서가 좋아지면 전부 다시 돌린다
-- ---------------------------------------------------------------------

CREATE TABLE source_asset (
    id              BIGSERIAL PRIMARY KEY,
    recipe_id       BIGINT REFERENCES recipe(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,            -- IMAGE / TEXT / URL
    storage_key     TEXT,                     -- 이미지 저장 경로
    raw_text        TEXT,                     -- 붙여넣기 원문 / OCR 원문
    parser_version  TEXT,                     -- 'p2-2026-08' 형태
    parsed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 프롬프트를 고친 뒤 재파싱 대상 찾기:
--   SELECT * FROM source_asset WHERE parser_version <> '현재버전';


-- ---------------------------------------------------------------------
--  4. 요리 이력  — 추천 엔진의 유일한 연료
-- ---------------------------------------------------------------------

CREATE TABLE cook_log (
    id              BIGSERIAL PRIMARY KEY,
    recipe_id       BIGINT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    cooked_on       DATE NOT NULL DEFAULT CURRENT_DATE,
    photo_key       TEXT,                     -- 완성 사진. 채워지면 hero 로 승격
    verdict         TEXT,                     -- AGAIN / NEVER  (별점 아님. 이분법)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cook_recipe ON cook_log(recipe_id, cooked_on DESC);


-- ---------------------------------------------------------------------
--  5. 구매 이벤트  — 재고 테이블의 대체재
--
--  냉장고 상태를 추적하지 않는다. "언제 샀는지"만 남긴다.
--  '있음/없음'을 단정하지 않고 '6일 전에 샀어요'라는 근거만 보여준다.
--  틀릴 수가 없는 데이터라 신뢰가 깨지지 않는다.
-- ---------------------------------------------------------------------

CREATE TABLE purchase (
    id              BIGSERIAL PRIMARY KEY,
    ingredient_id   BIGINT NOT NULL REFERENCES ingredient(id),
    purchased_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    source          TEXT NOT NULL DEFAULT 'CHECKOFF',
                                              -- CHECKOFF 장보기에서 체크함
                                              -- RECEIPT  영수증 스캔 (v2)
                                              -- MANUAL   직접 입력
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_ing ON purchase(ingredient_id, purchased_on DESC);


-- ---------------------------------------------------------------------
--  6. 장보기
-- ---------------------------------------------------------------------

CREATE TABLE shopping_list (
    id              BIGSERIAL PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN / DONE
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE shopping_list_recipe (
    list_id         BIGINT NOT NULL REFERENCES shopping_list(id) ON DELETE CASCADE,
    recipe_id       BIGINT NOT NULL REFERENCES recipe(id),
    PRIMARY KEY (list_id, recipe_id)
);

CREATE TABLE shopping_item (
    id              BIGSERIAL PRIMARY KEY,
    list_id         BIGINT NOT NULL REFERENCES shopping_list(id) ON DELETE CASCADE,
    ingredient_id   BIGINT REFERENCES ingredient(id),   -- NULL = 미분류 항목
    label           TEXT NOT NULL,            -- 화면에 찍히는 이름 (원문 우선)
    bucket          TEXT NOT NULL,            -- BUY / CHECK / HAVE
    reason          TEXT,                     -- '6일 전에 샀어요'
    checked         BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (list_id, ingredient_id)           -- 같은 재료는 한 줄로 합친다
);


-- =====================================================================
--  핵심 쿼리 3개  — 이게 되면 v1은 돌아간다
-- =====================================================================

-- (1) 홈 : 오랜만에 어때요  — 입력 0으로 나오는 추천
--     GOOD 만 쓴다. WISH/BAD 는 여기 안 나온다.
--
-- SELECT r.id, r.title,
--        CURRENT_DATE - r.last_cooked_on AS days_ago
--   FROM recipe r
--  WHERE r.status = 'GOOD'
--    AND r.last_cooked_on IS NOT NULL
--  ORDER BY days_ago DESC
--  LIMIT 5;


-- (2) 재료 넣었을 때 : 필터가 아니라 가중치
--     일치 0건이어도 결과가 비지 않는다 (LEFT JOIN + ORDER BY)
--
-- SELECT r.id, r.title,
--        COUNT(ri.id) FILTER (WHERE ri.ingredient_id = ANY($1)) AS hit
--   FROM recipe r
--   LEFT JOIN recipe_ingredient ri ON ri.recipe_id = r.id
--  WHERE r.status IN ('GOOD','WISH')
--  GROUP BY r.id
--  ORDER BY hit DESC,
--           r.last_cooked_on ASC NULLS FIRST;


-- (3) 장보기 목록 : 3단 분류
--     구매 이력 + 대략적인 유통기한으로 BUY/CHECK/HAVE 를 가른다.
--     확신이 없으면 CHECK 로 보내고 판정을 사용자에게 넘긴다.
--
-- WITH need AS (
--     SELECT ri.ingredient_id,
--            MIN(ri.raw_name) AS label
--       FROM recipe_ingredient ri
--       JOIN shopping_list_recipe slr ON slr.recipe_id = ri.recipe_id
--       LEFT JOIN ingredient i ON i.id = ri.ingredient_id
--      WHERE slr.list_id = $1
--        AND (ri.origin <> 'BODY' OR ri.confirmed)     -- 미확인 BODY 는 제외
--        AND COALESCE(i.purchasable, TRUE)             -- 물 같은 건 빼고
--      GROUP BY ri.ingredient_id
-- )
-- SELECT n.ingredient_id, n.label,
--        CASE
--          WHEN p.purchased_on IS NULL                      THEN 'BUY'
--          WHEN CURRENT_DATE - p.purchased_on
--               > COALESCE(i.shelf_life_days, 7)            THEN 'BUY'
--          WHEN CURRENT_DATE - p.purchased_on
--               > COALESCE(i.shelf_life_days, 7) / 2        THEN 'CHECK'
--          ELSE 'HAVE'
--        END AS bucket,
--        CASE WHEN p.purchased_on IS NOT NULL
--             THEN (CURRENT_DATE - p.purchased_on) || '일 전에 샀어요' END AS reason
--   FROM need n
--   LEFT JOIN ingredient i ON i.id = n.ingredient_id
--   LEFT JOIN LATERAL (
--        SELECT purchased_on FROM purchase
--         WHERE ingredient_id = n.ingredient_id
--         ORDER BY purchased_on DESC LIMIT 1
--   ) p ON TRUE;


-- =====================================================================
--  v1에서 일부러 뺀 것 (나중에 붙여도 구조가 안 흔들린다)
--
--   - 재고 수량 테이블      : purchase 로 대체
--   - 식비/지출             : purchase 에 amount 컬럼 추가하면 끝
--   - 사용자/공유           : 단일 사용자 전제. user_id 는 나중에
--   - 커머스 연동           : 넣지 않는다
-- =====================================================================
