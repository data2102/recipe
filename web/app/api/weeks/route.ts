/**
 * GET /api/weeks — 지난 주들
 *
 * 목록 하나가 지난 한 주다. **끝낸 장보기를 지우지 않는 이유**가 이
 * 화면이다 — 담았던 요리도 요일도 그대로 남아 있어서, 지난 달에 뭘
 * 먹었는지 여기서 읽는다.
 *
 * 주마다 따로 묻지 않는다. `dishesOf` 가 담긴 요리를 한 번에 가져오고
 * 메모도 제일 오래된 주부터 제일 최근 주 끝까지 한 번에 받는다 —
 * 웹 화면과 같은 방식이다 (app/weeks/page.tsx).
 */

import { NextResponse } from "next/server";
import { allow } from "@/lib/api/guard";
import { dishesOf, past } from "@/lib/weeks";
import { notes } from "@/lib/notes";
import { addDays } from "@/lib/say";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  try {
    const list = await past();
    if (list.length === 0) {
      return NextResponse.json({ weeks: [], dishes: [], notes: {} });
    }

    const oldest = list[list.length - 1].opened_on;
    const newest = addDays(list[0].opened_on, 6);
    const [dishes, note] = await Promise.all([
      dishesOf(list.map((w) => w.id)),
      notes(oldest, newest),
    ]);

    return NextResponse.json({
      weeks: list,
      /** `list_id` 로 주마다 나눈다. 날짜는 그 주 월요일 + 요일 */
      dishes,
      notes: note,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "지난 주를 못 읽었어요" },
      { status: 500 },
    );
  }
}
