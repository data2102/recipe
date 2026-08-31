/**
 * [2층] 파싱 — 파서는 **원문을 옮기기만** 한다
 *
 * 표준화는 3층(normalize.ts)이 사전을 보고 코드로 한다. 이렇게 나눠야
 * 사전이 좋아질 때 재파싱 없이 재매핑만 하면 된다 (지시서 4장).
 *
 * 2패스
 *   1차  재료 목록 섹션에서만 재료를 뽑는다. 조리 단계는 글자만 옮긴다.
 *   2차  1차 결과 + 1차가 옮겨온 조리 단계 텍스트를 주고,
 *        "이 목록에 없는 재료를 조리 단계에서 찾아라" 만 시킨다.
 *
 * **2차에는 이미지를 다시 보내지 않는다.** 원가 증가가 2.2배 -> 1.2배로
 * 줄어든다 (지시서 4장). 실측: 레시피 5건 중 2건에서 재료 목록에 없는
 * 재료가 조리 단계에만 나왔다 (묵은지고등어조림의 무, 제육볶음의 올리브유).
 *
 * 이 파일은 pipeline/parser.py 와 같은 일을 한다. 프롬프트는 한 벌이다
 * (prompts/*.md -> prompts.ts). 규칙을 고치면 양쪽을 같이 고쳐라.
 */

import type { Ask, Source, Usage } from "./claude";
import { PASS1, PASS2 } from "./prompts";

/** 프롬프트를 고치면 pipeline/parser.py 의 PARSER_VERSION 과 같이 올린다. */
export const PARSER_VERSION = "p2-2026-08";

export type Origin = "LIST" | "BODY" | "USER";

export type ParsedItem = {
  raw_name: string;
  raw_qty: string | null;
  section: string | null;
  origin: Origin;
  evidence: string | null;
};

export type Parsed = {
  title: string;
  items: ParsedItem[];
  choiceGroups: string[][];
  steps: string[];
  rawText: string;
  parserVersion: string;
  usage: Usage;
};

/** 파싱 실패. rawText 가 있으면 원본은 그래도 저장한다 (원칙 ⑤). */
export class ParseError extends Error {
  rawText: string | null;
  constructor(message: string, rawText: string | null = null) {
    super(message);
    this.name = "ParseError";
    this.rawText = rawText;
  }
}

function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) {
    out = out.split(`<<${k.toUpperCase()}>>`).join(v);
  }
  return out;
}

function stripFence(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/** 공백만 없앤다. 그 이상은 추측이다 (원칙 ④). */
function key(s: string): string {
  return (s || "").replace(/\s+/g, "");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** JSON 이 깨지면 한 번만 다시 시도한다 (지시서 4장 "실패 처리"). */
async function askJson(
  ask: Ask,
  sources: Source[],
  prompt: string,
  maxTokens: number,
): Promise<{ data: Record<string, unknown>; usage: Usage; raw: string }> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage } = await ask(prompt, sources, maxTokens);
    last = text;
    try {
      const data = JSON.parse(stripFence(text));
      if (data && typeof data === "object") {
        return { data: data as Record<string, unknown>, usage, raw: text };
      }
    } catch {
      // 다시 한 번
    }
  }
  throw new ParseError("JSON 파싱 실패 (재시도 1회 포함)", last);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export async function parse(sources: Source[], ask: Ask): Promise<Parsed> {
  if (sources.length === 0) throw new ParseError("넣을 게 없다");

  const first = await askJson(ask, sources, PASS1, 4000);
  const d1 = first.data;

  const items: ParsedItem[] = [];
  for (const raw of asArray(d1["재료"])) {
    const x = raw as Record<string, unknown>;
    const name = str(x["이름"]);
    if (!name) continue;
    items.push({
      raw_name: name,
      raw_qty: str(x["수량"]) || null,
      section: str(x["구분"]) || null,
      origin: "LIST",
      evidence: null,
    });
  }

  const steps = asArray(d1["조리단계"])
    .map((s) => String(s).trim())
    .filter(Boolean);

  // --- 2차: 이미지 없이 조리 단계 텍스트만 넘긴다 ---
  let usage2: Usage = { input: 0, output: 0 };
  if (steps.length > 0 && items.length > 0) {
    const prompt = fill(PASS2, {
      known: items.map((i) => i.raw_name).join(", "),
      steps: steps.map((s, n) => `${n + 1}. ${s}`).join("\n"),
    });
    let d2: Record<string, unknown> = {};
    try {
      const second = await askJson(ask, [], prompt, 2000);
      d2 = second.data;
      usage2 = second.usage;
    } catch {
      // 2차가 깨져도 1차 결과는 살린다. 숨은 재료를 놓칠 뿐이다.
    }
    const seen = new Set(items.map((i) => key(i.raw_name)));
    for (const raw of asArray(d2["누락재료"])) {
      const x = raw as Record<string, unknown>;
      const name = str(x["이름"]);
      if (!name || seen.has(key(name))) continue;
      seen.add(key(name));
      items.push({
        raw_name: name,
        raw_qty: str(x["수량"]) || null,
        section: null,
        origin: "BODY",
        evidence: str(x["근거"]) || null,
      });
    }
  }

  // 재료가 하나도 없으면 실패다. 파서에게 "이게 레시피냐"를 묻지 않는다.
  if (items.length === 0) {
    throw new ParseError("재료를 하나도 못 찾았어요", first.raw);
  }

  return {
    title: str(d1["요리명"]) || "제목 없음",
    items,
    choiceGroups: asArray(d1["택1그룹"])
      .map((g) => asArray(g).map((n) => String(n).trim()).filter(Boolean))
      .filter((g) => g.length > 0),
    steps,
    rawText: first.raw,
    parserVersion: PARSER_VERSION,
    usage: {
      input: first.usage.input + usage2.input,
      output: first.usage.output + usage2.output,
    },
  };
}
