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

import { one, query } from "./db";

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
 * 방금 끝낸 주. **되돌리기를 띄울지 판단하는 데 쓴다.**
 *
 * 지금 열려 있는 목록이 있으면 없는 것으로 친다 — 이미 다음 주를
 * 시작했는데 지난 주를 되살리면 두 주가 겹친다.
 */
export async function justClosed(): Promise<PastWeek | null> {
  const open = await one<{ id: number }>(
    `SELECT id FROM shopping_list WHERE status = 'OPEN' LIMIT 1`,
  );
  if (open) return null;
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
 * 끝낸 주를 다시 연다.
 *
 * 이미 열린 목록이 있으면 아무것도 안 한다 — 두 주가 동시에 열리면
 * "이번 주" 가 뭔지 알 수 없게 된다 (openList 가 하나만 고른다).
 */
export async function reopen(listId: number): Promise<void> {
  await query(
    `UPDATE shopping_list
        SET status = 'OPEN', completed_at = NULL
      WHERE id = $1
        AND status = 'DONE'
        AND NOT EXISTS (SELECT 1 FROM shopping_list WHERE status = 'OPEN')`,
    [listId],
  );
}
