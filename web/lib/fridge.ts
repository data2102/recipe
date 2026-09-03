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
import { NO_HAVE, nameKey, type Chip, type Have } from "./fridge.types";

export type { Chip, Have };

export type Weighted = {
  id: number;
  title: string;
  status: string;
  hit: number;
  last_cooked_on: string | null;
  ingredients: string[];
};

/**
 * 칩으로 깔아둘 재료 — **이번 주에 담은 요리들이 쓰는 것 전부.**
 *
 * 타이핑을 시키지 않는다 (스펙 4장 화면 ②). 새 입력을 만들지 않고 이미
 * 있는 데이터에서 뽑는다 (원칙 ③).
 *
 * 예전에는 사전 전체에서 "자주 쓰는 것 18개" 를 뽑았다. 그러면 지금
 * 눈앞의 요리에 들어가는데 칩에는 없는 재료가 생긴다 — 있는지 물어볼
 * 방법이 없으니 그건 무조건 사야 할 것으로 남는다.
 *
 * 그렇다고 추천 목록의 재료까지 넣으면 (아직 먹기로 정하지도 않은 요리다)
 * 칩이 수십 개가 돼서 뭘 눌러야 할지 알 수 없다. **담은 것 기준**이면
 * 장보기 목록의 범위와 정확히 같아진다 — 칩이 묻는 건 "살 것 중에 뭐가
 * 이미 집에 있나" 이므로 그게 맞다.
 *
 * 개수를 자르지 않는다. 몇 개가 되든 그 요리들에 필요한 만큼이고, 자르는
 * 순간 잘린 재료를 물어볼 길이 사라진다. 대신 **여러 요리에 겹치는 것부터**
 * 낸다 — 하나만 눌러도 여러 요리에 걸리는 게 앞에 온다.
 *
 * 이름은 **레시피에 적힌 표기**다 (원칙 ①). 사전이 '진간장' 으로 붙였어도
 * 내 레시피가 '간장' 이면 칩도 '간장' 이다 — 내가 쓴 적 없는 이름을
 * 보여주면 내 냉장고 이야기로 안 읽힌다. 합치는 건 id 가 하고, 보여주는
 * 건 원문이 한다.
 */
export async function chips(recipeIds: number[]): Promise<Chip[]> {
  // 담은 게 없으면 물어볼 재료도 없다.
  if (recipeIds.length === 0) return [];
  return query<Chip>(
    `SELECT
         -- 사전이 붙인 것끼리는 id 로 합친다 ('고추가루'와 '고춧가루'가
         -- 한 칩이 된다). 사전에 없는 것은 표기로 합친다.
         MIN(ri.ingredient_id) AS id,
         -- 보여줄 이름은 레시피에 적힌 표기다 (원칙 ①). 여러 표기가 한
         -- 재료로 합쳐졌으면 제일 많이 쓴 표기를 쓴다.
         (array_agg(ri.raw_name ORDER BY ri.n DESC, ri.raw_name))[1] AS name
       FROM (
         SELECT ri.ingredient_id, ri.raw_name, ri.recipe_id,
                COUNT(*) OVER (PARTITION BY ri.raw_name) AS n
           FROM recipe_ingredient ri
           LEFT JOIN ingredient i ON i.id = ri.ingredient_id
          WHERE ri.recipe_id = ANY($1::bigint[])
            AND (ri.origin <> 'BODY' OR ri.confirmed)  -- 미확인 BODY 는 제외
            AND COALESCE(i.purchasable, TRUE)          -- 물 같은 건 빼고
       ) ri
      GROUP BY COALESCE(ri.ingredient_id::text,
                        'raw:' || replace(ri.raw_name, ' ', ''))
      ORDER BY COUNT(DISTINCT ri.recipe_id) DESC,
               (array_agg(ri.raw_name ORDER BY ri.n DESC, ri.raw_name))[1]`,
    [recipeIds],
  );
}

/**
 * 넣어둔 재료로 가중치를 매긴 추천.
 *
 * SQL 은 db/schema.sql 의 "핵심 쿼리 3개" 중 (2)번과 같은 모양이다.
 * `LEFT JOIN` + `ORDER BY` 라서 **결과가 0건이 되지 않는다.**
 */
/**
 * **지금 화면에서 빠져 있다.**
 *
 * 식단에 "집에 있는 걸로 만들 수 있어요" 로 나가던 것이다. 간장 하나만
 * 눌러도 간장 들어가는 레시피가 전부 올라와서 (양념은 어디에나 들어간다)
 * 추천이라기보다 목록을 한 벌 더 낸 것에 가까웠다. 쓰는 사람이 빼기로
 * 정했다 — 지시서 8번을 되살릴 때 다시 쓴다. 지우지 마라.
 *
 * 칩 자체는 그대로다. 칩이 하는 일은 **장보기에서 빼는 것**이다.
 */
export async function weighted(have: Have = NO_HAVE, limit = 6) {
  // 사전에 안 붙은 재료도 가중치에 넣는다. 안 그러면 '멸치액젓' 을 눌러도
  // 아무 요리도 안 올라와서 눌러본 사람이 고장난 줄 안다.
  const names = have.names.map(nameKey);
  return query<Weighted>(
    `SELECT r.id, r.title, r.status,
            COUNT(ri.id) FILTER (
              WHERE ri.ingredient_id = ANY($1::bigint[])
                 OR replace(ri.raw_name, ' ', '') = ANY($3::text[])
            ) AS hit,
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
    [have.ids, limit, names],
  );
}

/**
 * 주소에 실린 `?have=` · `?haveRaw=` 를 읽는다.
 * 저장된 게 아니라 지금 화면의 상태다 (지시서 6장).
 */
export function parseHave(
  ids: string | string[] | undefined,
  names: string | string[] | undefined,
): Have {
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) || "";

  return {
    ids: [
      ...new Set(
        one(ids)
          .split(",")
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ].slice(0, 60),
    names: [
      ...new Set(
        one(names)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 60),
  };
}

/** 주소로 되돌린다. 칩을 누를 때마다 이걸로 주소를 다시 쓴다 */
export function haveParams(have: Have): URLSearchParams {
  const q = new URLSearchParams();
  if (have.ids.length) q.set("have", have.ids.join(","));
  if (have.names.length) q.set("haveRaw", have.names.join(","));
  return q;
}
