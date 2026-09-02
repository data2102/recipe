/**
 * 만든 요리 사진
 *
 * **조리 기록에 붙는다** (`cook_log.photo_key`). 스키마가 처음부터 그
 * 자리를 잡아뒀다 — 사진은 "이 레시피" 가 아니라 "이날 내가 만든 것" 이다.
 * 레시피에 따로 매달면 언제 만든 건지 모르는 사진만 쌓인다.
 *
 * 그래서 한 번 만들 때 한 장이다. 여러 장을 올리려면 만든 기록이 여러
 * 개여야 하는데, 그건 안 만든 날을 지어내는 것이다.
 *
 * 원본은 캡처와 같은 자리에 보관한다 (Supabase Storage · 비공개 버킷).
 * 화면에는 `/photo/<조리기록 id>` 로 내보낸다 — 버킷을 열지 않는다.
 */

import { query } from "./db";

export type Photo = {
  /** cook_log.id — 사진 주소가 이걸 쓴다 */
  id: number;
  cooked_on: string;
};

/** 이 레시피의 사진들. 최근에 만든 것부터 */
export function list(recipeId: number): Promise<Photo[]> {
  return query<Photo>(
    `SELECT id, cooked_on::text AS cooked_on
       FROM cook_log
      WHERE recipe_id = $1 AND photo_key IS NOT NULL
      ORDER BY cooked_on DESC, id DESC`,
    [recipeId],
  );
}

/** 사진 한 장의 보관 위치. 없는 사진은 null */
export async function keyOf(cookId: number): Promise<string | null> {
  const rows = await query<{ photo_key: string | null }>(
    `SELECT photo_key FROM cook_log WHERE id = $1`,
    [cookId],
  );
  return rows[0]?.photo_key ?? null;
}

/** 사진을 붙일 만한 최근 조리 기록을 찾는 창. 이만큼은 "그때 만든 것" 으로 본다 */
export const ATTACH_WITHIN_DAYS = 2;

/**
 * 사진을 붙일 조리 기록. 없으면 null (그러면 오늘 기록을 새로 만든다).
 *
 * 오늘 것만 보지 않는다. **사진은 만든 날 바로 안 올린다** — 저녁에
 * 만들고 다음 날 사진첩에서 고르는 게 보통이다. 그때 어제 기록에 안
 * 붙이고 오늘 기록을 새로 만들면, 하루에 두 번 만든 것으로 남는다.
 *
 * 사진이 이미 붙은 기록은 건너뛴다 — 한 번 만들 때 한 장이라, 거기
 * 덮어쓰면 먼저 올린 사진이 소리 없이 사라진다.
 */
export async function attachTarget(
  recipeId: number,
): Promise<{ id: number; cooked_on: string } | null> {
  const rows = await query<{ id: number; cooked_on: string }>(
    `SELECT id, cooked_on::text AS cooked_on FROM cook_log
      WHERE recipe_id = $1
        AND photo_key IS NULL
        AND cooked_on >= (now() AT TIME ZONE 'Asia/Seoul')::date - $2::int
      ORDER BY cooked_on DESC, id DESC
      LIMIT 1`,
    [recipeId, ATTACH_WITHIN_DAYS],
  );
  return rows[0] ?? null;
}
