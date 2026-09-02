"use server";

/**
 * 캡처 → 2패스 파싱 → 확인 → 저장 (작업 순서 4번)
 *
 * 두 걸음이다.
 *
 *   ingest()  올린 것을 **먼저 보관하고** 파싱한다. 결과는 저장하지 않고
 *             확인 화면으로 돌려준다 — 사용자가 보기 전에는 레시피가 아니다.
 *   commit()  확인 화면에서 손본 결과를 저장한다.
 *
 * 원본은 파싱보다 먼저 보관한다. 파싱이 실패해도, 서버가 죽어도 원본은
 * 남아야 한다 (원칙 ⑤). 실패한 원본은 recipe_id 없이 source_asset 에
 * 쌓이고, 파서를 고친 뒤 재파싱 대상이 된다.
 */

import { revalidatePath } from "next/cache";
import { currentAsk, hasKey, MEDIA_TYPES, type Source } from "@/lib/parse/claude";
import { loadDictionary, normalize, type NormalizedItem } from "@/lib/parse/normalize";
import {
  MAX_BYTES,
  MAX_IMAGES,
  keepOriginal,
  readOriginal,
} from "@/lib/parse/originals";
import { kindOf, normalizeUrl, readLink } from "@/lib/parse/link";
import { PARSER_VERSION, ParseError, parse } from "@/lib/parse/parse";
import { assetKeys, recordAsset, recordParsed, save, saveTitleOnly } from "@/lib/parse/store";

export type DraftItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  origin: "LIST" | "BODY" | "USER";
  evidence: string | null;
  choice_group: string | null;
  bucket: string;
  label: string;
  /** 장보기에 넣을 것인가. 아래 answered 와 같이 읽어야 한다 */
  confirmed: boolean;
  /**
   * 사용자가 답했는가. 아직이면 화면에서 어느 쪽도 고른 것처럼 보이면
   * 안 된다 — 안 물어본 걸 답한 척하는 셈이다.
   */
  answered: boolean;
};

export type Draft = {
  title: string;
  items: DraftItem[];
  steps: string[];
  choiceGroups: string[][];
  assetIds: number[];
  sourceUrl: string | null;
  sourceKind: string | null;
  usage: { input: number; output: number };
};

export type IngestResult =
  | { ok: true; draft: Draft }
  | {
      ok: false;
      message: string;
      hint?: string;
      /**
       * 링크는 못 읽었지만 제목은 건졌을 때. 이름만 저장해두는 길을
       * 열어준다 — 탭 1 은 "재료는 링크에서 확인해요" 인 행을 이미 받는다.
       */
      linkOnly?: { title: string; url: string };
    };

/**
 * 답을 안 했을 때의 기본값.
 *
 * 오류의 비용은 비대칭이다 (원칙 ②). 안 사고 집에 오면 저녁이 무너지고,
 * 중복 구매는 대파 한 단 더다. 그래서 애매하면 **넣는 쪽**으로 기운다.
 *
 *   재료 목록에 있던 것  넣는다. 확인할 게 없다
 *   택1 그룹            **첫 번째만 넣는다.** 둘 다 빼면 고기를 안 산다
 *   origin=BODY         뺀다. 2패스가 지어냈을 수 있어서 사람이 확인해야
 *                       TRUE 가 된다 (db/schema.sql). 그래서 물어본다
 */
function toDraftItems(rows: NormalizedItem[]): DraftItem[] {
  const firstOfGroup = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.choice_group && !firstOfGroup.has(r.choice_group)) {
      firstOfGroup.set(r.choice_group, i);
    }
  });

  return rows.map((r, i) => {
    const needsAnswer = r.origin === "BODY" || Boolean(r.choice_group);
    const confirmed = r.choice_group
      ? firstOfGroup.get(r.choice_group) === i
      : r.origin !== "BODY";
    return {
      raw_name: r.raw_name,
      raw_qty: r.raw_qty,
      section: r.section,
      origin: r.origin,
      evidence: r.evidence,
      choice_group: r.choice_group,
      bucket: r.bucket,
      label: r.label,
      confirmed,
      answered: !needsAnswer,
    };
  });
}

export async function ingest(formData: FormData): Promise<IngestResult> {
  if (!hasKey()) {
    return {
      ok: false,
      message: "레시피를 읽을 준비가 아직 안 됐어요.",
      hint: "web/.env.local 에 ANTHROPIC_API_KEY 를 넣어주세요.",
    };
  }

  const sourceUrl = String(formData.get("sourceUrl") || "").trim() || null;
  const pastedText = String(formData.get("text") || "").trim();
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0 && !pastedText) {
    return { ok: false, message: "캡처를 올리거나 레시피를 붙여넣어 주세요." };
  }
  if (files.length > MAX_IMAGES) {
    return {
      ok: false,
      message: `캡처는 ${MAX_IMAGES}장까지만 한 번에 읽어요.`,
      hint: "재료가 보이는 것부터 올려주세요.",
    };
  }

  // --- 1. 원본을 먼저 보관한다 (파싱보다 앞이다) ---
  const sources: Source[] = [];
  const assetIds: number[] = [];
  try {
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        return {
          ok: false,
          message: `${file.name} 이 너무 커요 (${Math.round(file.size / 1e6)}MB).`,
          hint: "8MB 아래로 줄여주세요.",
        };
      }
      const mediaType = MEDIA_TYPES[file.type];
      if (!mediaType) {
        return {
          ok: false,
          message: `${file.name} 은 읽을 수 없는 형식이에요.`,
          hint: "PNG · JPG · WEBP 캡처를 올려주세요.",
        };
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const storageKey = await keepOriginal(bytes, mediaType);
      assetIds.push(
        await recordAsset(
          { kind: "IMAGE", storageKey, rawText: null },
          PARSER_VERSION,
        ),
      );
      sources.push({
        kind: "IMAGE",
        mediaType,
        b64: bytes.toString("base64"),
        bytes: bytes.length,
      });
    }

    if (pastedText) {
      assetIds.push(
        await recordAsset(
          { kind: "TEXT", storageKey: null, rawText: pastedText },
          PARSER_VERSION,
        ),
      );
      sources.push({ kind: "TEXT", text: pastedText });
    }
  } catch (e) {
    return {
      ok: false,
      message: "원본을 보관하지 못했어요.",
      hint: e instanceof Error ? e.message : String(e),
    };
  }

  return readAndDraft(sources, assetIds, sourceUrl, files.length > 0);
}

/**
 * 2패스 파싱 -> 확인 화면이 쓸 초안.
 *
 * 원본은 이미 보관돼 있다는 전제다. 여기서 실패해도 원본은 남는다 —
 * 파서를 고치면 재파싱 대상이 된다 (원칙 ⑤).
 */
async function readAndDraft(
  sources: Source[],
  assetIds: number[],
  sourceUrl: string | null,
  hasImage: boolean,
): Promise<IngestResult> {
  try {
    const parsed = await parse(sources, await currentAsk());
    await recordParsed(assetIds, parsed.rawText);

    const table = await loadDictionary();
    const rows = normalize(parsed.items, parsed.choiceGroups, table);

    return {
      ok: true,
      draft: {
        title: parsed.title,
        items: toDraftItems(rows),
        steps: parsed.steps,
        choiceGroups: parsed.choiceGroups,
        assetIds,
        sourceUrl,
        sourceKind: sourceKindOf(sourceUrl, hasImage),
        usage: parsed.usage,
      },
    };
  } catch (e) {
    const raw = e instanceof ParseError ? e.rawText : null;
    await recordParsed(assetIds, raw).catch(() => {});
    return {
      ok: false,
      message:
        e instanceof ParseError
          ? `레시피를 못 읽었어요. ${e.message}`
          : "레시피를 읽다가 막혔어요.",
      hint: "올린 건 그대로 보관했어요. 재료가 잘 보이는 캡처로 다시 해보세요.",
    };
  }
}

/**
 * 공유 시트로 받아둔 캡처를 읽는다 (작업 순서 9번).
 *
 * /share 가 원본을 먼저 보관하고 id 만 넘겨준다. 여기서 다시 꺼내
 * 파서에 넘긴다 — 공유를 누른 사람을 30초 기다리게 하지 않으려고
 * 저장과 파싱을 갈라놨기 때문이다.
 */
export async function ingestShared(
  assetIds: number[],
  sourceUrl: string | null,
): Promise<IngestResult> {
  if (!hasKey()) {
    return {
      ok: false,
      message: "레시피를 읽을 준비가 아직 안 됐어요.",
      hint: "web/.env.local 에 ANTHROPIC_API_KEY 를 넣어주세요.",
    };
  }

  const kept = await assetKeys(assetIds);
  if (kept.length === 0) {
    return {
      ok: false,
      message: "공유받은 캡처를 못 찾겠어요.",
      hint: "다시 공유하거나, 아래에서 직접 올려주세요.",
    };
  }

  const sources: Source[] = [];
  try {
    for (const a of kept) {
      const { bytes, mediaType } = await readOriginal(a.storage_key);
      const type = MEDIA_TYPES[mediaType];
      if (!type) continue;
      sources.push({
        kind: "IMAGE",
        mediaType: type,
        b64: bytes.toString("base64"),
        bytes: bytes.length,
      });
    }
  } catch (e) {
    return {
      ok: false,
      message: "보관해둔 캡처를 못 읽었어요.",
      hint: e instanceof Error ? e.message : String(e),
    };
  }

  return readAndDraft(
    sources,
    kept.map((a) => a.id),
    sourceUrl,
    true,
  );
}

function sourceKindOf(url: string | null, hasImage: boolean): string {
  if (url) {
    if (/instagram\.com/i.test(url)) return "INSTAGRAM";
    if (/youtube\.com|youtu\.be/i.test(url)) return "YOUTUBE";
    if (/notion\./i.test(url)) return "NOTION";
    return "BLOG";
  }
  return hasImage ? "IMAGE" : "MANUAL";
}

/**
 * 확인 화면에서 손본 결과를 저장한다.
 *
 * 사전 대조를 **여기서 다시 한다.** 사용자가 이름을 고쳤을 수 있고,
 * 브라우저가 보낸 ingredient_id 를 그대로 믿을 이유도 없다.
 */
export async function commit(draft: Draft): Promise<number> {
  const title = draft.title.trim() || "제목 없음";
  const kept = draft.items.filter((i) => i.raw_name.trim());
  if (kept.length === 0) throw new Error("재료가 하나도 없어요");

  const table = await loadDictionary();
  const rows = normalize(
    kept.map((i) => ({
      raw_name: i.raw_name.trim(),
      raw_qty: i.raw_qty?.trim() || null,
      section: i.section,
      origin: i.origin,
      evidence: i.evidence,
    })),
    draft.choiceGroups,
    table,
  );

  const recipeId = await save({
    title,
    steps: draft.steps,
    rows,
    confirmed: (_row, i) => kept[i].confirmed,
    assetIds: draft.assetIds,
    sourceUrl: draft.sourceUrl,
    sourceKind: draft.sourceKind,
  });

  revalidatePath("/", "layout");
  return recipeId;
}


/* ---------------------------------------------------------------- */
/*  링크 (작업 순서 7번)                                              */
/* ---------------------------------------------------------------- */

/**
 * 링크 하나를 읽어본다.
 *
 * **폴백이 핵심이다.** 못 읽으면 왜 못 읽었는지 말하고 캡처로 안내한다.
 * 제목이라도 건졌으면 "이름만 저장" 을 같이 내준다 — 유튜브·인스타는
 * 그게 정상 경로다 (지시서 4장 소스별 현실 표).
 */
export async function ingestLink(raw: string): Promise<IngestResult> {
  const u = normalizeUrl(raw);
  if (!u) return { ok: false, message: "주소를 못 알아보겠어요." };

  const read = await readLink(u);

  if (!read.ok) {
    return {
      ok: false,
      message: read.why,
      hint: "재료와 만드는 법이 보이는 화면을 캡처해서 올려주세요.",
      ...(read.title
        ? { linkOnly: { title: read.title, url: u.toString() } }
        : {}),
    };
  }

  if (!hasKey()) {
    return {
      ok: false,
      message: "레시피를 읽을 준비가 아직 안 됐어요.",
      hint: "web/.env.local 에 ANTHROPIC_API_KEY 를 넣어주세요.",
      ...(read.title
        ? { linkOnly: { title: read.title, url: u.toString() } }
        : {}),
    };
  }

  // 읽어온 본문도 원본이다. 파싱보다 먼저 남긴다 (원칙 ⑤).
  let assetId: number;
  try {
    assetId = await recordAsset(
      { kind: "TEXT", storageKey: null, rawText: read.text },
      PARSER_VERSION,
    );
  } catch (e) {
    // DB 가 잠깐 안 되는 것 때문에 화면이 깨지면 안 된다.
    return {
      ok: false,
      message: "읽어온 걸 보관하지 못했어요.",
      hint: e instanceof Error ? e.message : String(e),
      ...(read.title
        ? { linkOnly: { title: read.title, url: u.toString() } }
        : {}),
    };
  }

  const result = await readAndDraft(
    [{ kind: "TEXT", text: read.text }],
    [assetId],
    u.toString(),
    false,
  );

  // 링크에서 온 건 og:title 을 제목 기본값으로 쓴다.
  if (result.ok && read.title && result.draft.title === "제목 없음") {
    result.draft.title = read.title;
  }
  if (result.ok) result.draft.sourceKind = kindOf(u);
  return result;
}

/**
 * 이름만 저장해둔다 (지시서 3장 탭 1).
 *
 * 재료가 없어도 레시피다 — "이름만 적어도 돼요. 재료는 만들 때 링크에서
 * 보면 되니까요." 유튜브처럼 글로는 재료를 못 얻는 소스가 여기로 온다.
 */
export async function saveLinkOnly(
  title: string,
  url: string,
): Promise<number> {
  const clean = title.trim() || "제목 없음";
  const u = normalizeUrl(url);
  const id = await saveTitleOnly(clean, u ? u.toString() : null, u ? kindOf(u) : "MANUAL");
  revalidatePath("/", "layout");
  return id;
}
