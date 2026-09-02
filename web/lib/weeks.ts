/**
 * 지난 주 — 끝낸 장보기 목록이 곧 한 주다
 *
 * 이 앱에서 한 주를 끝내는 건 날짜가 아니라 **장보기 끝**이다
 * (lib/shopping.ts finish). 그래서 끝낸 목록 하나가 지난 한 주고,
 * 여기서 그걸 되짚어 본다.
 *
 * **끝낸 건 지우지 않는다.** 담았던 요리도 요일도 그대로 남아 있어서,
 * 잘못 눌렀으면 되돌릴 수 있다. 되돌리기가 없으면 한 번 잘못 누른
 * 사람은 그 주를 통째로 다시 담아야 한다.
 */

import { one, query, tx } from "./db";

export type PastWeek = {
  id: number;
  /** 목록을 연 날 (한국 기준) */
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

/** 이 안쪽이면 "방금 끝냈어요" 로 본다 — 되돌리기를 눈앞에 낸다 */
export const JUST_HOURS = 24;

const SELECT_WEEK = `
  SELECT sl.id,
         (sl.created_at AT TIME ZONE 'Asia/Seoul')::date::text   AS opened_on,
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
            WHERE cl.cooked_on
                  >= (sl.created_at AT TIME ZONE 'Asia/Seoul')::date
              AND cl.cooked_on
                  <= COALESCE((sl.completed_at AT TIME ZONE 'Asia/Seoul')::date,
                              (now() AT TIME ZONE 'Asia/Seoul')::date)
         ), '{}') AS cooked,
         EXTRACT(EPOCH FROM (now() - sl.completed_at)) / 3600 AS hours_ago
    FROM shopping_list sl`;

/** 끝낸 주들. 최근 것부터 */
export function past(limit = 12): Promise<PastWeek[]> {
  return query<PastWeek>(
    `${SELECT_WEEK}
      WHERE sl.status = 'DONE'
      ORDER BY sl.completed_at DESC NULLS LAST, sl.id DESC
      LIMIT $1`,
    [limit],
  );
}

/**
 * 방금 끝낸 주. 되돌리기를 띄울지 판단하는 데 쓴다.
 *
 * 열린 목록이 있어도 낸다 — 끝내면서 다음 주가 승격됐을 수 있고,
 * 되돌리기는 그것까지 제자리로 돌린다 (reopen).
 */
export async function justClosed(): Promise<PastWeek | null> {
  const recent = await one<{ completed_at: string | null }>(
    `SELECT completed_at::text FROM shopping_list WHERE status = 'DONE'
      ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1`,
  );
  if (!recent) return null;
  return (
    (await one<PastWeek>(
      `${SELECT_WEEK}
        WHERE sl.status = 'DONE'
        ORDER BY sl.completed_at DESC NULLS LAST, sl.id DESC
        LIMIT 1`,
    )) ?? null
  );
}

/**
 * 끝낸 주를 다시 연다. **장보기 끝의 정확한 반대다.**
 *
 * 끝낼 때 다음 주가 이번 주로 승격됐을 수 있다 (lib/shopping.ts finish).
 * 그러면 그것부터 다음 주로 되돌린다 — 안 그러면 두 주가 동시에 이번
 * 주가 되어 "이번 주" 가 뭔지 알 수 없다.
 *
 * 승격된 목록은 **되살리려는 목록보다 나중에 만들어진 것**이다. 다음 주는
 * 이번 주를 담기 시작한 뒤에야 생기니까 id 가 항상 더 크다.
 */
export async function reopen(listId: number): Promise<void> {
  await tx(async (q) => {
    const target = await q<{ id: number }>(
      `SELECT id FROM shopping_list WHERE id = $1 AND status = 'DONE'`,
      [listId],
    );
    if (target.length === 0) return;

    // 승격됐던 다음 주를 제자리로. 없으면 아무 일도 안 한다.
    await q(
      `UPDATE shopping_list SET status = 'NEXT'
        WHERE status = 'OPEN' AND id > $1`,
      [listId],
    );
    // 그래도 열린 게 남아 있으면 (내가 모르는 목록) 손대지 않는다
    const stillOpen = await q<{ id: number }>(
      `SELECT id FROM shopping_list WHERE status = 'OPEN' LIMIT 1`,
    );
    if (stillOpen.length > 0) return;

    await q(
      `UPDATE shopping_list SET status = 'OPEN', completed_at = NULL
        WHERE id = $1`,
      [listId],
    );
  });
}
