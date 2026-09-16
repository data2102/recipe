/**
 * POST /api/cooked — 만들었어요
 *
 * `{ recipeId, date? }` — 날짜를 비우면 **한국 기준 오늘**이다.
 *
 * 하는 일은 `recipes.cooked` 에 있다 (화면도 같은 걸 부른다). 날짜를
 * 고를 수 있는 이유, 캐시를 이력에서 다시 세는 이유도 거기 적혀 있다.
 *
 * **지난 날을 자동으로 기록하지 마라.** 담아둔 날이 지났는데 조리 기록이
 * 없으면 식단에서 *물어본다* — 약속이 생겨 건너뛴 날이 흔한데 자동으로
 * 체크하면 안 만든 게 만든 것으로 남고, `last_cooked_on` 하나가 30일
 * 추천과 정렬을 통째로 틀어놓는다. 이 경로는 사람이 누른 결과만 받는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { cooked } from "@/lib/recipes";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const id = Number(input.recipeId);
  if (!Number.isInteger(id) || id <= 0) return bad("레시피를 못 찾겠어요");

  const raw = typeof input.date === "string" ? input.date.trim() : "";
  if (raw && !ISO_DATE.test(raw)) return bad("날짜를 못 알아보겠어요");

  try {
    await cooked(id, raw || null);
    return NextResponse.json({ recipeId: id, date: raw || null });
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (/foreign key|violates/i.test(why)) return bad("레시피를 못 찾겠어요");
    return oops(e, "기록하지 못했어요");
  }
}
