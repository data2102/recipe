/**
 * POST /api/ingest — 캡처를 읽어 **초안**을 돌려준다 (저장하지 않는다)
 *
 * `multipart/form-data`: `images` (여러 장) · `text` · `sourceUrl`
 *
 * 하는 일은 `lib/parse/ingest.ts` 에 있다 — 웹 화면도 같은 걸 부른다.
 * **원본을 파싱보다 먼저 보관하는 순서**가 거기 있고, 그래서 파싱이
 * 실패해도 올린 건 남는다 (원칙 ⑤).
 *
 * **JSON 이 아니라 멀티파트인 이유.** 캡처를 base64 로 바꿔 JSON 에 넣으면
 * 몸통이 1.33배가 된다. 폰에서 여러 장 올리는 길이라 그 차이가 그대로
 * 업로드 시간이다.
 *
 * 저장은 여기서 안 한다 — **사용자가 보기 전에는 레시피가 아니다.**
 * 확인 화면이 손본 결과를 `POST /api/ingest/commit` 이 저장한다.
 */

import { NextResponse } from "next/server";
import { allow, bad, oops } from "@/lib/api/guard";
import { ingest, type Upload } from "@/lib/parse/ingest";

export const dynamic = "force-dynamic";

/**
 * 파싱은 30초쯤 걸린다. 서버리스 기본(10초)으로는 못 끝낸다.
 * 웹 화면이 쓰는 서버 액션도 같은 한도를 받는다 (`web/vercel.json`).
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("캡처는 multipart/form-data 로 보내주세요");
  }

  const images: Upload[] = [];
  for (const part of form.getAll("images")) {
    if (!(part instanceof File) || part.size === 0) continue;
    images.push({
      name: part.name || "캡처",
      type: part.type,
      bytes: Buffer.from(await part.arrayBuffer()),
    });
  }

  try {
    /*
      `ingest` 는 실패도 값으로 돌려준다 (`{ ok: false, message, hint }`).
      **그건 오류가 아니라 답이다** — 캡처가 너무 크다거나 못 읽는
      형식이라는 건 사용자가 고칠 수 있는 일이고, 그때도 원본은 이미
      보관돼 있다. 그래서 200 으로 그대로 내보낸다.
    */
    const result = await ingest({
      images,
      text: String(form.get("text") || ""),
      sourceUrl: String(form.get("sourceUrl") || "") || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return oops(e, "레시피를 읽다가 막혔어요");
  }
}
