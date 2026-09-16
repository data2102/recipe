/**
 * POST /api/plan/remove — 식단에서 뺀다
 *
 * `{ recipeId, week? }`
 *
 * **레시피를 지우는 게 아니다.** 그 주 목록에서만 뗀다 — 레시피는 그대로
 * 남고 다음 주에 다시 담을 수 있다. 지우는 건 `DELETE /api/recipes/:id`
 * 하나뿐이고, 그건 되돌릴 수 없어서 화면이 한 번 더 묻는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { removeRecipe, type Which } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const id = Number(input.recipeId);
  if (!Number.isInteger(id) || id <= 0) return bad("레시피를 못 찾겠어요");
  const week: Which = input.week === "next" ? "next" : "this";

  try {
    await removeRecipe(id, week);
    return NextResponse.json({ recipeId: id, week, planned: false });
  } catch (e) {
    return oops(e, "빼지 못했어요");
  }
}
