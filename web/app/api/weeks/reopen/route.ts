/**
 * POST /api/weeks/reopen — 끝낸 주를 다시 연다
 *
 * `{ listId }`
 *
 * `POST /api/shopping/finish` 와 **다른 문이다.** 저쪽은 이번 주·다음 주만
 * 다루고 목록을 서버가 날짜로 찾는다 (앱이 보낸 주는 자정이 지나면 틀린다).
 * 여기는 **지난 주 화면**이 쓰는 자리라 어느 주인지를 목록 id 로 말한다 —
 * 지난 열두 주 중 아무 주나 고를 수 있어야 하고, 그건 날짜로 못 좁힌다.
 *
 * 되돌려도 "이번 주" 가 흔들리지 않는다. 주는 날짜가 정하니까
 * (`shopping.weekStart`) 상태 한 줄만 바뀐다 — 예전에는 끝내면서 다음 주가
 * 이번 주로 승격돼서 최근 것 하나만 되돌릴 수 있었다.
 *
 * 담았던 요리도 요일도 그대로 둔다. **끝낸 장보기를 지우지 않는 이유**가
 * 그거다 — 목록 하나가 지난 한 주다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { reopen, week as weekOf } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const listId = Number(input.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return bad("어느 주인지 알려주세요");
  }

  try {
    await reopen(listId);
    const seen = await weekOf(listId);
    if (!seen) return bad("없는 주예요");
    return NextResponse.json({ listId, closed: seen.closed_on ?? null });
  } catch (e) {
    return oops(e, "다시 열지 못했어요");
  }
}
