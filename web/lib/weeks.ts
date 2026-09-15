/**
 * 지난 주 — 이미 지나간 주들
 *
 * **날짜로 가른다.** 오늘이 속한 월요일보다 앞에서 시작한 주가 지난
 * 주다 (`shopping_list.starts_on`). 장보기를 끝냈는지는 상관없다 —
 * 안 끝낸 채 지나간 주도 지난 주고, 그렇다고 화면에 적는다.
 *
 * 예전에는 "끝낸 목록(DONE)" 이 곧 지난 주였다. 그러면 장보기 끝을 안
 * 누른 주가 영영 이번 주로 남아서, 9월 8일에 8/31~9/6 이 이번 주로
 * 보였다 (lib/shopping.ts weekStart).
 *
 * **지우지 않는다.** 담았던 요리도 요일도 그대로 남아 있다.
 */

import { one, query } from "./db";

export type PastWeek = {
  id: number;
  /** 그 주가 시작한 날 = 그 주의 월요일 (한국 기준) */
  opened_on: string;
  /** 장보기를 끝낸 날. 아직 안 끝냈으면 null */
  closed_on: string | null;
  /** 그 주에 담았던 요리 이름 */
  titles: string[];
  /** 그 주에 산 것 (체크한 항목) 개수 */
  bought: number;
  /** 그 기간에 실제로 만든 요리. 담아만 두고 안 만든 것은 안 들어간다 */
  cooked: string[];
  /** 끝낸 지 몇 시간 됐나. 아직 안 끝냈으면 null */
  hours_ago: number | null;
};


const SELECT_WEEK = `
  SELECT sl.id,
         sl.starts_on::text                                      AS opened_on,
         (sl.completed_at AT TIME ZONE 'Asia/Seoul')::date::text AS closed_on,
         COALESCE((
           SELECT array_agg(r.title ORDER BY slr.day_of_week NULLS LAST, r.title)
             FROM shopping_list_recipe slr
             JOIN recipe r ON r.id = slr.recipe_id
            WHERE slr.list_id = sl.id
         ), '{}') AS titles,
         (SELECT COUNT(*) FROM shopping_item si
           WHERE si.list_id = sl.id AND si.checked) AS bought,
         -- 담은 것과 만든 것은 다르다. 만든 것은 조리 기록에서 온다 —
         -- 그 주에 열려 있던 동안 만든 요리를 날짜 범위로 찾는다.
         COALESCE((
           SELECT array_agg(DISTINCT r.title)
             FROM cook_log cl
             JOIN recipe r ON r.id = cl.recipe_id
            WHERE cl.cooked_on >= sl.starts_on
              AND cl.cooked_on <= sl.starts_on + 6
         ), '{}') AS cooked,
         EXTRACT(EPOCH FROM (now() - sl.completed_at)) / 3600 AS hours_ago
    FROM shopping_list sl`;

/**
 * 지나간 주들. 최근 것부터.
 *
 * 오늘이 속한 주보다 앞에서 시작한 것 전부다 — 끝냈든 안 끝냈든.
 * 이번 주와 다음 주는 여기 안 나온다 (그건 식단·장보기 화면이다).
 */
export function past(limit = 12): Promise<PastWeek[]> {
  return query<PastWeek>(
    `${SELECT_WEEK}
      WHERE sl.starts_on < (now() AT TIME ZONE 'Asia/Seoul')::date
                           - (EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Seoul'))::int - 1)
      ORDER BY sl.starts_on DESC
      LIMIT $1`,
    [limit],
  );
}

/** 그 주 하나. 보고 있는 주가 끝났는지 화면이 물을 때 쓴다 */
export async function week(listId: number | null): Promise<PastWeek | null> {
  if (!listId) return null;
  return (await one<PastWeek>(`${SELECT_WEEK} WHERE sl.id = $1`, [listId])) ?? null;
}


/**
 * 끝낸 주를 다시 연다 — **장보기 끝의 반대다.**
 *
 * 이제는 상태 한 줄이면 끝이다. 예전에는 끝내면서 다음 주가 이번 주로
 * 승격됐어서 그것까지 되돌려야 했는데, 주가 날짜로 정해지면서
 * 승격이라는 게 없어졌다 (lib/shopping.ts finish).
 */
export async function reopen(listId: number): Promise<void> {
  await query(
    `UPDATE shopping_list SET status = 'OPEN', completed_at = NULL
      WHERE id = $1 AND status = 'DONE'`,
    [listId],
  );
}

/** 지난 주의 요리 한 건. 날짜는 그 주 월요일에 요일을 더해서 나온다 */
export type PastDish = {
  list_id: number;
  recipe_id: number;
  title: string;
  /** 0=월 … 6=일. 안 정했으면 null */
  day: number | null;
  /** 그 날짜에 만든 기록이 있는가 */
  cooked: boolean;
};

/**
 * 지난 주들의 담긴 요리 — **한 번에 가져온다.**
 *
 * 주마다 따로 물으면 열두 주가 스물네 번 왕복이다. 서버리스에서는
 * 인스턴스당 접속이 하나라 (CLAUDE.md) 그게 줄줄이 늘어선다.
 *
 * 날짜를 여기서 만들지 않는다 — 요일만 주고, 며칠인지는 화면이 그 주
 * 월요일에 더한다 (lib/week.ts `plan` 과 같은 규칙). 두 벌로 세면 어긋난다.
 */
export function dishesOf(listIds: number[]): Promise<PastDish[]> {
  if (listIds.length === 0) return Promise.resolve([]);
  return query<PastDish>(
    `SELECT slr.list_id, slr.recipe_id, r.title, slr.day_of_week AS day,
            EXISTS (
              SELECT 1 FROM cook_log cl
               WHERE cl.recipe_id = r.id
                 AND cl.cooked_on = sl.starts_on + slr.day_of_week
            ) AS cooked
       FROM shopping_list_recipe slr
       JOIN shopping_list sl ON sl.id = slr.list_id
       JOIN recipe r ON r.id = slr.recipe_id
      WHERE slr.list_id = ANY($1::bigint[])
      ORDER BY slr.list_id, slr.day_of_week NULLS LAST, r.title`,
    [listIds],
  );
}
