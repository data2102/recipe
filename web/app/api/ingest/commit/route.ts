/**
 * POST /api/ingest/commit — 확인 화면이 손본 초안을 저장한다
 *
 * 몸통은 `POST /api/ingest` 가 돌려준 `draft` 그대로다 (사용자가 고친 뒤).
 *
 * **사전 대조를 여기서 다시 한다** — 그건 `lib/parse/ingest.ts` 의
 * `commit` 안에 있다. 앱이 보낸 이름이 바뀌었을 수 있고, 앱이 보낸
 * ingredient_id 를 믿을 이유도 없다.
 *
 * **같은 초안을 두 번 저장하지 않는다.** `save()` 가 `source_asset` 을
 * `FOR UPDATE` 로 잡고 이미 붙어 있으면 그 id 를 돌려준다 — 화면에서
 * 버튼을 막는 것만으로는 못 막는다. 폰이 잠기면 서버는 저장을 끝냈는데
 * 응답만 사라지고, 사용자 눈에는 실패라 다시 누른다 (실제로 두 건이 생겼다).
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { commit, type Draft } from "@/lib/parse/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const draft = input.draft as Draft | undefined;
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.items)) {
    return bad("초안을 못 알아보겠어요 (draft)");
  }

  try {
    return NextResponse.json({ recipeId: await commit(draft) });
  } catch (e) {
    /*
      "재료가 하나도 없어요" 는 요청이 틀린 것이다 — 사용자가 전부
      뺀 것이고, 고칠 수 있는 일이라 무엇이 문제인지 그대로 말한다.
    */
    const why = e instanceof Error ? e.message : "";
    if (/재료가 하나도 없어요/.test(why)) return bad(why);
    return oops(e, "저장하지 못했어요");
  }
}
