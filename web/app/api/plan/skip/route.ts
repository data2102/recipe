/**
 * POST /api/plan/skip — **안 먹었어요**
 *
 * `{ recipeId, date }`
 *
 * 지난 날짜의 "만들었어요?" 에 아니라고 답한 자리다. 그 **날짜에서만**
 * 떼고 그 주에는 남긴다 (`shopping.unplan`) — 못 먹었을 뿐이지 이번 주에서
 * 빼는 게 아니다. 장보기에도 계속 들어간다.
 *
 * `/api/plan/remove` 와 다르다: 저쪽은 그 주에서 **없애는** 문이다.
 *
 * 날짜마다 한 행이 되기 전에는 날짜를 비운 `/api/plan/date` 가 이 일을
 * 했다 (행이 하나뿐이라 컬럼만 비우면 됐다). 이제 그건 **미정 줄을 하나
 * 더 담는 일**이라 지난 날짜가 그대로 남는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { dayIndex } from "@/lib/say";
import { unplan, whichOf } from "@/lib/shopping";

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
  if (!ISO_DATE.test(date)) return bad("날짜를 못 알아보겠어요");

  // 주는 날짜가 정한다 — 앱이 보낸 값을 안 믿는다 (date·remove 와 같다)
  const week = whichOf(date);
  if (!week) return bad("이번 주와 다음 주 중에서 골라주세요");

  try {
    await unplan(id, week, dayIndex(date));
    return NextResponse.json({ recipeId: id, date, week });
  } catch (e) {
    return oops(e, "되돌리지 못했어요");
  }
}
