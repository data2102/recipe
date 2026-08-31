/**
 * 저장 — 원문 층과 표준 층을 함께 넣는다
 *
 * `raw_name` · `raw_qty` 는 사용자가 올린 그대로 들어간다. 표준화 결과는
 * `ingredient_id` 에만 넣는다 (원칙 ①). 사전에 없으면 NULL 로 두고
 * `unmapped_term` 에 쌓는다 — 사전을 키우는 유일한 경로다.
 *
 * pipeline/store.py 와 같은 일을 한다.
 */

import { one, query, tx } from "../db";
import { type NormalizedItem } from "./normalize";

export type AssetInput = {
  kind: "IMAGE" | "TEXT";
  storageKey: string | null;
  rawText: string | null;
};

/**
 * 원본을 먼저 적어둔다. 파싱하기 **전에** 부른다 — 파싱이 실패해도,
 * 서버가 죽어도, 원본이 있었다는 사실은 DB 에 남아야 한다 (원칙 ⑤).
 */
export async function recordAsset(
  asset: AssetInput,
  parserVersion: string,
): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO source_asset (recipe_id, kind, storage_key, raw_text, parser_version)
     VALUES (NULL, $1, $2, $3, $4)
     RETURNING id`,
    [asset.kind, asset.storageKey, asset.rawText, parserVersion],
  );
  return row!.id;
}

/** 파싱이 끝난 뒤 응답 원문을 적어둔다. 실패해도 부른다. */
export async function recordParsed(
  assetIds: number[],
  rawText: string | null,
): Promise<void> {
  if (assetIds.length === 0) return;
  await query(
    `UPDATE source_asset
        SET raw_text = COALESCE(raw_text, $2), parsed_at = now()
      WHERE id = ANY($1::bigint[])`,
    [assetIds, rawText],
  );
}

export type SaveInput = {
  title: string;
  steps: string[];
  rows: NormalizedItem[];
  /** origin=BODY 는 사용자가 확인해야 TRUE 다 (지시서 6장) */
  confirmed: (row: NormalizedItem, index: number) => boolean;
  assetIds: number[];
  sourceUrl: string | null;
  sourceKind: string | null;
};

/**
 * 레시피 한 건을 저장한다.
 *
 * 저장 시점 상태는 **WISH** 다. "해보고 싶다"이지 "맛있었다"가 아니다
 * (지시서 6장). 만들어보고 나서 GOOD 으로 올라간다.
 */
export async function save(input: SaveInput): Promise<number> {
  return tx(async (q) => {
    const [{ id: recipeId }] = await q<{ id: number }>(
      `INSERT INTO recipe (title, status, source_url, source_kind)
       VALUES ($1, 'WISH', $2, $3) RETURNING id`,
      [input.title, input.sourceUrl, input.sourceKind],
    );

    for (const [i, body] of input.steps.entries()) {
      await q(
        `INSERT INTO recipe_step (recipe_id, seq, body) VALUES ($1, $2, $3)`,
        [recipeId, i + 1, body],
      );
    }

    for (const [i, r] of input.rows.entries()) {
      await q(
        `INSERT INTO recipe_ingredient
           (recipe_id, raw_name, raw_qty, section, ingredient_id,
            origin, evidence, confirmed, choice_group)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recipeId,
          r.raw_name,
          r.raw_qty,
          r.section,
          r.ingredient_id,
          r.origin,
          r.evidence,
          input.confirmed(r, i),
          r.choice_group,
        ],
      );

      // 사전에 없어서 못 붙인 표기만 쌓는다. 사람이 주기적으로 정리한다.
      // (AMBIGUOUS 는 사전에 있으므로 여기 안 들어온다 — normalize.ts 참조)
      if (r.recordUnmapped) {
        await q(
          `INSERT INTO unmapped_term (raw_name) VALUES ($1)
           ON CONFLICT (raw_name)
           DO UPDATE SET hit_count = unmapped_term.hit_count + 1`,
          [r.raw_name],
        );
      }
    }

    if (input.assetIds.length > 0) {
      await q(
        `UPDATE source_asset SET recipe_id = $2 WHERE id = ANY($1::bigint[])`,
        [input.assetIds, recipeId],
      );
    }

    return recipeId;
  });
}
