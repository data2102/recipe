/**
 * [3층] 정규화 — 여기부터는 LLM 을 쓰지 않는다
 *
 * 파서가 옮겨온 원문 표기를 사전과 대조해 표준 ID 를 붙인다.
 * 사전에 없으면 붙이지 않는다. 추측은 금지다 (원칙 ④).
 *
 * 세 갈래로 갈린다. 확인 화면의 3분류가 그대로 이것이다.
 *
 *   MAPPED     사전에 있고 단정해도 되는 표기   -> ingredient_id 채움
 *   CHECK      단정하면 안 되는 것             -> ingredient_id 는 NULL
 *   UNMAPPED   사전에 없는 이름                -> NULL + unmapped_term 적립
 *
 * CHECK 로 가는 경우는 셋이다.
 *   - origin='BODY'      조리 단계에만 나온 재료. 근거를 보여주고 물어본다
 *   - kind='AMBIGUOUS'   '간장' 처럼 후보는 있지만 종류가 불명
 *   - 택1 그룹           'A OR B'. 하나만 사야 한다
 *
 * **AMBIGUOUS 는 unmapped_term 에 넣지 않는다.** 사전에 이미 있는 표기라
 * 거기 쌓이면 "사전에 없어서 못 붙인 것" 목록이 오염된다.
 *
 * 버킷과 적립(recordUnmapped)은 별개다. '대패삼겹살'은 택1이라 화면에서는
 * 확인 필요로 가지만, 사전에 없는 표기인 건 그대로라 적립은 된다.
 *
 * pipeline/normalize.py 와 같은 규칙이다. 한쪽만 고치지 마라.
 */

import { query } from "../db";
import type { ParsedItem } from "./parse";

export const MAPPED = "MAPPED";
export const CHECK = "CHECK";
export const UNMAPPED = "UNMAPPED";
export type Bucket = typeof MAPPED | typeof CHECK | typeof UNMAPPED;

export type DictEntry = { id: number; canonical: string; kind: string | null };
export type Dictionary = Map<string, DictEntry>;

export type NormalizedItem = ParsedItem & {
  ingredient_id: number | null;
  canonical: string | null;
  choice_group: string | null;
  bucket: Bucket;
  recordUnmapped: boolean;
  /** 화면 표기. 표준명(원문) — 원문이 표준명과 같으면 괄호를 숨긴다 */
  label: string;
};

/** 조회용 완화 정규화. 공백만 없앤다 — '다진 마늘' -> '다진마늘' 까지만. */
export function key(s: string): string {
  return (s || "").replace(/\s+/g, "");
}

/** 화면 표기 규칙: 표준명(원문). 원문이 표준명과 같으면 괄호를 숨긴다. */
export function label(rawName: string, canonical: string | null): string {
  if (!canonical || key(canonical) === key(rawName)) return rawName;
  return `${canonical}(${rawName})`;
}

/**
 * 사전을 한 번에 읽어 조회표로 만든다.
 * 표준명이 먼저다. 별칭이 표준명을 덮지 않게 한다.
 */
export async function loadDictionary(): Promise<Dictionary> {
  const table: Dictionary = new Map();

  const canon = await query<{ id: number; canonical_name: string }>(
    "SELECT id, canonical_name FROM ingredient",
  );
  for (const r of canon) {
    table.set(key(r.canonical_name), {
      id: r.id,
      canonical: r.canonical_name,
      kind: null,
    });
  }

  const aliases = await query<{
    alias: string;
    kind: string;
    id: number;
    canonical_name: string;
  }>(
    `SELECT a.alias, a.kind, i.id, i.canonical_name
       FROM ingredient_alias a
       JOIN ingredient i ON i.id = a.ingredient_id`,
  );
  for (const r of aliases) {
    const k = key(r.alias);
    if (!table.has(k)) {
      table.set(k, { id: r.id, canonical: r.canonical_name, kind: r.kind });
    }
  }

  return table;
}

export function normalize(
  items: ParsedItem[],
  choiceGroups: string[][],
  table: Dictionary,
): NormalizedItem[] {
  // 택1 그룹에 속한 표기를 그룹 키로 찍어둔다.
  const groupOf = new Map<string, string>();
  choiceGroups.forEach((group, n) => {
    if (group.length < 2) return; // 혼자면 택1이 아니다
    for (const name of group) groupOf.set(key(name), `c${n + 1}`);
  });

  return items.map((it) => {
    const hit = table.get(key(it.raw_name));
    const group = groupOf.get(key(it.raw_name)) ?? null;
    const reasons: string[] = [];

    let ingredientId: number | null = null;
    let bucket: Bucket;
    let recordUnmapped = false;

    if (!hit) {
      bucket = UNMAPPED;
      recordUnmapped = true;
    } else if (hit.kind === "AMBIGUOUS") {
      // 사전에 후보는 있다. 그래도 단정하지 않는다 — 말없이 진간장으로
      // 확정하면 국간장 있는 집이 진간장을 사러 간다.
      //
      // 여기서 "'진간장' 인가요?" 라고 **묻지 않는다.** 이 줄 아래에는
      // 넣을지 말지를 고르는 버튼이 붙는데, 질문을 던져놓으면 "아니요"가
      // "진간장이 아니다"로 읽혀서 재료가 통째로 빠진다. 그건 없는 걸
      // 있다고 하는 쪽 — 치명적인 오류다 (원칙 ②).
      bucket = CHECK;
      reasons.push(
        `'${it.raw_name}' 은 종류가 여러 가지예요. ` +
          `탭해서 '${hit.canonical}' 처럼 고쳐주면 다음부터 알아봐요.`,
      );
    } else {
      ingredientId = hit.id;
      bucket = MAPPED;
    }

    if (it.origin === "BODY") {
      bucket = CHECK;
      reasons.push(it.evidence || "재료 목록에 없고 조리 단계에만 나와요");
    }

    if (group) {
      bucket = CHECK;
      reasons.push("택1 — 이 중 하나만 사면 돼요");
    }

    return {
      ...it,
      ingredient_id: ingredientId,
      canonical: hit ? hit.canonical : null,
      choice_group: group,
      bucket,
      recordUnmapped,
      // 확인 카드가 보여줄 문장. 없으면 원래 근거를 그대로 둔다.
      evidence: reasons.join(" / ") || it.evidence,
      // 표준명을 얹는 건 **실제로 매핑했을 때만**이다. AMBIGUOUS 는 후보를
      // 알면서도 안 붙였는데 화면에 '진간장(간장)' 이라고 쓰면 데이터가
      // 거부한 단정을 UI 가 해버린다.
      label: label(it.raw_name, ingredientId ? hit!.canonical : null),
    };
  });
}

export function summary(rows: NormalizedItem[]) {
  const counts = { [MAPPED]: 0, [CHECK]: 0, [UNMAPPED]: 0 } as Record<
    Bucket,
    number
  >;
  for (const r of rows) counts[r.bucket] += 1;
  return { counts, unmappedRate: counts[UNMAPPED] / (rows.length || 1) };
}
