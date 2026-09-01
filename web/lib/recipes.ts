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

/** 탭 1 — 아직 만들기 전. 최근 저장 순 */
export function listWish(limit = 100) {
  return query<RecipeRow>(
    `${SELECT_ROW}
      WHERE r.status = 'WISH'
      ORDER BY r.created_at DESC
      LIMIT $1`,
    [limit],
  );
}

/**
 * 탭 2 — 최근 만든 것. **오래된 순으로 정렬한다.**
 * 이 정렬이 곧 추천이다 (지시서 3장). 뒤집지 마라.
 */
export function listCooked(limit = 100) {
  return query<RecipeRow>(
    `${SELECT_ROW}
      WHERE r.status = 'GOOD'
      ORDER BY r.last_cooked_on ASC NULLS FIRST, r.id ASC
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
export async function suggest() {
  const [old, fresh] = await Promise.all([
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.status = 'GOOD'
          AND r.last_cooked_on IS NOT NULL
          AND CURRENT_DATE - r.last_cooked_on >= $1
        ORDER BY r.last_cooked_on ASC, r.id ASC
        LIMIT 3`,
      [SUGGEST_AFTER_DAYS],
    ),
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.last_cooked_on IS NULL
          AND r.status <> 'BAD'
        ORDER BY r.created_at DESC
        LIMIT 2`,
    ),
  ]);
  return { old, fresh };
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
