/**
 * 레시피 조회 — 화면 3탭이 여기서 나온다 (지시서 3장)
 *
 * SQL 은 db/schema.sql 의 "핵심 쿼리 3개" 와 같은 모양을 유지한다.
 * 정렬이 곧 추천이다 — 별도 추천 로직 없이 순서만으로 작동한다.
 */

import { query } from "./db";
import { SUGGEST_AFTER_DAYS } from "./say";

export type RecipeRow = {
  id: number;
  title: string;
  status: "WISH" | "GOOD" | "BAD";
  source_url: string | null;
  last_cooked_on: string | null;
  cook_count: number;
  /** 화면에 보여줄 재료 요약. 원문(raw_name)이다 — 표준명이 아니다 */
  ingredients: string[];
};

/**
 * 정렬. **기본은 그 탭의 추천 순서다** — 이름순은 "그거 어디 있더라" 로
 * 찾을 때 쓰는 것이고, 정렬이 곧 추천이라는 규칙은 그대로다 (지시서 3장).
 *
 * 주소에만 산다 (`?sort=name`). 저장하지 않는다 — 다음에 열면 다시 추천 순.
 */
export type Sort = "default" | "name";

/*
 * 이름순은 그냥 `ORDER BY r.title` 이다. 한글 음절은 코드포인트 순서가
 * 곧 가나다순이라 (초성-중성-종성 순으로 배열된 블록) 따로 collation 을
 * 걸 필요가 없다.
 */
const WISH_ORDER: Record<Sort, string> = {
  default: "r.created_at DESC, r.id DESC",
  name: "r.title, r.id",
};

const COOKED_ORDER: Record<Sort, string> = {
  default: "r.last_cooked_on ASC NULLS FIRST, r.id ASC",
  name: "r.title, r.id",
};

/**
 * 재료 요약은 raw_name 을 쓴다. 사용자가 올린 그 표기 그대로 보여준다
 * (원칙 ①: 원문을 덮어쓰지 않는다). ingredient_id 는 화면에 안 나온다.
 */
const SELECT_ROW = `
  SELECT r.id, r.title, r.status, r.source_url,
         r.last_cooked_on::text AS last_cooked_on, r.cook_count,
         COALESCE((
           SELECT array_agg(x.raw_name ORDER BY x.id)
             FROM (SELECT ri.id, ri.raw_name
                     FROM recipe_ingredient ri
                    WHERE ri.recipe_id = r.id
                      AND (ri.origin <> 'BODY' OR ri.confirmed)
                    ORDER BY ri.id
                    LIMIT 4) x
         ), '{}') AS ingredients
    FROM recipe r`;

/** 탭 1 — 아직 만들기 전. 기본은 최근 저장 순 */
export function listWish(limit = 100, sort: Sort = "default") {
  return query<RecipeRow>(
    `${SELECT_ROW}
      WHERE r.status = 'WISH'
      ORDER BY ${WISH_ORDER[sort] ?? WISH_ORDER.default}
      LIMIT $1`,
    [limit],
  );
}

/**
 * 탭 2 — 최근 만든 것. **오래된 순으로 정렬한다.**
 * 이 정렬이 곧 추천이다 (지시서 3장). 뒤집지 마라.
 */
export function listCooked(limit = 100, sort: Sort = "default") {
  return query<RecipeRow>(
    `${SELECT_ROW}
      WHERE r.status = 'GOOD'
      ORDER BY ${COOKED_ORDER[sort] ?? COOKED_ORDER.default}
      LIMIT $1`,
    [limit],
  );
}

/**
 * 탭 3 — 이번 주 추천. 두 갈래로 낸다 (지시서 3장).
 *
 * 가르는 기준은 상태가 아니라 **만든 적이 있는가**다.
 *
 *   오랜만에 어때요    만든 적 있고 + 30일 지남
 *   아직 안 만들어본 것 만든 적 없음 (GOOD 이든 WISH 든)
 *
 * 만든 적 없는 건 아무리 GOOD 이어도 "오랜만" 이 성립하지 않는다. 노션에서
 * "괜찮았다" 로 옮겨왔지만 날짜가 없는 것들이 그렇다 — 예전에는 그게
 * 오랜만에 어때요 맨 위에 "아직 안 만들어봤어요" 라고 붙어 나왔다.
 *
 * BAD 는 양쪽 다 안 나온다. 별로였던 걸 30일 뒤 다시 밀면 앱이 바보처럼
 * 보인다 (지시서 3장).
 *
 * 30일이 안 된 게 없으면 위쪽은 빈다. 아래 목록과 이번 주 식단이 항상
 * 있으니 화면이 통째로 비지는 않는다.
 */
const SHOW_OLD = 3;
const SHOW_FRESH = 2;
const PER_PAGE = SHOW_OLD + SHOW_FRESH;
/** 돌려 볼 수 있는 범위. 이보다 뒤는 추천이라기엔 너무 멀다 */
const POOL = 60;

/**
 * 두 후보 줄을 한 줄로 엮는다 — 오랜만에 3, 아직 안 만들어본 것 2, 다시 3, 2 …
 *
 * **한 쪽이 먼저 바닥나면 남은 쪽이 그 자리를 채운다.** 이게 핵심이다:
 * "오랜만에" 후보는 보통 몇 개뿐이라 (만든 적 있고 + 30일이 지나야 한다)
 * 각자 자기 풀에서만 돌리면 위쪽 세 줄이 눌러도 눌러도 그대로 남는다.
 * 실제로 "레시피가 많이 없는 게 아닌데 계속 똑같은 게 반복" 됐다.
 */
function weave<T>(a: T[], b: T[], na: number, nb: number): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const before = out.length;
    for (let k = 0; k < na && i < a.length; k++) out.push(a[i++]);
    for (let k = 0; k < nb && j < b.length; k++) out.push(b[j++]);
    if (out.length === before) break; // 둘 다 비었다 — 안전장치
  }
  return out;
}

/**
 * 담을 것 추천. `again` 번 넘긴 상태로 낸다.
 *
 * **겹치지 않게 넘긴다.** 예전에는 각 목록을 제자리에서 돌렸는데
 * (후보 5개에 3칸이면 0·1·2 → 3·4·0), 넘길 때마다 방금 본 게 한둘씩
 * 딸려 와서 "또 같은 거" 로 보였다. 이제 한 줄로 엮어 5개씩 자른다 —
 * **한 바퀴 도는 동안 같은 요리가 두 번 나오지 않는다.**
 *
 * 끝에 닿으면 처음으로 돌아온다. 마지막 장에서 빈 화면이 나오면 버튼이
 * 고장난 것처럼 보인다 — 대신 몇 번째 장인지 같이 내서, 다시 처음이라는
 * 걸 화면이 말한다 (app/page.tsx).
 */
export async function suggest(again = 0) {
  const [oldPool, freshPool] = await Promise.all([
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.status = 'GOOD'
          AND r.last_cooked_on IS NOT NULL
          AND CURRENT_DATE - r.last_cooked_on >= $1
        ORDER BY r.last_cooked_on ASC, r.id ASC
        LIMIT ${POOL}`,
      [SUGGEST_AFTER_DAYS],
    ),
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.last_cooked_on IS NULL
          AND r.status <> 'BAD'
        ORDER BY r.created_at DESC
        LIMIT ${POOL}`,
    ),
  ]);

  const line = weave(oldPool, freshPool, SHOW_OLD, SHOW_FRESH);
  const pages = Math.max(1, Math.ceil(line.length / PER_PAGE));
  const page = ((again % pages) + pages) % pages;
  const shown = line.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  // 어느 갈래에서 왔는지로 다시 가른다. 화면은 두 소제목으로 나눠 낸다.
  const fromOld = new Set(oldPool.map((r) => r.id));
  return {
    old: shown.filter((r) => fromOld.has(r.id)),
    fresh: shown.filter((r) => !fromOld.has(r.id)),
    /** 몇 번째 장인가 (0부터) · 전부 몇 장인가. 넘길 게 없으면 pages 가 1 */
    page,
    pages,
  };
}

export async function counts() {
  const [row] = await query<{
    wish: string;
    good: string;
    bad: string;
    ingredients: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'WISH') AS wish,
            COUNT(*) FILTER (WHERE status = 'GOOD') AS good,
            COUNT(*) FILTER (WHERE status = 'BAD')  AS bad,
            (SELECT COUNT(*) FROM ingredient)       AS ingredients
       FROM recipe`,
  );
  return {
    wish: Number(row?.wish ?? 0),
    good: Number(row?.good ?? 0),
    bad: Number(row?.bad ?? 0),
    ingredients: Number(row?.ingredients ?? 0),
  };
}

/* ---------------------------------------------------------------- */
/*  레시피 한 건 보기                                                 */
/* ---------------------------------------------------------------- */

export type DetailItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  /** 장보기에 넣기로 한 것인가. 뺀 것도 레시피에는 그대로 남는다 */
  confirmed: boolean;
  /** 'A 또는 B' 중 하나. 고칠 때 그대로 돌려보낸다 */
  choice_group: string | null;
  /** LIST / BODY / USER. 고칠 때 그대로 돌려보낸다 */
  origin: string;
};

export type RecipeDetail = RecipeRow & {
  items: DetailItem[];
  steps: string[];
};

/**
 * 저장해둔 레시피를 그대로 펼친다.
 *
 * **원문 그대로 보여준다** (원칙 ①). 재료는 raw_name·raw_qty, 만드는 법은
 * 파서가 옮긴 본문 그대로다 — 요약하거나 다시 쓰지 않는다.
 *
 * 안 물어본 것까지 다 낸다. 확인 화면에서 "아니요" 한 재료도 레시피에는
 * 적혀 있던 것이라 지우지 않고, 장보기에서 뺐다고만 표시한다 — 여기는
 * 장보기 목록이 아니라 **레시피 원문**이다.
 */
export async function detail(id: number): Promise<RecipeDetail | null> {
  const [rows, items, steps] = await Promise.all([
    query<RecipeRow>(`${SELECT_ROW} WHERE r.id = $1`, [id]),
    query<DetailItem>(
      `SELECT raw_name, raw_qty, section, confirmed, choice_group, origin
         FROM recipe_ingredient
        WHERE recipe_id = $1
        ORDER BY id`,
      [id],
    ),
    query<{ body: string }>(
      `SELECT body FROM recipe_step WHERE recipe_id = $1 ORDER BY seq`,
      [id],
    ),
  ]);

  if (rows.length === 0) return null;
  return { ...rows[0], items, steps: steps.map((s) => s.body) };
}
