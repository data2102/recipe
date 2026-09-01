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

  const rows = await query<{
    recipe_id: number;
    title: string;
    status: string;
    day: number | null;
  }>(
    `SELECT slr.recipe_id, r.title, r.status, slr.day_of_week AS day
       FROM shopping_list_recipe slr
       JOIN recipe r ON r.id = slr.recipe_id
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
