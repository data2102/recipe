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
import { notes } from "./notes";
import { openList, weekStart, type Which } from "./shopping";
import { daysFrom } from "./say";
import type { PickDay, Placement } from "./plan.types";
import type { Planned, PlannedItem } from "./week.types";

export type { Planned, PlannedItem };

/** 한 주치 — 그 주의 날짜 일곱 개와 거기 담긴 것 */
export type WeekPlan = {
  which: Which;
  /** 그 주의 월요일 (`YYYY-MM-DD`) */
  start: string;
  dates: string[];
  listId: number | null;
  plan: Planned[];
};

/**
 * 식단 화면이 보는 범위 — **이번 주와 다음 주를 한 줄로 이어붙인 열나흘.**
 *
 * 예전에는 화면이 탭 둘로 갈려 있었다 (이번 주 / 다음 주). 그런데 사람이
 * 묻는 건 "이번 주에 뭐 담았지" 가 아니라 "수요일에 뭐 먹지" 다 — 주를
 * 먼저 고르게 하면 그 답을 보려고 탭을 두 번 오간다. 날짜를 쭉 늘어놓으면
 * 주 경계는 그냥 줄 사이의 구분선이 된다.
 *
 * **DB 는 여전히 주 단위다** (`shopping_list.starts_on`). 장보기가 주
 * 단위라서 그건 안 바꾼다 — 여기서 두 주를 합쳐 보여줄 뿐이고, 날짜가
 * 어느 목록으로 가는지는 `whichOf` 가 되돌려준다.
 */
export async function horizon(): Promise<WeekPlan[]> {
  const weeks: Which[] = ["this", "next"];
  return Promise.all(
    weeks.map(async (which) => {
      const start = weekStart(which);
      const listId = await openList(false, which);
      return {
        which,
        start,
        dates: daysFrom(start),
        listId,
        plan: await plan(listId, start),
      };
    }),
  );
}

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
export async function plan(
  listId: number | null,
  startIso: string,
): Promise<Planned[]> {
  if (!listId) return [];

  /*
   * 정해둔 요일이 **실제로 며칠인지** 같이 낸다.
   *
   * **그 주의 월요일에 요일을 그냥 더한다** (0=월 … 6=일). 한 주가
   * 월요일에 시작하니까 그것뿐이다. 예전에는 "목록을 연 날부터 다가오는
   * 그 요일" 이라 수요일에 연 주는 수·목·금·토·일·월·화였는데, 주를
   * 날짜로 정하면서 (lib/shopping.ts weekStart) 그럴 일이 없어졌다.
   *
   * 시작일은 밖에서 받는다 — 화면이 보고 있는 주의 월요일이다.
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
       JOIN recipe r ON r.id = slr.recipe_id
       LEFT JOIN LATERAL (
         SELECT $2::date + slr.day_of_week AS on_date
       ) d ON slr.day_of_week IS NOT NULL
      WHERE slr.list_id = $1
      ORDER BY d.on_date NULLS LAST, r.title`,
    [listId, startIso],
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
 * 담기 화면이 날짜를 물어보는 데 필요한 것 (app/PlanButton.tsx).
 *
 * 날짜마다 **이미 담긴 메뉴와 적어둔 약속**을 같이 낸다 — 비어 있는 날을
 * 찾으려고 여는 자리라, 날짜만 늘어놓으면 고를 수가 없다.
 *
 * `placed` 는 요리 id -> 담긴 자리다. 화면이 "✓ 9/16" 을 적는 데 쓴다.
 */
export async function pickable(): Promise<{
  days: PickDay[];
  placed: Record<number, Placement[]>;
}> {
  const weeks = await horizon();
  const dates = weeks.flatMap((w) => w.dates);
  const note = await notes(dates[0], dates[dates.length - 1]);

  const days: PickDay[] = weeks.flatMap((w) =>
    w.dates.map((iso) => ({
      iso,
      which: w.which,
      note: note[iso] ?? "",
      titles: w.plan.filter((p) => p.plannedOn === iso).map((p) => p.title),
    })),
  );

  const placed: Record<number, Placement[]> = {};
  for (const w of weeks) {
    for (const p of w.plan) {
      (placed[p.recipe_id] ??= []).push({
        date: p.plannedOn,
        which: w.which,
      });
    }
  }

  return { days, placed };
}
