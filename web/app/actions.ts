"use server";

/**
 * 사용자가 하는 일은 두 가지다 — 올리고, 만들고 나서 체크한다 (지시서 1장).
 * 여기 있는 게 그 "체크" 다.
 *
 * `recipe.cook_count` · `recipe.last_cooked_on` 은 `cook_log` 의 캐시다.
 * 이력이 원본이고 캐시는 따라간다 — 그래서 한 트랜잭션 안에서 같이 고친다.
 */

/*
 * 화면이 셋이라 (레시피·식단·장보기) 한 곳만 새로 그리면 나머지가
 * 어제 걸 보여준다. 담기 하나가 식단과 장보기를 동시에 바꾸고, 체크
 * 하나가 장보기와 식단의 "다 있어요" 를 같이 바꾼다.
 * `revalidatePath("/", "layout")` 이 루트 레이아웃 아래를 전부 턴다.
 */
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import * as shopping from "@/lib/shopping";
import * as week from "@/lib/week";
import * as weeks from "@/lib/weeks";

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
      // 날짜를 안 골랐으면 오늘이다 — **한국 기준** 오늘 (lib/say.ts TZ).
      // CURRENT_DATE 는 서버 시계(UTC)라 한국 새벽에 어제로 적힌다.
      `INSERT INTO cook_log (recipe_id, cooked_on)
       VALUES ($1, COALESCE($2::date, (now() AT TIME ZONE 'Asia/Seoul')::date))`,
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

  revalidatePath("/", "layout");
}

/**
 * 별로였어요 — **지운다.**
 *
 * 예전에는 status='BAD' 로 숨기기만 했다. 목록에서 안 보이니 같은 것이고,
 * 안 보이는 행이 쌓이면 나중에 왜 여기 있는지 아무도 모른다. 쓰는 사람이
 * 지우라고 정했다.
 *
 * 되돌릴 수 없어서 화면이 한 번 더 묻는다 (app/RecipeRow.tsx).
 *
 * 재료·만드는 법·조리 기록·보관해둔 원본은 CASCADE 로 같이 지워진다
 * (db/schema.sql). **담긴 주(shopping_list_recipe)만 CASCADE 가 없다** —
 * 지난 주 기록이 요리가 지워졌다고 사라지면 안 되니까 일부러 그렇게 뒀다.
 * 그래서 여기서 손으로 먼저 뗀다. 안 그러면 외래키에 막혀 삭제가 실패한다.
 *
 * 보관함(Storage)의 사진과 캡처 파일은 남는다 — 사진 지우기도 지금
 * 그렇게 동작한다 (app/recipe/[id]/actions.ts removePhoto).
 */
export async function markBad(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  await tx(async (q) => {
    await q(`DELETE FROM shopping_list_recipe WHERE recipe_id = $1`, [id]);
    await q(`DELETE FROM recipe WHERE id = $1`, [id]);
  });

  revalidatePath("/", "layout");
}


/* ---------------------------------------------------------------- */
/*  이번 주 담기 · 장보기 (작업 순서 6번)                              */
/* ---------------------------------------------------------------- */

function recipeId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");
  return id;
}

/**
 * 어느 주에 담는가. 화면이 보고 있는 주를 그대로 보낸다 (app/page.tsx).
 * 안 보내면 이번 주다 — 예전 화면에서 온 요청도 그대로 돌아간다.
 */
function which(formData: FormData): "this" | "next" {
  return formData.get("week") === "next" ? "next" : "this";
}

/** 이번 주에 담는다. 열려 있는 목록이 없으면 새로 연다. */
export async function addToWeek(formData: FormData) {
  await shopping.addRecipe(recipeId(formData), which(formData));
  revalidatePath("/", "layout");
}

export async function removeFromWeek(formData: FormData) {
  await shopping.removeRecipe(recipeId(formData), which(formData));
  revalidatePath("/", "layout");
}

/**
 * 무슨 요일에 먹을지 정한다. 빈 값이면 "미정" 으로 되돌린다.
 *
 * 담기와는 별개다 — 담아만 두고 요일은 안 정해도 된다 (lib/week.ts).
 */
/**
 * 끝낸 장보기를 다시 연다.
 *
 * "장보기 끝" 은 한 번 누르면 이번 주가 통째로 사라지는 일인데 되돌릴
 * 길이 없었다. 잘못 누른 사람은 담은 것도 요일도 전부 다시 해야 했다.
 * 끝낸 목록을 지우지 않고 두니까 되살리는 건 상태 한 줄이면 된다.
 */
export async function reopenWeek(formData: FormData) {
  const id = Number(formData.get("listId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("목록을 못 찾았어요");
  await weeks.reopen(id);
  revalidatePath("/", "layout");
}

export async function setDayOfWeek(formData: FormData) {
  const raw = String(formData.get("day") ?? "").trim();
  const day = raw === "" ? null : Number(raw);
  await week.setDay(recipeId(formData), day, which(formData));
  revalidatePath("/", "layout");
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

  const w = which(formData);
  await shopping.addRecipe(id, w);
  if (day !== null) await week.setDay(id, day, w);
  revalidatePath("/", "layout");
}

/**
 * 장보기에서 체크/해제.
 * 체크하면 구매 기록이 생긴다 — 새 입력을 요구하지 않고 기존 행동에 얹는다.
 */
export async function toggleItem(formData: FormData) {
  const label = String(formData.get("label") || "");
  if (!label) return;
  await shopping.toggle(label, formData.get("checked") === "1", which(formData));
  revalidatePath("/", "layout");
}

/** 장보기 끝. 다음에 담으면 새 목록이 열린다. */
export async function finishShopping() {
  await shopping.finish();
  revalidatePath("/", "layout");
}
