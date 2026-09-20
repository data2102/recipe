/**
 * POST   /api/photos — 만든 사진을 붙인다 (multipart: `recipeId` · `photo`)
 * DELETE /api/photos — 사진만 뗀다 (`{ cookId }`)
 *
 * **사진은 조리 기록에 붙는다** (`cook_log.photo_key`). 레시피에 따로
 * 매달지 마라 — 언제 만든 건지 모르는 사진만 쌓인다. 그래서 사진을
 * 올리면 **만든 기록이 생긴다**(없을 때). 규칙은 `lib/photos.ts` 에
 * 한 벌만 있고 웹 화면도 같은 걸 부른다.
 *
 * **JSON 이 아니라 멀티파트인 이유.** base64 로 바꿔 JSON 에 넣으면
 * 몸통이 1.33배가 된다 — 폰에서 올리는 길이라 그 차이가 업로드 시간이다
 * (`/api/ingest` 와 같은 이유).
 *
 * 떼는 건 조리 기록을 지우는 게 아니다 — 사진이 잘못 나왔다고 그날
 * 만든 사실이 없어지지는 않는다.
 */

import { NextResponse } from "next/server";
import { allow, bad, body, oops } from "@/lib/api/guard";
import { MEDIA_TYPES } from "@/lib/parse/claude";
import { MAX_BYTES, keepOriginal } from "@/lib/parse/originals";
import { attach, detach } from "@/lib/photos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("사진은 multipart/form-data 로 보내주세요");
  }

  const recipeId = Number(form.get("recipeId"));
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return bad("레시피를 못 찾겠어요");
  }

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return bad("사진을 골라주세요");
  if (file.size > MAX_BYTES) {
    return bad(`사진이 너무 커요 (${Math.round(file.size / 1e6)}MB)`);
  }
  const mediaType = MEDIA_TYPES[file.type];
  if (!mediaType) return bad("PNG · JPG · WEBP 만 올릴 수 있어요");

  try {
    // 원본을 먼저 보관한다 (원칙 ⑤). DB 가 실패해도 사진은 남는다.
    const bytes = Buffer.from(await file.arrayBuffer());
    await attach(recipeId, await keepOriginal(bytes, mediaType));
    return NextResponse.json({ recipeId, attached: true });
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (/foreign key|violates/i.test(why)) return bad("레시피를 못 찾겠어요");
    return oops(e, "사진을 올리지 못했어요");
  }
}

export async function DELETE(request: Request) {
  const gate = allow(request);
  if (!gate.ok) return gate.response;

  const input = await body(request);
  if (!input) return bad("JSON 으로 보내주세요");

  const cookId = Number(input.cookId);
  if (!Number.isInteger(cookId) || cookId <= 0) return bad("사진을 못 찾겠어요");

  try {
    await detach(cookId);
    // 없는 것을 떼도 결과는 같다 — 없다. 폰이 두 번 보내도 탈이 없게.
    return NextResponse.json({ cookId, removed: true });
  } catch (e) {
    return oops(e, "사진을 떼지 못했어요");
  }
}
