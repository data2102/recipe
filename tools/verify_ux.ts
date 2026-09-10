/** Regression scenarios against a disposable local PostgreSQL database.
 * Apply migrations and db/seed_dictionary.sql first. No real recipes are required.
 * TEST_DATABASE_URL must explicitly name a local recipe_ux_test database.
 */
import assert from "node:assert/strict";
import { query } from "../web/lib/db";
import {
  addRecipe,
  openList,
  weekStart,
  items,
  groups,
  toggle,
  exclusions,
  setExclusion,
  finish,
} from "../web/lib/shopping";
import { setDay, plan } from "../web/lib/week";
import { suggest, searchRecipes } from "../web/lib/recipes";
import { remaining } from "../web/lib/shopping.types";

async function main() {
  const raw = process.env.TEST_DATABASE_URL;
  assert(raw, "TEST_DATABASE_URL is required (never uses DATABASE_URL)");
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/recipe_ux_test",
    "Use a disposable local recipe_ux_test database",
  );
  process.env.DATABASE_URL = raw;
  process.env.DB_POOL_MAX = "1";
  assert.equal(
    (await query(`SELECT id FROM shopping_list`)).length,
    0,
    "Test requires no shopping lists",
  );
  const [ing] = await query<{ id: number }>(
    `SELECT id FROM ingredient WHERE canonical_name = '양파'`,
  );
  assert(ing, "Apply dictionary seed first");
  const inserted = await query<{
    id: number;
  }>(`INSERT INTO recipe (title, status, last_cooked_on)
    VALUES ('UXTEST 오늘 요리', 'GOOD', CURRENT_DATE), ('UXTEST 새 요리', 'WISH', NULL) RETURNING id`);
  const [a, b] = inserted.map((r) => r.id);
  const listIds: number[] = [];
  try {
    await query(
      `INSERT INTO recipe_ingredient (recipe_id, raw_name, raw_qty, ingredient_id, origin, confirmed)
      VALUES ($1, '양파', '1개', $3, 'LIST', true), ($2, '양파', '1/2개', $3, 'LIST', true),
      ($1, 'UXTEST 미분류', '약간', NULL, 'LIST', true),
      ($1, '확인 안 된 재료', '1개', NULL, 'BODY', false)`,
      [a, b, ing.id],
    );
    await addRecipe(a, "this");
    await addRecipe(a, "next");
    await addRecipe(b, "next");
    const thisId = (await openList(false, "this"))!;
    const nextId = (await openList(false, "next"))!;
    listIds.push(thisId, nextId);
    assert.notEqual(thisId, nextId);
    await setDay(a, 2, "next");
    assert.equal(
      (await plan(nextId, weekStart("next"))).find((r) => r.recipe_id === a)
        ?.day,
      2,
    );
    assert.equal((await plan(thisId, weekStart("this")))[0].day, null);
    await finish("next");
    await setDay(a, 4, "next");
    assert.equal(
      (await plan(nextId, weekStart("next"))).find((r) => r.recipe_id === a)
        ?.day,
      4,
      "Shopping completion must not block meal planning",
    );
    await query(`UPDATE shopping_list SET status='OPEN' WHERE id=$1`, [nextId]);
    console.log(
      "PASS: week-targeted day changes, including after shopping completion",
    );

    let cart = await items(nextId);
    assert.equal(cart.filter((i) => i.label === "양파").length, 1);
    assert(!cart.some((i) => i.label === "확인 안 된 재료"));
    const grouped = await groups(nextId);
    assert.deepEqual(
      grouped
        .flatMap((g) =>
          g.quantities.filter((q) => q.label === "양파").map((q) => q.qty),
        )
        .sort(),
      ["1/2개", "1개"].sort(),
    );
    await setExclusion("양파", true, "next");
    await setExclusion("UXTEST 미분류", true, "next");
    assert((await exclusions(nextId)).ids.includes(ing.id));
    assert.deepEqual(await exclusions(thisId), { ids: [], names: [] });
    cart = await items(nextId);
    assert.equal(remaining(cart), 0);
    assert.equal(
      (await items(nextId)).find((i) => i.label === "양파")?.bucket,
      "HAVE",
      "Repeated reads preserve exclusions",
    );
    await setExclusion("양파", false, "next");
    await setExclusion("UXTEST 미분류", false, "next");
    assert.equal(remaining(await items(nextId)), 2);
    console.log(
      "PASS: merged quantity evidence and dated exclusions, including unmapped names",
    );

    await items(thisId);
    await toggle("양파", true, "this");
    await toggle("양파", true, "this");
    await toggle("양파", true, "next");
    let events = await query(
      `SELECT id FROM purchase WHERE ingredient_id=$1 AND source LIKE 'CHECKOFF:%'`,
      [ing.id],
    );
    assert.equal(events.length, 2, "One event per list, not per repeated tap");
    await toggle("양파", false, "next");
    events = await query(
      `SELECT id FROM purchase WHERE ingredient_id=$1 AND source LIKE 'CHECKOFF:%'`,
      [ing.id],
    );
    assert.equal(events.length, 1, "Undo must preserve the other list event");
    assert.equal(
      (await items(nextId)).find((i) => i.label === "양파")?.bucket,
      "CHECK",
      "Recent purchase is not proof of stock",
    );
    await toggle("양파", false, "this");
    assert.equal(
      (
        await query(
          `SELECT id FROM purchase WHERE ingredient_id=$1 AND source LIKE 'CHECKOFF:%'`,
          [ing.id],
        )
      ).length,
      0,
    );
    console.log(
      "PASS: idempotent purchases, scoped undo, conservative stock inference",
    );

    let found = false;
    const first = await suggest(0, [b]);
    for (let i = 0; i < first.pages; i++) {
      const result = await suggest(i, [b]);
      const ids = [...result.old, ...result.fresh].map((r) => r.id);
      assert(!ids.includes(b));
      if (ids.includes(a)) found = true;
    }
    assert(found, "Recently cooked recipe stays eligible");
    assert.equal((await searchRecipes("UXTEST")).length, 2);
    assert.equal((await searchRecipes("' OR 1=1 --")).length, 0);
    assert((await searchRecipes("양파")).some((r) => r.id === a));
    console.log(
      "PASS: recent recipe fallback, exclusion before paging, title/ingredient search",
    );
  } finally {
    for (const id of listIds)
      await query(`DELETE FROM purchase WHERE source LIKE $1`, [
        `CHECKOFF:${id}:%`,
      ]);
    await query(`DELETE FROM shopping_list WHERE id=ANY($1::bigint[])`, [
      listIds,
    ]);
    await query(`DELETE FROM recipe WHERE id=ANY($1::bigint[])`, [[a, b]]);
    await globalThis.__recipePool?.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
