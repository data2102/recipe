/**
 * POST /api/plan/note — 그날의 메모 ("저녁 약속")
 *
 * `{ date, note }` — 비우면 지운다.
 *
 * **메모는 날짜에 붙는다, 주가 아니라.** 약속이 있는 날은 *안 정해도 되는
 * 날*이라고 적어두는 자리다.
 *
 * **앱이 해석하지 마라** — 메모가 있다고 담기를 막거나 추천에서 빼지
 * 마라. 사람이 보고 사람이 정한다. 빈 메모가 행을 안 남기는 것도 같은
 * 이유다: "약속 없음" 과 "아직 안 적었다" 를 구별할 이유가 없다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { setNote } from "@/lib/notes";
import { NOTE_MAX } from "@/lib/notes.types";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!ISO_DATE.test(date)) return bad("날짜를 못 알아보겠어요");

  const note = typeof input.note === "string" ? input.note : "";

  try {
    await setNote(date, note);
    /*
      `setNote` 가 길면 잘라서 넣는다 (화면도 그렇게 동작한다). 거절하지
      않고 **넣은 값을 그대로 돌려준다** — 앱이 자기가 보낸 걸 그리면
      DB 와 화면이 어긋난다.
    */
    return NextResponse.json({ date, note: note.trim().slice(0, NOTE_MAX) });
  } catch (e) {
    return oops(e, "메모를 저장 못 했어요");
  }
}
