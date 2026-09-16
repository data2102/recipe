/**
 * POST /api/shopping/finish — 장보기 끝 / 다시 열게요
 *
 * `{ week?: "this" | "next", done?: boolean }`
 *
 * **주를 옮기지 않는다.** 그 주 장을 다 봤다는 표시일 뿐이고, 이걸 안
 * 눌러도 월요일이 오면 이번 주가 바뀐다 (`shopping.weekStart`). 예전에는
 * 여기가 주를 넘기는 유일한 자리라 안 누르면 지난 주가 계속 이번 주로
 * 남았다 — 9월 8일에 8/31~9/6 이 이번 주로 보였다.
 *
 * `done: false` 는 되돌리기다. 잘못 누르면 그 주가 통째로 닫히니
 * 되돌릴 길이 있어야 한다. 담았던 요리도 요일도 그대로 두고 상태만 바꾼다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body } from "@/lib/api/guard";
import { finish, openList, type Which } from "@/lib/shopping";
import { reopen, week as weekOf } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const week: Which = input.week === "next" ? "next" : "this";
  const done = input.done !== false;

  try {
    /*
      어느 목록인지는 **서버가 찾는다.** 앱이 보낸 목록 id 를 받으면 남의
      주를 열 수 있고, 무엇보다 앱이 열려 있는 동안 자정이 지나면 그 id 는
      이번 주가 아니다. `openList(false, …)` 는 `starts_on` 으로 찾으니
      이미 끝낸 목록도 그 주 것이면 그대로 나온다.

      담은 게 없어 목록 자체가 없으면 만들지 않는다 — 끝낼 장이 없다.
    */
    const listId = await openList(false, week);
    if (listId) {
      if (done) await finish(week);
      else await reopen(listId);
    }

    const seen = await weekOf(listId);
    return NextResponse.json({ week, closed: seen?.closed_on ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 못 했어요" },
      { status: 500 },
    );
  }
}
