/**
 * 이번 주 식단 — 담은 요리를 요일에 배정한다
 *
 * 담기와 요일 정하기는 다른 행동이다. 담을 때는 "이번 주에 이거 먹자"
 * 까지만 정하고, 요일은 나중에 정하거나 영영 안 정할 수도 있다
 * (`day_of_week` 가 NULL 을 허용하는 이유 — db/schema.sql).
 *
 * 요일을 강제하면 담는 것 자체가 무거워진다. 담기는 한 번 누르는 일로
 * 남겨두고, 요일은 정하고 싶은 사람만 정한다.
 */

import { query } from "./db";
import type { Planned, PlannedItem } from "./week.types";

export type { Planned, PlannedItem };

/**
 * 이번 주에 담은 요리 + 각 요리에 필요한 재료.
 *
 * 재료는 **원문 표기**로 보여준다 (원칙 ①). 장보기 목록은 같은 재료를
 * 합쳐서 한 줄로 내지만, 여기서는 요리별로 나눠 본다 — "이 요리 하나
 * 만들려면 뭐가 필요한가" 를 보는 자리라 합치면 안 된다.
 *
 * 미확인 BODY 는 뺀다. 조리 단계에만 나와서 2패스가 지어냈을 수 있는
 * 것들이라, 사용자가 확인 화면에서 넣겠다고 한 것만 보여준다.
 */
export async function plan(listId: number | null): Promise<Planned[]> {
  if (!listId) return [];

  /*
   * 정해둔 요일이 **실제로 며칠인지** 같이 낸다.
   *
   * 목록을 연 날부터 세어 다가오는 그 요일이다 (토요일에 담으면서 화요일을
   * 고르면 다음 화요일). 달력 주에 묶지 않는 이유는 이 앱에서 한 주를 끝내는
   * 게 날짜가 아니라 **장보기 끝** 이기 때문이다 (lib/shopping.ts finish).
   *
   * 그 날짜가 지났는데 그날의 조리 기록이 없으면 물어볼 거리가 된다 —
   * 만들었는지 아닌지는 사람만 안다. 자동으로 기록하지 않는다.
   */
  const rows = await query<{
    recipe_id: number;
    title: string;
    status: string;
    day: number | null;
    planned_on: string | null;
    past: boolean;
    cooked: boolean;
  }>(
    `SELECT slr.recipe_id, r.title, r.status, slr.day_of_week AS day,
            d.on_date::text AS planned_on,
            COALESCE(d.on_date < (now() AT TIME ZONE 'Asia/Seoul')::date, FALSE)
              AS past,
            EXISTS (SELECT 1 FROM cook_log cl
                     WHERE cl.recipe_id = r.id
                       AND cl.cooked_on = d.on_date) AS cooked
       FROM shopping_list_recipe slr
       JOIN shopping_list sl ON sl.id = slr.list_id
       JOIN recipe r ON r.id = slr.recipe_id
       LEFT JOIN LATERAL (
         SELECT (sl.created_at AT TIME ZONE 'Asia/Seoul')::date
              + ((slr.day_of_week
                  - (EXTRACT(ISODOW FROM (sl.created_at AT TIME ZONE 'Asia/Seoul'))::int - 1)
                  + 7) % 7) AS on_date
       ) d ON slr.day_of_week IS NOT NULL
      WHERE slr.list_id = $1
      ORDER BY slr.day_of_week NULLS LAST, r.title`,
    [listId],
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.recipe_id);
  const items = await query<PlannedItem & { recipe_id: number }>(
    `SELECT ri.recipe_id, ri.id, ri.raw_name, ri.raw_qty,
            ri.ingredient_id, ri.choice_group
       FROM recipe_ingredient ri
       LEFT JOIN ingredient i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ANY($1::bigint[])
        AND (ri.origin <> 'BODY' OR ri.confirmed)   -- 미확인 BODY 는 제외
        AND COALESCE(i.purchasable, TRUE)           -- 물 같은 건 빼고
      ORDER BY ri.recipe_id, ri.id`,
    [ids],
  );

  const byRecipe = new Map<number, PlannedItem[]>();
  for (const it of items) {
    const list = byRecipe.get(it.recipe_id) ?? [];
    list.push({
      id: it.id,
      raw_name: it.raw_name,
      raw_qty: it.raw_qty,
      ingredient_id: it.ingredient_id,
      choice_group: it.choice_group,
    });
    byRecipe.set(it.recipe_id, list);
  }

  return rows.map((r) => ({
    recipe_id: r.recipe_id,
    title: r.title,
    status: r.status,
    day: r.day,
    plannedOn: r.planned_on,
    past: r.past,
    cooked: r.cooked,
    items: byRecipe.get(r.recipe_id) ?? [],
  }));
}

/**
 * 요일을 정한다. null 이면 "아직 안 정함" 으로 되돌린다.
 *
 * 열려 있는 목록에만 손댄다 — 지난 주 목록은 이미 닫혀서 과거다.
 */
export async function setDay(recipeId: number, day: number | null): Promise<void> {
  if (day !== null && !(Number.isInteger(day) && day >= 0 && day <= 6)) {
    throw new Error("요일을 못 알아보겠어요");
  }
  await query(
    `UPDATE shopping_list_recipe slr
        SET day_of_week = $2
       FROM shopping_list sl
      WHERE sl.id = slr.list_id
        AND sl.status = 'OPEN'
        AND slr.recipe_id = $1`,
    [recipeId, day],
  );
}
