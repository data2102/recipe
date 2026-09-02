"use server";

/**
 * 만든 요리 사진 붙이기 · 떼기
 *
 * 사진은 **조리 기록에 붙는다** (lib/photos.ts). 그래서 사진을 올리면
 * 오늘 만든 기록이 없을 때 하나 만든다 — 사진을 찍었다는 건 만들었다는
 * 뜻이고, 기록 없이 사진만 남기면 언제 만든 건지 모르는 사진이 된다.
 *
 * **이건 자동 기록이 아니다.** 지난 요일을 보고 알아서 체크하는 것과
 * 다르다 (그건 안 한다) — 사람이 사진을 고르는 행동이 앞에 있다.
 * 화면의 버튼 글자가 그렇게 될 거라고 미리 말해준다.
 */

import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { MEDIA_TYPES } from "@/lib/parse/claude";
import { MAX_BYTES, keepOriginal } from "@/lib/parse/originals";

export async function addPhoto(formData: FormData): Promise<void> {
  const recipeId = Number(formData.get("recipeId"));
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    throw new Error("레시피를 못 찾았어요");
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("사진을 골라주세요");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`사진이 너무 커요 (${Math.round(file.size / 1e6)}MB)`);
  }
  const mediaType = MEDIA_TYPES[file.type];
  if (!mediaType) throw new Error("PNG · JPG · WEBP 만 올릴 수 있어요");

  // 원본을 먼저 보관한다 (원칙 ⑤). DB 가 실패해도 사진은 남는다.
  const bytes = Buffer.from(await file.arrayBuffer());
  const storageKey = await keepOriginal(bytes, mediaType);

  await tx(async (q) => {
    /*
      오늘 만든 기록이 있으면 거기 붙인다. 없으면 만든다 —
      "만들었어요" 를 누른 것과 같은 일이 일어난다 (app/actions.ts).
    */
    const today = await q<{ id: number }>(
      `SELECT id FROM cook_log
        WHERE recipe_id = $1
          AND cooked_on = (now() AT TIME ZONE 'Asia/Seoul')::date
        ORDER BY id DESC LIMIT 1`,
      [recipeId],
    );

    if (today.length > 0) {
      await q(`UPDATE cook_log SET photo_key = $2 WHERE id = $1`, [
        today[0].id,
        storageKey,
      ]);
      return;
    }

    await q(
      `INSERT INTO cook_log (recipe_id, cooked_on, photo_key)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, $2)`,
      [recipeId, storageKey],
    );
    // 캐시는 이력에서 다시 센다 (app/actions.ts 의 markCooked 와 같은 규칙)
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

  revalidatePath("/", "layout");
}

/**
 * 사진만 뗀다. **조리 기록은 지우지 않는다** — 사진이 잘못 나왔다고
 * 그날 만든 사실이 없어지는 건 아니다.
 *
 * 보관함의 파일도 지우지 않는다. 내용 해시로 이름을 지어서 다른 데서
 * 같은 파일을 가리킬 수 있고, 원본은 안 버리는 게 이 앱의 규칙이다.
 */
export async function removePhoto(formData: FormData): Promise<void> {
  const cookId = Number(formData.get("cookId"));
  if (!Number.isInteger(cookId) || cookId <= 0) {
    throw new Error("사진을 못 찾았어요");
  }
  await tx(async (q) => {
    await q(`UPDATE cook_log SET photo_key = NULL WHERE id = $1`, [cookId]);
  });
  revalidatePath("/", "layout");
}
