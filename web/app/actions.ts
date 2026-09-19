"use server";

/**
 * 사용자가 하는 일은 두 가지다 — 올리고, 만들고 나서 체크한다 (지시서 1장).
 * 여기 있는 게 그 "체크" 다.
 *
 * **여기에 로직을 두지 마라.** 하는 일은 전부 `lib/` 에 있고 이 파일은
 * 폼을 값으로 바꿔 넘기고 화면을 터는 자리다. 네이티브 앱은 서버 액션을
 * 못 쓰고 `app/api/` 를 타는데, 로직이 여기 있으면 저쪽에 한 벌을 더
 * 쓰게 된다 — 그러면 한쪽만 고쳐진다.
 */

/*
 * 화면이 셋이라 (레시피·식단·장보기) 한 곳만 새로 그리면 나머지가
 * 어제 걸 보여준다. 담기 하나가 식단과 장보기를 동시에 바꾸고, 체크
 * 하나가 장보기와 식단의 "다 있어요" 를 같이 바꾼다.
 * `revalidatePath("/", "layout")` 이 루트 레이아웃 아래를 전부 턴다.
 */
import { revalidatePath } from "next/cache";
import * as notes from "@/lib/notes";
import * as recipes from "@/lib/recipes";
import * as shopping from "@/lib/shopping";
import * as weeks from "@/lib/weeks";
import { dayIndex } from "@/lib/say";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 만들었어요.
 *
 * 하는 일은 `recipes.cooked` 에 있다 — 날짜를 안 골랐을 때 한국 기준
 * 오늘로 적는 것도, 캐시를 이력에서 다시 세는 것도 거기다. 여기는 화면이
 * 보낸 폼을 값으로 바꾸고, 끝나면 세 화면을 터는 자리다.
 */
export async function markCooked(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("레시피를 못 찾았어요");

  const raw = String(formData.get("cookedOn") ?? "").trim();
  await recipes.cooked(id, ISO_DATE.test(raw) ? raw : null);

  revalidatePath("/", "layout");
}

/**
 * 레시피를 지운다 — 레시피 줄의 "별로였어요", 닮은 것끼리 화면의 "지울게요".
 *
 * 예전에는 status='BAD' 로 숨기기만 했다. 목록에서 안 보이니 같은 것이고,
 * 안 보이는 행이 쌓이면 나중에 왜 여기 있는지 아무도 모른다. 쓰는 사람이
 * 지우라고 정했다.
 *
 * **되돌릴 수 없어서 화면이 한 번 더 묻는다** (app/RecipeRow.tsx ·
 * app/similar/Groups.tsx). 실제로 지우는 일은 `recipes.remove` 한 군데다 —
 * CASCADE 가 안 걸린 `shopping_list_recipe` 를 먼저 떼는 것까지 거기 있다.
 */
export async function dropRecipe(formData: FormData) {
  await recipes.remove(recipeId(formData));
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

/**
 * 식단에서 뺀다.
 *
 * `date` 를 주면 **그 날짜 하나만**, 안 주면 그 주에서 통째로.
 * 담기 판에서 담긴 날을 다시 누르면 앞쪽이고, "식단에서 빼기" 는 뒤쪽이다.
 */
export async function removeFromWeek(formData: FormData) {
  const id = recipeId(formData);
  const date = String(formData.get("date") ?? "").trim();

  if (!date) {
    await shopping.removeRecipe(id, which(formData));
    revalidatePath("/", "layout");
    return;
  }

  if (!ISO_DATE.test(date)) throw new Error("날짜를 못 알아보겠어요");
  const target = shopping.whichOf(date);
  if (!target) throw new Error("이번 주와 다음 주 중에서 골라주세요");
  await shopping.removeRecipe(id, target, dayIndex(date));
  revalidatePath("/", "layout");
}

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

/**
 * **날짜 하나로 정한다** — 담기와 날짜 정하기를 한 번에.
 *
 * 화면이 날짜로 말하기 시작하면서 (식단은 두 주를 쭉 늘어놓는다) 담을 때도
 * 날짜를 고른다. 주를 먼저 고르고 나서 요일을 고르는 두 단계는, 담는 사람
 * 머릿속에 이미 "이번 주 목요일" 이 있는데도 두 번 묻는 일이었다.
 *
 * 어느 목록으로 갈지는 **날짜가 정한다** (`shopping.whichOf`). 화면이 보낸
 * 주를 믿지 않는다 — 화면이 열려 있는 동안 자정이 지나면 그 값은 틀린다.
 *
 * 날짜를 비우면 "날짜 미정" 이다. 그때는 어느 주인지 알 수 없으니 화면이
 * 보낸 주를 쓴다 (요일을 안 정해도 담을 수 있다는 규칙은 그대로다).
 */
export async function planOnDate(formData: FormData) {
  const id = recipeId(formData);
  const date = String(formData.get("date") ?? "").trim();

  if (!date) {
    await shopping.addRecipe(id, which(formData), null);
    revalidatePath("/", "layout");
    return;
  }

  if (!ISO_DATE.test(date)) throw new Error("날짜를 못 알아보겠어요");
  const target = shopping.whichOf(date);
  if (!target) throw new Error("이번 주와 다음 주 중에서 골라주세요");

  /*
    **더한다 — 옮기지 않는다** (2026-09-19).

    예전에는 `addRecipe` 뒤에 `setDay` 로 요일을 덮어썼다. 한 주에 행이
    하나뿐이었기 때문인데, 그래서 9/17 에 담아둔 걸 9/21 로 바꾸면
    **9/17 이 사라졌다** — 옮긴 게 아니라 잃은 것으로 읽혔다.

    이제 날짜마다 한 행이다. 날짜를 고르면 그 날짜가 더해지고, 담긴
    날짜를 빼는 건 `removeFromWeek` 가 날짜를 받아서 한다 (화면에서는
    담긴 날을 다시 누르는 것이 그 자리다).

    같은 날을 두 번 눌러도 안 늘어난다 — 부분 인덱스가 막는다.
  */
  await shopping.addRecipe(id, target, dayIndex(date));
  revalidatePath("/", "layout");
}

/**
 * **안 먹었어요** — 지난 날짜의 "만들었어요?" 에 아니라고 답한 자리.
 *
 * 그 날짜에서만 떼고 그 주에는 남긴다 (`shopping.unplan`). 예전에는
 * 날짜를 비운 `planOnDate` 가 이 일을 했는데, 날짜마다 한 행이 되면서
 * 그건 **미정 줄을 하나 더 담는 일**이 됐다 — 지난 날짜는 그대로 남고.
 */
export async function skipDate(formData: FormData) {
  const id = recipeId(formData);
  const date = String(formData.get("date") ?? "").trim();
  if (!ISO_DATE.test(date)) throw new Error("날짜를 못 알아보겠어요");

  const target = shopping.whichOf(date);
  if (!target) throw new Error("이번 주와 다음 주 중에서 골라주세요");
  await shopping.unplan(id, target, dayIndex(date));
  revalidatePath("/", "layout");
}

/**
 * 그날의 메모 — "저녁 약속 있어요".
 *
 * 비우면 지운다 (lib/notes.ts). 메모는 추천도 담기도 막지 않는다 —
 * 적어두면 사람이 보고 사람이 정한다.
 */
export async function setDayNote(formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  if (!ISO_DATE.test(date)) throw new Error("날짜를 못 알아보겠어요");
  await notes.setNote(date, String(formData.get("note") ?? ""));
  revalidatePath("/", "layout");
}

/**
 * 장보기에서 체크/해제.
 * 체크하면 구매 기록이 생긴다 — 새 입력을 요구하지 않고 기존 행동에 얹는다.
 */
export async function toggleItem(formData: FormData) {
  const label = String(formData.get("label") || "");
  if (!label) return;
  await shopping.toggle(
    label,
    formData.get("checked") === "1",
    which(formData),
  );
  revalidatePath("/", "layout");
}

/**
 * 장보기 끝 — 그 주 장을 다 봤다는 표시. **주를 옮기지 않는다.**
 * 어느 주인지는 날짜가 정한다 (lib/shopping.ts weekStart).
 */
export async function finishShopping(formData: FormData) {
  await shopping.finish(which(formData));
  revalidatePath("/", "layout");
}

/** Mark an ingredient as excluded for this shopping list only. */
export async function excludeItem(formData: FormData) {
  const label = String(formData.get("label") || "");
  if (!label || label.length > 500) return;
  await shopping.setExclusion(
    label,
    formData.get("excluded") === "1",
    which(formData),
  );
  revalidatePath("/", "layout");
}
