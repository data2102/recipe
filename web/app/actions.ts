"use server";

/**
 * 사용자가 하는 일은 두 가지다 — 올리고, 만들고 나서 체크한다 (지시서 1장).
 * 여기 있는 게 그 "체크" 다.
 *
 * `recipe.cook_count` · `recipe.last_cooked_on` 은 `cook_log` 의 캐시다.
 * 이력이 원본이고 캐시는 따라간다 — 그래서 한 트랜잭션 안에서 같이 고친다.
 */

import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import * as shopping from "@/lib/shopping";
import * as week from "@/lib/week";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 만들었어요.
 *
 * 날짜를 고를 수 있어야 한다 — 그날 체크를 못 하고 다음날 하는 경우가 흔하고,
 * 초기 데이터를 채울 때도 "두 달 전쯤" 이 필요하다 (지시서 3장).
 * 정확할 필요는 없다. 순서만 맞으면 정렬은 작동한다.
 *
 * WISH 였으면 GOOD 으로 올린다. 만들어봤다는 건 탭 2 로 간다는 뜻이다.
 * "별로였어요" 를 안 눌렀으니 괜찮았던 걸로 본다 — 별점을 묻지 않는 이유다.
 */
export async function markCooked(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  const raw = String(formData.get("cookedOn") ?? "").trim();
  const cookedOn = ISO_DATE.test(raw) ? raw : null; // 없으면 DB 기본값 = 오늘

  await tx(async (q) => {
    await q(
      `INSERT INTO cook_log (recipe_id, cooked_on)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE))`,
      [id, cookedOn],
    );
    // 캐시는 이력에서 다시 센다. +1 로 더하면 어긋난 뒤 되돌릴 수 없다.
    await q(
      `UPDATE recipe r
          SET cook_count     = c.n,
              last_cooked_on = c.latest,
              status         = CASE WHEN r.status = 'WISH' THEN 'GOOD'
                                    ELSE r.status END
         FROM (SELECT COUNT(*) AS n, MAX(cooked_on) AS latest
                 FROM cook_log WHERE recipe_id = $1) c
        WHERE r.id = $1`,
      [id],
    );
  });

  revalidatePath("/");
}

/**
 * 별로였어요 — 숨긴다. 지우지는 않는다.
 *
 * 만든 이력이 있으면 마지막 이력에 NEVER 를 남긴다. 별점이 아니라
 * "또 만들래요?" 예/아니오다 (지시서 6장).
 */
export async function markBad(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  await tx(async (q) => {
    await q(`UPDATE recipe SET status = 'BAD' WHERE id = $1`, [id]);
    await q(
      `UPDATE cook_log SET verdict = 'NEVER'
        WHERE id = (SELECT id FROM cook_log
                     WHERE recipe_id = $1
                     ORDER BY cooked_on DESC, id DESC LIMIT 1)`,
      [id],
    );
  });

  revalidatePath("/");
}


/* ---------------------------------------------------------------- */
/*  이번 주 담기 · 장보기 (작업 순서 6번)                              */
/* ---------------------------------------------------------------- */

function recipeId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");
  return id;
}

/** 이번 주에 담는다. 열려 있는 목록이 없으면 새로 연다. */
export async function addToWeek(formData: FormData) {
  await shopping.addRecipe(recipeId(formData));
  revalidatePath("/");
}

export async function removeFromWeek(formData: FormData) {
  await shopping.removeRecipe(recipeId(formData));
  revalidatePath("/");
}

/**
 * 무슨 요일에 먹을지 정한다. 빈 값이면 "미정" 으로 되돌린다.
 *
 * 담기와는 별개다 — 담아만 두고 요일은 안 정해도 된다 (lib/week.ts).
 */
export async function setDayOfWeek(formData: FormData) {
  const raw = String(formData.get("day") ?? "").trim();
  const day = raw === "" ? null : Number(raw);
  await week.setDay(recipeId(formData), day);
  revalidatePath("/");
}

/**
 * 담으면서 요일까지 한 번에 (추천 목록에서 요일로 끌어다 놓기).
 *
 * 담기와 요일 정하기는 여전히 별개의 일이지만, 이미 "수요일에 이거"
 * 라고 마음먹은 사람에게 두 번 시킬 이유는 없다. 요일을 "미정" 으로
 * 놓으면 예전 담기와 똑같다.
 */
export async function addToWeekOn(formData: FormData) {
  const id = recipeId(formData);
  const raw = String(formData.get("day") ?? "").trim();
  const day = raw === "" ? null : Number(raw);

  await shopping.addRecipe(id);
  if (day !== null) await week.setDay(id, day);
  revalidatePath("/");
}

/**
 * 장보기에서 체크/해제.
 * 체크하면 구매 기록이 생긴다 — 새 입력을 요구하지 않고 기존 행동에 얹는다.
 */
export async function toggleItem(formData: FormData) {
  const label = String(formData.get("label") || "");
  if (!label) return;
  await shopping.toggle(label, formData.get("checked") === "1");
  revalidatePath("/");
}

/** 장보기 끝. 다음에 담으면 새 목록이 열린다. */
export async function finishShopping() {
  await shopping.finish();
  revalidatePath("/");
}
