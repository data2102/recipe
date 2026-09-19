/**
 * POST /api/plan/remove — 식단에서 뺀다
 *
 * `{ recipeId, week?, date? }`
 *
 * `date` 를 주면 **그 날짜 하나만** 뺀다 (한 주에 여러 날짜에 담을 수
 * 있게 되면서 생긴 길 — 2026-09-19). 안 주면 그 주에서 통째로.
 *
 * **레시피를 지우는 게 아니다.** 그 주 목록에서만 뗀다 — 레시피는 그대로
 * 남고 다음 주에 다시 담을 수 있다. 지우는 건 `DELETE /api/recipes/:id`
 * 하나뿐이고, 그건 되돌릴 수 없어서 화면이 한 번 더 묻는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { removeRecipe, whichOf, type Which } from "@/lib/shopping";
import { dayIndex } from "@/lib/say";

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
    if (date) {
      if (!ISO_DATE.test(date)) return bad("날짜를 못 알아보겠어요");
      // 주는 날짜가 정한다 — 앱이 보낸 값을 안 믿는다 (date 경로와 같다)
      const on = whichOf(date);
      if (!on) return bad("이번 주와 다음 주 중에서 골라주세요");
      await removeRecipe(id, on, dayIndex(date));
      return NextResponse.json({ recipeId: id, week: on, date });
    }

    const week: Which = input.week === "next" ? "next" : "this";
    await removeRecipe(id, week);
    return NextResponse.json({ recipeId: id, week, planned: false });
  } catch (e) {
    return oops(e, "빼지 못했어요");
  }
}
