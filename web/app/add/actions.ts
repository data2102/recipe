"use server";

/**
 * 캡처 → 파싱 → 확인 → 저장 — **화면이 부르는 자리**
 *
 * 하는 일은 전부 `lib/parse/ingest.ts` 에 있다. 여기는 폼을 값으로 바꿔
 * 넘기고, 끝나면 세 화면을 터는 자리다.
 *
 * **여기에 로직을 두지 마라.** 네이티브 앱은 서버 액션을 못 쓰고
 * `app/api/ingest` 를 타는데, 하는 일이 액션 안에 있으면 저쪽에 한 벌을
 * 더 쓰게 된다. 그러면 "원본을 파싱보다 먼저 보관한다" 같은 순서 규칙이
 * 두 군데가 되고, 한쪽만 고쳐진다.
 */

import { revalidatePath } from "next/cache";
import {
  commit as commitDraft,
  ingest as runIngest,
  ingestLink as runIngestLink,
  ingestShared as runIngestShared,
  saveLinkOnly as runSaveLinkOnly,
  type Draft,
  type DraftItem,
  type IngestResult,
  type Upload,
} from "@/lib/parse/ingest";

export type { Draft, DraftItem, IngestResult };

/** 폼이 보낸 파일을 값으로. 여기가 유일하게 `File` 을 아는 자리다 */
async function uploads(formData: FormData): Promise<Upload[]> {
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(
    files.map(async (f) => ({
      name: f.name,
      type: f.type,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  );
}

export async function ingest(formData: FormData): Promise<IngestResult> {
  return runIngest({
    images: await uploads(formData),
    text: String(formData.get("text") || ""),
    sourceUrl: String(formData.get("sourceUrl") || "") || null,
  });
}

export async function ingestShared(
  assetIds: number[],
  sourceUrl: string | null,
): Promise<IngestResult> {
  return runIngestShared(assetIds, sourceUrl);
}

export async function ingestLink(raw: string): Promise<IngestResult> {
  return runIngestLink(raw);
}

export async function commit(draft: Draft): Promise<number> {
  const id = await commitDraft(draft);
  revalidatePath("/", "layout");
  return id;
}

export async function saveLinkOnly(
  title: string,
  url: string,
): Promise<number> {
  const id = await runSaveLinkOnly(title, url);
  revalidatePath("/", "layout");
  return id;
}
