/**
 * 공유 시트에서 받는 자리 (작업 순서 9번)
 *
 * 안드로이드 공유 시트에서 이 앱을 고르면 여기로 POST 가 온다
 * (manifest.ts 의 share_target). 인스타·유튜브를 보다가 공유 버튼으로
 * 바로 넘기는 길이고, 이게 이 제품의 핵심 유입 경로다.
 *
 * 여기서 하는 일은 둘뿐이다.
 *   1. **원본을 먼저 보관한다.** 파싱은 아직 안 한다 (원칙 ⑤)
 *   2. /add 로 넘긴다
 *
 * 파싱을 여기서 돌리지 않는 이유: 30초쯤 걸린다. 공유를 누른 사람이
 * 빈 화면을 30초 보게 만들면 다시는 안 쓴다. 확인 화면까지 가는 흐름은
 * /add 가 이미 갖고 있으니 거기로 넘긴다.
 */

import { NextResponse } from "next/server";
import { MEDIA_TYPES } from "@/lib/parse/claude";
import { MAX_BYTES, MAX_IMAGES, keepOriginal } from "@/lib/parse/originals";
import { PARSER_VERSION } from "@/lib/parse/parse";
import { recordAsset } from "@/lib/parse/store";

export const dynamic = "force-dynamic";

/** 공유로 넘어온 글에서 링크만 뽑는다. 안드로이드는 text 에 섞어 보낸다. */
function firstUrl(...parts: (string | null)[]): string | null {
  for (const p of parts) {
    const hit = p?.match(/https?:\/\/\S+/);
    if (hit) return hit[0];
  }
  return null;
}

export async function POST(request: Request) {
  const back = (params: Record<string, string>) =>
    // 303 이라야 브라우저가 GET 으로 따라간다. 새로고침해도 다시 POST 되지 않는다.
    NextResponse.redirect(
      new URL(`/add?${new URLSearchParams(params)}`, request.url),
      303,
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back({ shared: "1", problem: "받은 걸 못 읽었어요" });
  }

  const text = String(form.get("text") || "").trim();
  const title = String(form.get("title") || "").trim();
  const url = firstUrl(String(form.get("url") || ""), text, title);

  const files = form
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_IMAGES);

  const assetIds: number[] = [];
  try {
    for (const file of files) {
      const mediaType = MEDIA_TYPES[file.type];
      if (!mediaType || file.size > MAX_BYTES) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      const storageKey = await keepOriginal(bytes, mediaType);
      assetIds.push(
        await recordAsset(
          { kind: "IMAGE", storageKey, rawText: null },
          PARSER_VERSION,
        ),
      );
    }
  } catch (e) {
    return back({
      shared: "1",
      problem: e instanceof Error ? e.message : "원본을 보관하지 못했어요",
      ...(url ? { url } : {}),
    });
  }

  // 링크만 공유했으면 본문 글도 같이 넘긴다 — 붙여넣기 칸을 채워준다.
  return back({
    shared: "1",
    ...(assetIds.length > 0 ? { assets: assetIds.join(",") } : {}),
    ...(url ? { url } : {}),
    ...(!files.length && text ? { text } : {}),
  });
}
