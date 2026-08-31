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
 *
 * **같은 초안을 두 번 저장하지 않는다.** 화면에서 버튼을 막는 것만으로는
 * 부족하다 — 폰이 잠기거나 지하철에 들어가면 서버는 저장을 끝냈는데
 * 응답만 사라진다. 사용자 눈에는 실패라서 다시 누르고, 그러면 같은 요리가
 * 두 건이 된다. 그래서 서버가 "이 초안은 이미 저장됐다"를 알아야 한다.
 *
 * 열쇠는 `source_asset.recipe_id` 다. 원본은 파싱보다 먼저 보관되므로
 * (원칙 ⑤) 모든 초안에는 자기 원본이 붙어 있고, 저장이 끝나면 그 원본에
 * recipe_id 가 박힌다. 이미 박혀 있으면 저장된 것이다.
 *
 * 문장 수도 줄인다. 재료 하나에 INSERT 하나씩 보내면 재료 15개짜리
 * 레시피가 왕복 20번이다. 서버와 DB 가 서로 먼 대륙에 있으면 왕복 한 번에
 * 200ms 라 그것만으로 4초가 넘는다.
 */
export async function save(input: SaveInput): Promise<number> {
  return tx(async (q) => {
    // 이 초안의 원본을 잠근다. 두 번 눌러 동시에 들어와도 뒤엣것은
    // 앞엣것이 끝날 때까지 여기서 기다렸다가, 이미 붙은 recipe_id 를 본다.
    if (input.assetIds.length > 0) {
      const locked = await q<{ recipe_id: number | null }>(
        `SELECT recipe_id FROM source_asset
          WHERE id = ANY($1::bigint[])
          ORDER BY id
          FOR UPDATE`,
        [input.assetIds],
      );
      const already = locked.find((r) => r.recipe_id !== null);
      if (already) return already.recipe_id!;
    }

    const [{ id: recipeId }] = await q<{ id: number }>(
      `INSERT INTO recipe (title, status, source_url, source_kind)
       VALUES ($1, 'WISH', $2, $3) RETURNING id`,
      [input.title, input.sourceUrl, input.sourceKind],
    );

    if (input.steps.length > 0) {
      await q(
        `INSERT INTO recipe_step (recipe_id, seq, body)
         SELECT $1, t.ord, t.body
           FROM unnest($2::text[]) WITH ORDINALITY AS t(body, ord)`,
        [recipeId, input.steps],
      );
    }

    if (input.rows.length > 0) {
      // 순서가 화면에 보인다 (재료 요약은 ri.id 순으로 4개를 자른다).
      // WITH ORDINALITY + ORDER BY 로 배열 순서를 그대로 박아둔다.
      await q(
        `INSERT INTO recipe_ingredient
           (recipe_id, raw_name, raw_qty, section, ingredient_id,
            origin, evidence, confirmed, choice_group)
         SELECT $1, t.raw_name, t.raw_qty, t.section, t.ingredient_id,
                t.origin, t.evidence, t.confirmed, t.choice_group
           FROM unnest($2::text[], $3::text[], $4::text[], $5::bigint[],
                       $6::text[], $7::text[], $8::boolean[], $9::text[])
                WITH ORDINALITY
                AS t(raw_name, raw_qty, section, ingredient_id,
                     origin, evidence, confirmed, choice_group, ord)
          ORDER BY t.ord`,
        [
          recipeId,
          input.rows.map((r) => r.raw_name),
          input.rows.map((r) => r.raw_qty),
          input.rows.map((r) => r.section),
          input.rows.map((r) => r.ingredient_id),
          input.rows.map((r) => r.origin),
          input.rows.map((r) => r.evidence),
          input.rows.map((r, i) => input.confirmed(r, i)),
          input.rows.map((r) => r.choice_group),
        ],
      );
    }

    // 사전에 없어서 못 붙인 표기만 쌓는다. 사람이 주기적으로 정리한다.
    // (AMBIGUOUS 는 사전에 있으므로 여기 안 들어온다 — normalize.ts 참조)
    //
    // 한 레시피에 같은 표기가 두 번 나오면 hit_count 도 2 오른다. 그래서
    // 문장 하나로 합칠 때 미리 세어서 넣는다 — ON CONFLICT 는 한 문장 안에서
    // 같은 키를 두 번 건드리지 못한다.
    const unmapped = input.rows.filter((r) => r.recordUnmapped).map((r) => r.raw_name);
    if (unmapped.length > 0) {
      await q(
        `INSERT INTO unmapped_term (raw_name, hit_count)
         SELECT t.name, COUNT(*)
           FROM unnest($1::text[]) AS t(name)
          GROUP BY t.name
         ON CONFLICT (raw_name)
         DO UPDATE SET hit_count = unmapped_term.hit_count + EXCLUDED.hit_count`,
        [unmapped],
      );
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

/** 보관해둔 원본의 자리. 공유로 받은 캡처를 다시 꺼낼 때 쓴다. */
export async function assetKeys(
  ids: number[],
): Promise<{ id: number; storage_key: string }[]> {
  if (ids.length === 0) return [];
  return query<{ id: number; storage_key: string }>(
    `SELECT id, storage_key FROM source_asset
      WHERE id = ANY($1::bigint[])
        AND recipe_id IS NULL          -- 이미 레시피가 된 건 다시 안 쓴다
        AND storage_key IS NOT NULL
      ORDER BY id`,
    [ids],
  );
}


/**
 * 재료 없이 이름만 저장한다 (작업 순서 7번).
 *
 * 링크를 못 읽었어도 레시피는 남는다. 탭 1 이 "재료는 링크에서 확인해요"
 * 라고 보여주고, 나중에 캡처로 재료를 채우면 된다.
 */
export async function saveTitleOnly(
  title: string,
  sourceUrl: string | null,
  sourceKind: string,
): Promise<number> {
  return tx(async (q) => {
    // 여기엔 붙잡을 원본이 없다 (링크를 못 읽어서 온 길이다). 대신 좀 전에
    // 같은 주소로 들어온 게 있으면 그건 다시 누른 것이다 — 응답이 사라져서
    // 실패로 보였을 뿐 저장은 됐다.
    //
    // **중복 레시피 병합 기준을 정하는 게 아니다** (그건 지시서 9장의 열린
    // 결정이다). 몇 분 안쪽만 본다 — 한 달 뒤 같은 주소를 또 넣는 건
    // 사용자가 일부러 하는 것이라 막지 않는다.
    if (sourceUrl) {
      const seen = await q<{ id: number }>(
        `SELECT id FROM recipe
          WHERE source_url = $1
            AND created_at > now() - interval '5 minutes'
          ORDER BY id DESC LIMIT 1`,
        [sourceUrl],
      );
      if (seen[0]) return seen[0].id;
    }

    const rows = await q<{ id: number }>(
      `INSERT INTO recipe (title, status, source_url, source_kind)
       VALUES ($1, 'WISH', $2, $3) RETURNING id`,
      [title, sourceUrl, sourceKind],
    );
    return rows[0].id;
  });
}
