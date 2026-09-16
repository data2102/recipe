/**
 * POST /api/shopping/have — 집에 있어요 / 역시 살게요
 *
 * `{ label, excluded, week? }`
 *
 * **체크(사기)와 다른 일이다.** 체크는 구매 기록을 만들고, 이건 이번
 * 목록에서 빼기만 한다 (`shopping_list.excluded`). 집에 있다는 건 오늘
 * 샀다는 뜻이 아니다 — 없는 날짜를 지어내면 다음 주에 "3일 전에 샀어요"
 * 라는 거짓말이 나온다.
 *
 * **상시 재고가 아니다.** 이 목록과 같이 만료된다. 갱신 안 하는 재고를
 * 만들면 어긋나고, 어긋나는 순간 쓸모가 없어진다 (CLAUDE.md).
 *
 * 답을 쓰는 자리는 장보기 하나다. 식단은 이 값을 **읽기만** 한다
 * (`GET /api/plan` 의 `excluded`) — 쓰는 자리가 둘이면 어긋난다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body } from "@/lib/api/guard";
import { setExclusion, type Which } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) return bad("어느 재료인지 알려주세요");
  if (typeof input.excluded !== "boolean") {
    return bad("집에 있는지 알려주세요 (excluded)");
  }
  const week: Which = input.week === "next" ? "next" : "this";

  try {
    await setExclusion(label, input.excluded, week);
    return NextResponse.json({ label, excluded: input.excluded, week });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 못 했어요" },
      { status: 500 },
    );
  }
}
