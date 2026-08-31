/**
 * 냉장고 재료 가중치 (작업 순서 8번)
 *
 * **저장하지 않는다.** 지금 보고 있는 주소(`?have=`)에만 실려 있다가
 * 화면을 떠나면 사라진다. 상시 재고 DB 를 만들면 사용자가 갱신을 안 해서
 * 2주 만에 실제 냉장고와 어긋나고, 어긋나는 순간 추천이 쓸모없어진다
 * (지시서 6장).
 *
 * 용도는 하나뿐이다 — **가중치**. 필터가 아니다.
 * 재료가 하나도 안 맞아도 결과가 비면 안 된다. 그게 "대충 넣어도 되는"
 * 이유다 (원칙 ①: 빈 화면이 없어야 한다).
 *
 * 수량은 묻지 않는다. 있냐 없냐만.
 */

import { query } from "./db";
import type { Chip } from "./fridge.types";

export type { Chip };

export type Weighted = {
  id: number;
  title: string;
  status: string;
  hit: number;
  last_cooked_on: string | null;
  ingredients: string[];
};

/**
 * 칩으로 미리 깔아둘 재료.
 *
 * 타이핑을 시키지 않는다 (스펙 4장 화면 ②). **새 입력을 만들지 않고**
 * 이미 있는 데이터에서 뽑는다 (원칙 ③) — 최근에 산 것과 내 레시피에
 * 자주 나오는 것.
 */
export async function chips(limit = 18): Promise<Chip[]> {
  return query<Chip>(
    `WITH recent AS (
         SELECT ingredient_id, MAX(purchased_on) AS at
           FROM purchase
          WHERE purchased_on > CURRENT_DATE - 30
          GROUP BY ingredient_id
     ),
     used AS (
         SELECT ri.ingredient_id, COUNT(*) AS n
           FROM recipe_ingredient ri
           JOIN recipe r ON r.id = ri.recipe_id
          WHERE ri.ingredient_id IS NOT NULL
            AND r.status IN ('GOOD','WISH')
          GROUP BY ri.ingredient_id
     )
     SELECT i.id, i.canonical_name AS name
       FROM ingredient i
       LEFT JOIN recent ON recent.ingredient_id = i.id
       LEFT JOIN used   ON used.ingredient_id = i.id
      WHERE i.purchasable
        AND (recent.at IS NOT NULL OR used.n IS NOT NULL)
      ORDER BY (recent.at IS NOT NULL) DESC,
               COALESCE(used.n, 0) DESC,
               i.canonical_name
      LIMIT $1`,
    [limit],
  );
}

/**
 * 넣어둔 재료로 가중치를 매긴 추천.
 *
 * SQL 은 db/schema.sql 의 "핵심 쿼리 3개" 중 (2)번과 같은 모양이다.
 * `LEFT JOIN` + `ORDER BY` 라서 **결과가 0건이 되지 않는다.**
 */
export async function weighted(haveIds: number[], limit = 6) {
  return query<Weighted>(
    `SELECT r.id, r.title, r.status,
            COUNT(ri.id) FILTER (WHERE ri.ingredient_id = ANY($1::bigint[])) AS hit,
            r.last_cooked_on::text AS last_cooked_on,
            COALESCE((
              SELECT array_agg(x.raw_name ORDER BY x.id)
                FROM (SELECT ri2.id, ri2.raw_name
                        FROM recipe_ingredient ri2
                       WHERE ri2.recipe_id = r.id
                         AND (ri2.origin <> 'BODY' OR ri2.confirmed)
                       ORDER BY ri2.id
                       LIMIT 4) x
            ), '{}') AS ingredients
       FROM recipe r
       LEFT JOIN recipe_ingredient ri ON ri.recipe_id = r.id
      WHERE r.status IN ('GOOD','WISH')
      GROUP BY r.id
      ORDER BY hit DESC,
               r.last_cooked_on ASC NULLS FIRST
      LIMIT $2`,
    [haveIds, limit],
  );
}

/** 주소에 실린 `?have=` 를 읽는다. 저장된 게 아니라 지금 화면의 상태다. */
export function parseHave(raw: string | string[] | undefined): number[] {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return [];
  return [
    ...new Set(
      s
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 40);
}
