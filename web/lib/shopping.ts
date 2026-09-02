/**
 * 이번 주 담기 + 장보기 3단 분류 (작업 순서 6번)
 *
 * 담은 요리들의 재료를 합산해 한 목록으로 낸다. 판정하지 않고 근거를
 * 보여준다 — "없음" 대신 "6일 전에 샀어요" (원칙 ③).
 *
 *   BUY    구매 이력 없음 OR 경과일 > 유통기한
 *   CHECK  경과일 > 유통기한/2      -> "6일 전에 샀어요"
 *   HAVE   그 외
 *
 * 냉장고 상태를 추적하지 않는다. `purchase` 는 "언제 샀는지"만 남기고
 * 장보기 체크로 자동 생성되므로 별도 입력이 없다. 틀릴 수가 없는
 * 데이터라 신뢰가 안 깨진다 (지시서 6장).
 */

import { one, query, tx } from "./db";
import { NO_HAVE, atHome, type Have } from "./fridge.types";
import type {
  Bucket,
  PickedRecipe,
  RecipeGroup,
  ShoppingItem,
} from "./shopping.types";

export type { Bucket, PickedRecipe, ShoppingItem };

/**
 * 이번 주 목록. 없으면 만든다.
 *
 * 한 번에 하나만 열려 있다. "이번 주"라는 말이 곧 열려 있는 목록이다 —
 * 주차를 따로 계산하지 않는다. 장보기를 끝내면 다음 것이 열린다.
 */
export async function openList(create = false): Promise<number | null> {
  const found = await one<{ id: number }>(
    `SELECT id FROM shopping_list WHERE status = 'OPEN'
      ORDER BY id DESC LIMIT 1`,
  );
  if (found) return found.id;
  if (!create) return null;
  const made = await one<{ id: number }>(
    `INSERT INTO shopping_list (status) VALUES ('OPEN') RETURNING id`,
  );
  return made!.id;
}

export async function picked(listId: number | null): Promise<PickedRecipe[]> {
  if (!listId) return [];
  return query<PickedRecipe>(
    `SELECT r.id, r.title, r.status
       FROM shopping_list_recipe slr
       JOIN recipe r ON r.id = slr.recipe_id
      WHERE slr.list_id = $1
      ORDER BY r.title`,
    [listId],
  );
}

export async function addRecipe(recipeId: number): Promise<void> {
  const listId = await openList(true);
  await query(
    `INSERT INTO shopping_list_recipe (list_id, recipe_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [listId, recipeId],
  );
}

export async function removeRecipe(recipeId: number): Promise<void> {
  const listId = await openList();
  if (!listId) return;
  await query(
    `DELETE FROM shopping_list_recipe WHERE list_id = $1 AND recipe_id = $2`,
    [listId, recipeId],
  );
}

/**
 * 담은 요리들의 재료를 합산해 3단으로 가른다.
 *
 * SQL 은 db/schema.sql 끝의 "핵심 쿼리 3개" 중 (3)번 그대로다.
 * 거기가 원본이고 여기가 복사본이다 — 컬럼을 바꾸면 양쪽을 같이 고쳐라
 * (tools/verify_migration.py 가 그쪽을 실제 스키마에 대고 파싱시킨다).
 *
 * "집에 있는 재료" 는 이 SQL 에 없다. 그건 DB 에 없고 주소에만 있어서
 * (지시서 6장) 질의로는 못 본다 — 결과를 받은 뒤 아래에서 덮는다.
 * 그래서 이 SQL 은 schema.sql 의 (3)번과 계속 같은 모양으로 남는다.
 */
const NEED_SQL = `
WITH picked AS (
    -- 택1 그룹에서 살 것 하나만 고른다. 고른 게 있으면 그것,
    -- 아무도 안 골랐으면 첫 번째. 하나도 안 사면 요리를 못 한다.
    SELECT DISTINCT ON (ri.recipe_id, ri.choice_group) ri.id
      FROM recipe_ingredient ri
      JOIN shopping_list_recipe slr ON slr.recipe_id = ri.recipe_id
     WHERE slr.list_id = $1
       AND ri.choice_group IS NOT NULL
     ORDER BY ri.recipe_id, ri.choice_group, ri.confirmed DESC, ri.id
),
need AS (
    SELECT ri.ingredient_id,
           -- 사전에 못 붙인 표기는 이름별로 따로 나간다. ingredient_id
           -- 로만 묶으면 미분류가 전부 NULL 한 줄로 뭉친다.
           CASE WHEN ri.ingredient_id IS NULL THEN ri.raw_name END AS raw_key,
           MIN(ri.raw_name) AS label
      FROM recipe_ingredient ri
      JOIN shopping_list_recipe slr ON slr.recipe_id = ri.recipe_id
      LEFT JOIN ingredient i ON i.id = ri.ingredient_id
     WHERE slr.list_id = $1
       AND (ri.origin <> 'BODY' OR ri.confirmed)     -- 미확인 BODY 는 제외
       AND (ri.choice_group IS NULL
            OR ri.id IN (SELECT id FROM picked))     -- 택1 은 고른 것만
       AND COALESCE(i.purchasable, TRUE)             -- 물 같은 건 빼고
     GROUP BY ri.ingredient_id,
              CASE WHEN ri.ingredient_id IS NULL THEN ri.raw_name END
)
SELECT n.ingredient_id, n.raw_key, n.label,
       CASE
         WHEN p.purchased_on IS NULL                      THEN 'BUY'
         WHEN CURRENT_DATE - p.purchased_on
              > COALESCE(i.shelf_life_days, 7)            THEN 'BUY'
         WHEN CURRENT_DATE - p.purchased_on
              > COALESCE(i.shelf_life_days, 7) / 2        THEN 'CHECK'
         ELSE 'HAVE'
       END AS bucket,
       CASE WHEN p.purchased_on IS NOT NULL THEN
         CASE CURRENT_DATE - p.purchased_on
           WHEN 0 THEN '오늘 샀어요'
           WHEN 1 THEN '어제 샀어요'
           ELSE (CURRENT_DATE - p.purchased_on) || '일 전에 샀어요'
         END
       END AS reason
  FROM need n
  LEFT JOIN ingredient i ON i.id = n.ingredient_id
  LEFT JOIN LATERAL (
       SELECT purchased_on FROM purchase
        WHERE ingredient_id = n.ingredient_id
        ORDER BY purchased_on DESC LIMIT 1
  ) p ON TRUE
 ORDER BY 4, COALESCE(i.aisle, 'zz'), n.label`;

/**
 * 장보기 목록을 다시 계산해서 `shopping_item` 에 반영한다.
 *
 * 버킷은 볼 때마다 다시 잰다 — 어제 산 게 오늘은 CHECK 가 될 수 있고,
 * 담은 요리가 바뀌면 필요한 재료도 바뀐다. 굳혀두면 틀린 걸 보여준다.
 * 사용자가 체크해둔 것만 이름으로 물려준다.
 */
export async function items(
  listId: number | null,
  /**
   * 집에 있다고 눌러둔 재료. 저장하지 않는다 — 주소에만 산다 (지시서 6장).
   * 상시 재고를 만들면 갱신을 안 해서 어긋난다.
   *
   * 사전에 붙은 것은 id 로, 안 붙은 것은 레시피에 적힌 표기로 맞춘다
   * (lib/fridge.types.ts). 사전에 없는 재료가 더 많아서, id 만 보면
   * 대부분을 "집에 있어요" 라고 말할 수가 없다.
   *
   * 여기 있는 재료는 "집에 있을 거예요" 로 내린다. 구매 기록을 만들지는
   * **않는다** — 집에 있다는 건 오늘 샀다는 뜻이 아니다. 없는 날짜를
   * 지어내면 다음 주에 "3일 전에 샀어요" 같은 거짓말이 나온다.
   */
  have: Have = NO_HAVE,
): Promise<ShoppingItem[]> {
  if (!listId) return [];

  return tx(async (q) => {
    // 이미 체크한 것은 있던 칸에 그대로 둔다.
    //
    // 체크하면 구매 기록이 생기고, 다시 재면 그 항목은 "집에 있을 거예요"
    // 로 옮겨간다 — 맞는 계산이지만 마트에서 담자마자 칸이 바뀌면 어디까지
    // 샀는지 놓친다. 장보기가 끝나면 어차피 새 목록이 열린다.
    const before = await q<{ label: string; bucket: Bucket; reason: string | null }>(
      `SELECT label, bucket, reason FROM shopping_item
        WHERE list_id = $1 AND checked`,
      [listId],
    );
    const frozen = new Map(before.map((r) => [r.label, r]));

    const fresh = await q<{
      ingredient_id: number | null;
      label: string;
      bucket: Bucket;
      reason: string | null;
    }>(NEED_SQL, [listId]);

    await q(`DELETE FROM shopping_item WHERE list_id = $1`, [listId]);

    const rows: ShoppingItem[] = [];
    for (const r of fresh) {
      const kept = frozen.get(r.label);
      // 집에 있다고 한 것은 살 것에서 내린다. 이미 체크한 항목은 그대로
      // 둔다 — 마트에서 칸이 바뀌면 어디까지 샀는지 놓친다.
      const athomeNow = atHome(have, r.ingredient_id, r.label);
      const row: ShoppingItem = {
        ingredient_id: r.ingredient_id,
        label: r.label,
        bucket: kept ? kept.bucket : athomeNow ? "HAVE" : r.bucket,
        reason: kept
          ? kept.reason
          : athomeNow
            ? "집에 있다고 하셨어요"
            : r.reason,
        checked: Boolean(kept),
      };
      await q(
        `INSERT INTO shopping_item
           (list_id, ingredient_id, label, bucket, reason, checked)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [listId, row.ingredient_id, row.label, row.bucket, row.reason, row.checked],
      );
      rows.push(row);
    }
    return rows;
  });
}

/**
 * 같은 목록을 **요리별로** 묶어서 낸다.
 *
 * 합친 목록은 마트에서 훑기 좋지만 "이게 왜 필요한지" 가 안 보인다.
 * 요리별로 접어두면 김치삼겹살찜을 눌러 그 요리에 살 것만 볼 수 있다.
 *
 * **재료를 새로 계산하지 않는다.** 합친 목록(items)이 쓰는 것과 같은
 * 이름(label)만 요리별로 모아 온다 — 화면은 그 이름으로 합친 목록의
 * 상태(칸·체크·근거)를 그대로 읽는다. 그래서 대파가 세 요리에 들어가도
 * **항목은 하나**고, 한 군데서 체크하면 세 군데가 다 체크된다.
 * 따로 계산하면 두 벌이 생기고, 두 벌은 반드시 갈라진다.
 */
export async function groups(listId: number | null): Promise<RecipeGroup[]> {
  if (!listId) return [];
  return query<RecipeGroup>(
    `WITH picked AS (
         SELECT DISTINCT ON (ri.recipe_id, ri.choice_group) ri.id
           FROM recipe_ingredient ri
           JOIN shopping_list_recipe slr ON slr.recipe_id = ri.recipe_id
          WHERE slr.list_id = $1
            AND ri.choice_group IS NOT NULL
          ORDER BY ri.recipe_id, ri.choice_group, ri.confirmed DESC, ri.id
     ),
     need AS (
         SELECT ri.recipe_id, ri.ingredient_id, ri.raw_name,
                CASE WHEN ri.ingredient_id IS NULL THEN ri.raw_name END AS raw_key
           FROM recipe_ingredient ri
           JOIN shopping_list_recipe slr ON slr.recipe_id = ri.recipe_id
           LEFT JOIN ingredient i ON i.id = ri.ingredient_id
          WHERE slr.list_id = $1
            AND (ri.origin <> 'BODY' OR ri.confirmed)
            AND (ri.choice_group IS NULL OR ri.id IN (SELECT id FROM picked))
            AND COALESCE(i.purchasable, TRUE)
     ),
     -- 합친 목록이 쓰는 것과 **같은 이름**을 만든다 (NEED_SQL 의 label)
     merged AS (
         SELECT ingredient_id, raw_key, MIN(raw_name) AS label
           FROM need
          GROUP BY ingredient_id, raw_key
     )
     SELECT slr.recipe_id, r.title, slr.day_of_week AS day,
            COALESCE(
              array_agg(DISTINCT m.label) FILTER (WHERE m.label IS NOT NULL),
              '{}'
            ) AS labels
       FROM shopping_list_recipe slr
       JOIN recipe r ON r.id = slr.recipe_id
       LEFT JOIN need n ON n.recipe_id = slr.recipe_id
       LEFT JOIN merged m
              ON m.ingredient_id IS NOT DISTINCT FROM n.ingredient_id
             AND m.raw_key IS NOT DISTINCT FROM n.raw_key
      WHERE slr.list_id = $1
      GROUP BY slr.recipe_id, r.title, slr.day_of_week
      ORDER BY slr.day_of_week NULLS LAST, r.title`,
    [listId],
  );
}

/**
 * 체크하면 구매 기록이 생긴다 (지시서 3장).
 *
 * 새 입력을 요구하지 않는다 — 장보기 체크라는 기존 행동에 얹는다 (원칙 ③).
 * 사전에 못 붙인 항목은 `ingredient_id` 가 없어서 기록을 못 남긴다.
 * 추측해서 붙이지 않는다 — 사전에 들어와야 추적이 시작된다.
 */
export async function toggle(label: string, checked: boolean): Promise<void> {
  const listId = await openList();
  if (!listId) return;

  await tx(async (q) => {
    const rows = await q<{ ingredient_id: number | null }>(
      `UPDATE shopping_item SET checked = $3
        WHERE list_id = $1 AND label = $2
        RETURNING ingredient_id`,
      [listId, label, checked],
    );
    if (!checked) return;

    for (const r of rows) {
      if (r.ingredient_id === null) continue;
      // 같은 날 두 번 체크해도 기록은 하나다.
      await q(
        `INSERT INTO purchase (ingredient_id, purchased_on, source)
         SELECT $1, CURRENT_DATE, 'CHECKOFF'
          WHERE NOT EXISTS (
            SELECT 1 FROM purchase
             WHERE ingredient_id = $1 AND purchased_on = CURRENT_DATE)`,
        [r.ingredient_id],
      );
    }
  });
}

/** 장보기 끝. 목록을 닫는다 — 다음에 담으면 새 목록이 열린다. */
export async function finish(): Promise<void> {
  const listId = await openList();
  if (!listId) return;
  await query(
    `UPDATE shopping_list SET status = 'DONE', completed_at = now()
      WHERE id = $1`,
    [listId],
  );
}
