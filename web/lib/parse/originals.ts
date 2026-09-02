/**
 * 원본 보관 — 절대 버리지 않는다 (원칙 ⑤)
 *
 * 파서가 좋아지면 `source_asset.parser_version` 으로 재파싱 대상을 뽑아
 * 과거 레시피를 전부 다시 돌린다. 원본을 안 남기면 그 시점의 파싱 품질이
 * 영구히 박제된다. 파싱이 실패해도 원본은 남긴다.
 *
 * 두 곳 중 하나에 둔다.
 *   SUPABASE_URL 이 있으면  -> Supabase Storage (운영)
 *   없으면                  -> 로컬 디스크 (개발. pipeline/ CLI 와 같은 자리)
 *
 * Storage 는 REST 로 직접 부른다. 파일 하나 올리는 데 SDK 를 받지 않는다.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** 캡처 한 장 상한. 지나치게 크면 파싱 전에 걸러 말해준다 */
export const MAX_BYTES = 8 * 1024 * 1024;

/** 지시서 4장 — 캡처 1~3장 */
export const MAX_IMAGES = 3;

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "originals";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Storage 에 보내는 인증 헤더.
 *
 * **두 개를 다 보낸다.** `Authorization` 만 보내면 Storage 가 그 값을
 * JWT 로 뜯어보다가 실패한다 — 수파베이스가 새로 낸 키(`sb_secret_...`)는
 * JWT 가 아니라서 "Invalid Compact JWS" 로 막힌다. `apikey` 는 게이트웨이가
 * 먼저 보는 자리고, 공식 클라이언트도 둘 다 보낸다.
 *
 * 예전 방식인 service_role JWT(`eyJ...`)는 어느 쪽으로 보내도 통한다.
 */
function auth(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * 로컬 보관 자리. 개발용이다 — pipeline/ CLI 가 쓰는 .local/originals 와 같다.
 * 운영에서는 Supabase Storage 로 간다. 여기로 떨어지면 컨테이너가 재시작할 때
 * 원본이 날아가므로 (원칙 ⑤ 위반) 그때는 차라리 실패시킨다.
 */
function localDir(): string {
  // 개발 전용 경로다. 번들러가 프로젝트 전체를 추적하지 않게 표시해둔다.
  return path.resolve(/*turbopackIgnore: true*/ process.env.ORIGINALS_DIR || "../.local/originals");
}

/**
 * 원본 바이트를 보관하고 `storage_key` 를 돌려준다.
 *
 * 내용 해시로 이름을 짓는다. 같은 캡처를 두 번 넣어도 사본이 안 늘고,
 * 파일명이 바뀌어도 같은 원본임을 알 수 있다.
 */
export async function keepOriginal(
  bytes: Buffer,
  mediaType: string,
): Promise<string> {
  const digest = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const name = `${digest}${EXT[mediaType] ?? ".bin"}`;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    const endpoint = `${url.replace(/\/+$/, "")}/storage/v1/object/${BUCKET}/${name}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...auth(key),
        "Content-Type": mediaType,
        // 같은 해시면 같은 파일이다. 덮어써도 내용이 안 바뀐다.
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok && res.status !== 409) {
      // 왜 막혔는지는 Supabase 가 본문에 적어 보낸다 ("Bucket not found",
      // "Invalid JWT" …). 숫자만 보여주면 버킷이 없는 건지 키가 틀린 건지
      // 구별할 수 없어서, 받은 말을 그대로 붙인다.
      const why = await res.text().catch(() => "");
      throw new Error(
        `원본을 못 올렸어요 (${res.status}). 버킷 '${BUCKET}' 이 있는지 봐주세요.` +
          (why ? ` — ${why.slice(0, 200)}` : ""),
      );
    }
    return `${BUCKET}/${name}`;
  }

  if (process.env.NODE_ENV === "production" && !process.env.ORIGINALS_DIR) {
    throw new Error(
      "원본 보관 자리가 없어요. SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 " +
        "넣거나, 디스크에 남기려면 ORIGINALS_DIR 을 정해주세요.",
    );
  }

  const dir = localDir();
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(/*turbopackIgnore: true*/ dir, name);
  try {
    await fs.access(dest);
  } catch {
    await fs.writeFile(dest, new Uint8Array(bytes));
  }
  return dest;
}

/**
 * 보관해둔 원본을 다시 읽는다.
 *
 * 공유로 받은 캡처는 /share 에서 먼저 저장하고, 사용자가 "정리해줄게요" 를
 * 누르면 그때 여기서 다시 꺼내 파서에 넘긴다. 원본을 먼저 남기는 순서를
 * 지키려면 (원칙 ⑤) 이 되돌아오는 길이 있어야 한다.
 *
 * storage_key 가 절대경로면 디스크, 아니면 Supabase Storage 다.
 */
export async function readOriginal(
  storageKey: string,
): Promise<{ bytes: Buffer; mediaType: string }> {
  const ext = storageKey.slice(storageKey.lastIndexOf("."));
  const mediaType =
    Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "image/png";

  if (storageKey.startsWith("/")) {
    return { bytes: await fs.readFile(storageKey), mediaType };
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("보관해둔 원본을 못 찾겠어요");

  const res = await fetch(
    `${url.replace(/\/+$/, "")}/storage/v1/object/${storageKey}`,
    { headers: auth(key) },
  );
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new Error(
      `보관해둔 원본을 못 읽었어요 (${res.status})` +
        (why ? ` — ${why.slice(0, 200)}` : ""),
    );
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), mediaType };
}
