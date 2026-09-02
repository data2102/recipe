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
import { redirect } from "next/navigation";
import { tx } from "@/lib/db";
import { MEDIA_TYPES } from "@/lib/parse/claude";
import { loadDictionary, normalize } from "@/lib/parse/normalize";
import { MAX_BYTES, keepOriginal } from "@/lib/parse/originals";
import { ATTACH_WITHIN_DAYS } from "@/lib/photos";

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
      최근에 만든 기록이 있으면 거기 붙인다 (lib/photos.ts attachTarget).
      사진첩에서 고르는 경우가 많아서 오늘 것만 보면 안 된다 — 어제
      만들고 오늘 올리면 하루에 두 번 만든 것으로 남는다.

      없으면 만든다 — "만들었어요" 를 누른 것과 같은 일이 일어난다
      (app/actions.ts). 화면의 버튼 글자가 그렇게 될 거라고 미리 말한다.
    */
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


/* ---------------------------------------------------------------- */
/*  레시피 고치기                                                     */
/* ---------------------------------------------------------------- */

/**
 * 저장해둔 레시피를 고친다.
 *
 * **사전 대조를 여기서 다시 한다** (저장할 때와 같은 규칙 — add/actions.ts
 * 의 commit 과 같다). 이름을 고쳤으면 붙는 재료가 달라지고, 그러면 장보기
 * 합산도 달라져야 한다. 화면이 보낸 ingredient_id 를 믿지 않는다.
 *
 * 재료 행은 **통째로 갈아끼운다.** 장보기 항목은 이름(label)으로 물려받고
 * 식단은 볼 때마다 다시 읽으니, 행 id 를 붙들고 있는 데가 없다.
 *
 * 조리 기록·사진·원본은 건드리지 않는다. 고친 건 레시피 내용뿐이다.
 */
export async function saveEdits(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  const title = String(formData.get("title") ?? "").trim() || "제목 없음";

  // 화면이 줄 단위로 보낸다. 빈 줄은 버린다 — 지운 재료가 그렇게 온다.
  const names = formData.getAll("name").map((v) => String(v).trim());
  const qtys = formData.getAll("qty").map((v) => String(v).trim());
  const sections = formData.getAll("section").map((v) => String(v));
  const origins = formData.getAll("origin").map((v) => String(v));
  const groups = formData.getAll("group").map((v) => String(v));
  const keep = new Set(formData.getAll("keep").map((v) => Number(v)));

  const rows = names
    .map((raw_name, i) => ({
      raw_name,
      raw_qty: qtys[i] || null,
      section: sections[i] || null,
      // 새로 넣은 줄은 사람이 넣은 것이다 (조리 단계에서 온 게 아니다)
      origin: (origins[i] || "USER") as "LIST" | "BODY" | "USER",
      evidence: null,
      choice_group: groups[i] || null,
      confirmed: keep.has(i),
    }))
    .filter((r) => r.raw_name.length > 0);

  if (rows.length === 0) throw new Error("재료가 하나도 없어요");

  const steps = String(formData.get("steps") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const table = await loadDictionary();
  const normalized = normalize(
    rows.map((r) => ({
      raw_name: r.raw_name,
      raw_qty: r.raw_qty,
      section: r.section,
      origin: r.origin,
      evidence: r.evidence,
    })),
    // 택1 그룹은 화면에서 못 바꾼다. 원래 값을 그대로 들고 온다.
    [],
    table,
  );

  await tx(async (q) => {
    await q(`UPDATE recipe SET title = $2 WHERE id = $1`, [id, title]);

    await q(`DELETE FROM recipe_ingredient WHERE recipe_id = $1`, [id]);
    await q(
      `INSERT INTO recipe_ingredient
         (recipe_id, raw_name, raw_qty, section, ingredient_id,
          origin, evidence, confirmed, choice_group)
       SELECT $1, t.raw_name, t.raw_qty, t.section, t.ingredient_id,
              t.origin, NULL, t.confirmed, t.choice_group
         FROM unnest($2::text[], $3::text[], $4::text[], $5::bigint[],
                     $6::text[], $7::boolean[], $8::text[])
              WITH ORDINALITY
              AS t(raw_name, raw_qty, section, ingredient_id,
                   origin, confirmed, choice_group, ord)
        ORDER BY t.ord`,
      [
        id,
        normalized.map((r) => r.raw_name),
        normalized.map((r) => r.raw_qty),
        normalized.map((r) => r.section),
        normalized.map((r) => r.ingredient_id),
        normalized.map((r) => r.origin),
        rows.map((r) => r.confirmed),
        rows.map((r) => r.choice_group),
      ],
    );

    /*
      사전에 없는 표기는 여기서도 쌓는다. 고치다가 새로 들어온 표기가
      있으면 그것도 사전을 키우는 재료다 (스펙 7장 미분류 처리).
    */
    const unmapped = normalized
      .filter((r) => r.recordUnmapped)
      .map((r) => r.raw_name);
    if (unmapped.length > 0) {
      await q(
        `INSERT INTO unmapped_term (raw_name, hit_count)
         SELECT t.name, COUNT(*)
           FROM unnest($1::text[]) AS t(name)
          GROUP BY t.name
         ON CONFLICT (raw_name)
         DO UPDATE SET hit_count = unmapped_term.hit_count + EXCLUDED.hit_count`,
        [unmapped],
      );
    }

    await q(`DELETE FROM recipe_step WHERE recipe_id = $1`, [id]);
    if (steps.length > 0) {
      await q(
        `INSERT INTO recipe_step (recipe_id, seq, body)
         SELECT $1, t.ord, t.body
           FROM unnest($2::text[]) WITH ORDINALITY AS t(body, ord)`,
        [id, steps],
      );
    }
  });

  revalidatePath("/", "layout");
  redirect(`/recipe/${id}`);
}
