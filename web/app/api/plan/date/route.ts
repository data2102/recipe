/**
 * POST /api/plan/date — 그 날짜에 **더한다**
 *
 * 서버 액션 `planOnDate` 와 **같은 규칙**을 따른다 (app/actions.ts):
 *   - 어느 주인지는 **날짜가 정한다.** 앱이 보낸 주를 안 믿는다 —
 *     앱이 켜져 있는 동안 자정이 지나면 그 값은 틀린다
 *   - 날짜를 비우면 "날짜 미정". 그때만 어느 주인지 물어본다
 *   - **옮기는 게 아니라 더한다** (2026-09-19). 한 주에 같은 요리를
 *     여러 날짜에 담을 수 있다. 빼는 건 `/api/plan/remove` 가 날짜를
 *     받아서 한다
 *
 * 액션을 그대로 부르지 않고 같은 조각을 다시 엮는다 — `revalidatePath` 는
 * 웹 화면의 일이라 여기서는 할 일이 없다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { dayIndex } from "@/lib/say";
import { addRecipe, whichOf } from "@/lib/shopping";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const id = Number(input.recipeId);
  if (!Number.isInteger(id) || id <= 0) return bad("레시피를 못 찾겠어요");

  const date = typeof input.date === "string" ? input.date.trim() : "";

  try {
    // 날짜 미정 — 어느 주에 담을지는 앱이 말해줘야 안다
    if (!date) {
      const week = input.week === "next" ? "next" : "this";
      await addRecipe(id, week, null);
      return NextResponse.json({ recipeId: id, date: null, week });
    }

    if (!ISO_DATE.test(date)) return bad("날짜를 못 알아보겠어요");
    const week = whichOf(date);
    if (!week) return bad("이번 주와 다음 주 중에서 골라주세요");

    await addRecipe(id, week, dayIndex(date));

    return NextResponse.json({ recipeId: id, date, week });
  } catch (e) {
    /*
      없는 레시피 id 가 오면 외래키에서 걸린다. 그건 **우리 잘못이 아니라
      요청이 틀린 것**이라 400 이고, 무엇보다 `shopping_list_recipe_recipe_id_fkey`
      같은 제약 이름을 밖으로 흘리지 않는다 — 앱에 쓸모도 없고 스키마만 샌다.
    */
    const why = e instanceof Error ? e.message : "";
    if (/foreign key|violates/i.test(why)) return bad("레시피를 못 찾겠어요");
    return oops(e, "담지 못했어요");
  }
}
