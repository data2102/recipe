/**
 * 레시피 조회 — 화면 3탭이 여기서 나온다 (지시서 3장)
 *
 * SQL 은 db/schema.sql 의 "핵심 쿼리 3개" 와 같은 모양을 유지한다.
 * 정렬이 곧 추천이다 — 별도 추천 로직 없이 순서만으로 작동한다.
 */

import { query } from "./db";

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
 * 탭 3 — 이번 주 추천.
 * 오래된 것 2~3개 + 아직 안 만든 것 1~2개를 섞어 낸다 (지시서 3장).
 * 추천 풀은 GOOD 만 쓴다 — 별로였던 걸 60일 뒤 다시 밀면 앱이 바보처럼 보인다.
 * **빈 화면이 절대 없어야 한다**: 한쪽이 비어도 다른 쪽은 나온다.
 */
export async function suggest() {
  const [old, fresh] = await Promise.all([
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.status = 'GOOD'
        ORDER BY r.last_cooked_on ASC NULLS FIRST, r.id ASC
        LIMIT 3`,
    ),
    query<RecipeRow>(
      `${SELECT_ROW}
        WHERE r.status = 'WISH'
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
