"use server";

/**
 * 노션에서 옮겨오기 — **한 번 쓰고 버리는 길이다**
 *
 * 지시서에 없는 화면이다. 앱이 레시피가 쌓인 상태에서 어떻게 보이는지
 * 확인하려면 실제 데이터가 필요한데, 33건을 손으로 넣을 수는 없어서 만들었다.
 * 다 옮기고 나면 `app/import/` 를 통째로 지워도 된다.
 *
 * **파이프라인을 우회하지 않는다.** 노션 본문을 `/add` 의 "글로 붙여넣기"
 * 와 똑같이 파서에 넣고, 정규화도 같은 코드를 탄다. 그래야 `unmapped_term`
 * 이 진짜로 쌓여서 작업 순서 5번(미분류 확인)을 잴 수 있다. 여기서 SQL 로
 * 바로 꽂으면 사전 대조를 건너뛰어 그 측정이 거짓이 된다.
 *
 * 확인 화면은 건너뛴다. 그 대신 기본값을 그대로 쓴다 — 조리 단계에만 나온
 * 재료(origin=BODY)는 확인 안 된 상태로 들어가고, 택1 그룹은 첫 번째만
 * 산다 (app/add/actions.ts 의 toDraftItems 와 같은 규칙).
 */

import { revalidatePath } from "next/cache";
import { one } from "@/lib/db";
import { currentAsk, hasKey } from "@/lib/parse/claude";
import { loadDictionary, normalize } from "@/lib/parse/normalize";
import { PARSER_VERSION, parse } from "@/lib/parse/parse";
import { recordAsset, recordParsed, save } from "@/lib/parse/store";
import { query } from "@/lib/db";
import { SOURCES, type ImportResult } from "./sources";

/** 이미 옮긴 것. 노션 주소를 열쇠로 쓴다 — 두 번 눌러도 두 건이 안 된다 */
export async function alreadyImported(): Promise<string[]> {
  const urls = SOURCES.map((s) => s.notionUrl);
  const rows = await query<{ source_url: string }>(
    `SELECT source_url FROM recipe WHERE source_url = ANY($1::text[])`,
    [urls],
  );
  return rows.map((r) => r.source_url);
}

/**
 * 한 건을 옮긴다. 한 번에 하나씩 부른다 — 서버리스 함수는 실행 시간이
 * 제한돼 있어서 33건을 한 요청에 넣으면 중간에 끊긴다.
 */
export async function importOne(index: number): Promise<ImportResult> {
  const src = SOURCES[index];
  if (!src) return { ok: false, title: "?", message: "없는 항목이에요." };
  if (!src.text) {
    return { ok: false, title: src.title, message: "본문이 캡처뿐이라 캡처로 올려야 해요." };
  }
  if (!hasKey()) {
    return { ok: false, title: src.title, message: "ANTHROPIC_API_KEY 가 없어요." };
  }

  // 이미 있으면 그대로 둔다. 노션 쪽을 고쳐 다시 옮기고 싶으면 앱에서
  // 지우고 다시 누른다 — 여기서 덮어쓰면 손댄 게 조용히 사라진다.
  const seen = await one<{ id: number }>(
    `SELECT id FROM recipe WHERE source_url = $1 LIMIT 1`,
    [src.notionUrl],
  );
  if (seen) {
    return { ok: true, title: src.title, recipeId: seen.id, skipped: true, items: 0 };
  }

  // 원본을 파싱보다 먼저 보관한다 (원칙 ⑤). 노션 본문이 여기서는 원본이다.
  const assetId = await recordAsset(
    { kind: "TEXT", storageKey: null, rawText: src.text },
    PARSER_VERSION,
  );

  try {
    const parsed = await parse([{ kind: "TEXT", text: src.text }], await currentAsk());
    await recordParsed([assetId], parsed.rawText);

    const table = await loadDictionary();
    const rows = normalize(parsed.items, parsed.choiceGroups, table);

    // 택1 그룹은 첫 번째만 산다. 둘 다 빼면 고기를 안 사게 된다 (원칙 ②).
    const firstOfGroup = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.choice_group && !firstOfGroup.has(r.choice_group)) {
        firstOfGroup.set(r.choice_group, i);
      }
    });

    const recipeId = await save({
      // 노션 제목을 그대로 쓴다. 파서가 지어낸 제목보다 사용자가 붙인 게 맞다
      title: src.title,
      steps: parsed.steps,
      rows,
      confirmed: (r, i) =>
        r.choice_group ? firstOfGroup.get(r.choice_group) === i : r.origin !== "BODY",
      assetIds: [assetId],
      sourceUrl: src.notionUrl,
      sourceKind: "NOTION",
    });

    // 노션에서 "괜찮았다" 로 표시해둔 것만 GOOD 으로 올린다.
    // 마지막 조리일은 노션에도 없어서 비워둔다 — 지어내지 않는다.
    if (src.status === "GOOD") {
      await query(`UPDATE recipe SET status = 'GOOD' WHERE id = $1`, [recipeId]);
    }

    revalidatePath("/");
    return { ok: true, title: src.title, recipeId, skipped: false, items: rows.length };
  } catch (e) {
    // 파싱이 실패해도 원본은 source_asset 에 남는다. 다시 눌러도 된다.
    await recordParsed([assetId], null).catch(() => {});
    return {
      ok: false,
      title: src.title,
      message: e instanceof Error ? e.message : "옮기지 못했어요.",
    };
  }
}
