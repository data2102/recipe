/**
 * 사진 내보내기 — `/photo/<조리기록 id>`
 *
 * 보관함(Supabase Storage `originals`)은 **비공개다.** 주소만 알면
 * 누구나 여는 자리에 남의 레시피 캡처를 두지 않는다 (지시서 6장).
 * 그래서 서버가 서비스 키로 꺼내 그대로 흘려보낸다.
 *
 * 저장 경로를 주소에 넣지 않는다. 조리 기록 id 만 받고 경로는 DB 에서
 * 찾는다 — 경로가 주소에 실리면 버킷 구조가 밖으로 새어 나간다.
 */

import { NextResponse } from "next/server";
import { readOriginal } from "@/lib/parse/originals";
import { keyOf } from "@/lib/photos";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/photo/[id]">,
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return new NextResponse("못 찾겠어요", { status: 404 });
  }

  const key = await keyOf(n);
  if (!key) return new NextResponse("못 찾겠어요", { status: 404 });

  try {
    const { bytes, mediaType } = await readOriginal(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mediaType,
        // 내용은 안 바뀐다 (바꾸면 새 사진이다). 폰에서 다시 안 받게 한다.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("사진을 못 읽었어요", { status: 404 });
  }
}
