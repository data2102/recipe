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

import { query, tx } from "./db";

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

/**
 * 사진을 붙인다 — **조리 기록에**.
 *
 * 하는 일이 서버 액션 안에 있었다 (`app/recipe/[id]/actions.ts`).
 * 앱은 서버 액션을 못 쓰고 `app/api/` 를 타는데, 로직이 액션 안에 있으면
 * 저쪽에 한 벌을 더 쓰게 된다 (CLAUDE.md) — 그러면 "사진을 올리면 만든
 * 기록이 생긴다" 는 규칙이 두 군데가 되고 한쪽만 고쳐진다.
 *
 * 최근에 만든 기록이 있으면 거기 붙이고, 없으면 **오늘 만든 기록을
 * 만든다.** 사진첩에서 고르는 경우가 많아서 오늘 것만 보면 안 된다 —
 * 어제 만들고 오늘 올리면 하루에 두 번 만든 것으로 남는다.
 *
 * **이건 자동 기록이 아니다.** 지난 요일을 보고 알아서 체크하는 것과
 * 다르다 — 사람이 사진을 고르는 행동이 앞에 있고, 버튼 글자가 그렇게
 * 될 거라고 미리 말한다.
 *
 * 원본은 부르는 쪽이 먼저 보관하고 그 키를 넘긴다 (원칙 ⑤).
 */
export async function attach(recipeId: number, storageKey: string): Promise<void> {
  await tx(async (q) => {
    const recent = await q<{ id: number }>(
      `SELECT id FROM cook_log
        WHERE recipe_id = $1
          AND photo_key IS NULL
          AND cooked_on >= (now() AT TIME ZONE 'Asia/Seoul')::date - $2::int
        ORDER BY cooked_on DESC, id DESC
        LIMIT 1`,
      [recipeId, ATTACH_WITHIN_DAYS],
    );

    if (recent.length > 0) {
      await q(`UPDATE cook_log SET photo_key = $2 WHERE id = $1`, [
        recent[0].id,
        storageKey,
      ]);
      return;
    }

    await q(
      `INSERT INTO cook_log (recipe_id, cooked_on, photo_key)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, $2)`,
      [recipeId, storageKey],
    );
    // 캐시는 이력에서 다시 센다 (lib/recipes.ts cooked 와 같은 규칙)
    await q(
      `UPDATE recipe r
          SET cook_count     = c.n,
              last_cooked_on = c.latest,
              status         = CASE WHEN r.status = 'WISH' THEN 'GOOD'
                                    ELSE r.status END
         FROM (SELECT COUNT(*) AS n, MAX(cooked_on) AS latest
                 FROM cook_log WHERE recipe_id = $1) c
        WHERE r.id = $1`,
      [recipeId],
    );
  });
}

/**
 * 사진만 뗀다. **조리 기록은 지우지 않는다** — 사진이 잘못 나왔다고
 * 그날 만든 사실이 없어지는 건 아니다.
 *
 * 보관함의 파일도 지우지 않는다. 내용 해시로 이름을 지어서 다른 데서
 * 같은 파일을 가리킬 수 있고, 원본은 안 버리는 게 이 앱의 규칙이다.
 */
export async function detach(cookId: number): Promise<void> {
  await query(`UPDATE cook_log SET photo_key = NULL WHERE id = $1`, [cookId]);
}
