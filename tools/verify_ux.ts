/** Regression scenarios against a disposable local PostgreSQL database.
 * Apply migrations and db/seed_dictionary.sql first. No real recipes are required.
 * TEST_DATABASE_URL must explicitly name a local recipe_ux_test database.
 */
import assert from "node:assert/strict";
import { sortRecipes } from "../web/lib/recipe-sort";
import { query } from "../web/lib/db";
import {
  addRecipe,
  openList,
  weekStart,
  whichOf,
  items,
  groups,
  toggle,
  exclusions,
  setExclusion,
  finish,
} from "../web/lib/shopping";
import { setDay, plan, horizon, pickable } from "../web/lib/week";
import { notes, setNote } from "../web/lib/notes";
import { addDays, dayIndex, mondayOf, todayInput } from "../web/lib/say";
import { suggest, searchRecipes, recipeCatalog } from "../web/lib/recipes";
import { remaining } from "../web/lib/shopping.types";

async function main() {
  const sorting = [
    { id: 1, title: '가 요리', created_at: '2026-01-01T00:00:00Z', last_cooked_on: '2026-09-10' },
    { id: 2, title: '나 요리', created_at: '2026-02-01T00:00:00Z', last_cooked_on: '2026-09-01' },
    { id: 3, title: '다 요리', created_at: '2026-03-01T00:00:00Z', last_cooked_on: '2026-09-05' },
  ];
  for (const filter of ['all', 'new', 'cooked']) {
    assert.deepEqual(sortRecipes(sorting, filter, 'name').map(r => r.id), [1, 2, 3]);
    assert.deepEqual(sortRecipes(sorting, filter, 'default').map(r => r.id), filter === 'cooked' ? [2, 3, 1] : [3, 2, 1]);
  }
  assert.deepEqual(sorting.map(r => r.id), [1, 2, 3], 'Sorting does not mutate catalog');
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
    await query(
      `INSERT INTO recipe_ingredient (recipe_id, raw_name, origin, confirmed)
      SELECT $1, '추가재료' || n, 'USER', true FROM generate_series(1, 5) n`,
      [a],
    );
    const catalog = await recipeCatalog();
    const card = catalog.find((r) => r.id === a)!;
    assert(
      card.ingredients.includes("추가재료5"),
      "Search includes ingredients beyond first four",
    );
    assert(
      !card.ingredients.includes("확인 안 된 재료"),
      "Unconfirmed BODY candidates excluded",
    );
    assert.equal(card.photoId, null);
    assert(Number.isFinite(Date.parse(card.created_at)), "Catalog includes registration timestamp");
    await query(
      `DELETE FROM recipe_ingredient WHERE recipe_id = $1 AND raw_name LIKE '추가재료%'`,
      [a],
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

    /* 날짜가 주를 정한다 — 화면이 보낸 주가 아니라 (actions.ts planOnDate) */
    const monday = mondayOf(todayInput());
    assert.equal(whichOf(monday), "this");
    assert.equal(whichOf(addDays(monday, 6)), "this");
    assert.equal(whichOf(addDays(monday, 7)), "next");
    assert.equal(whichOf(addDays(monday, 13)), "next");
    assert.equal(whichOf(addDays(monday, 14)), null, "다다음 주는 담을 데가 없다");
    assert.equal(whichOf(addDays(monday, -1)), null);

    /* 식단은 두 주를 열나흘로 이어 본다 (lib/week.ts horizon) */
    const span = await horizon();
    assert.deepEqual(
      span.flatMap((w) => w.dates),
      Array.from({ length: 14 }, (_, i) => addDays(monday, i)),
      "이번 주 월요일부터 열나흘",
    );

    /* 그날의 메모 — 비우면 지운다 */
    const noteDay = addDays(monday, 8);
    await setNote(noteDay, "  저녁 약속  ");
    assert.equal((await notes(monday, addDays(monday, 13)))[noteDay], "저녁 약속");
    await setNote(noteDay, "회식");
    assert.equal((await notes(noteDay, noteDay))[noteDay], "회식");
    await setNote(noteDay, "   ");
    assert.deepEqual(await notes(noteDay, noteDay), {}, "빈 메모는 행을 남기지 않는다");
    assert.deepEqual(
      await notes(addDays(monday, -30), addDays(monday, -20)),
      {},
      "범위 밖의 메모는 안 딸려온다",
    );

    /* 담기 화면이 날짜를 물어볼 때 쓰는 것 */
    await setDay(a, dayIndex(addDays(monday, 9)), "next");
    await setNote(addDays(monday, 10), "외식");
    const pick = await pickable();
    assert.equal(pick.days.length, 14);
    assert.deepEqual(
      pick.days.filter((d) => d.which === "next").map((d) => d.iso),
      Array.from({ length: 7 }, (_, i) => addDays(monday, 7 + i)),
    );
    assert.deepEqual(
      pick.days.find((d) => d.iso === addDays(monday, 9))?.titles,
      ["UXTEST 오늘 요리"],
      "그날 담긴 메뉴가 고르는 자리에 보인다",
    );
    assert.equal(pick.days.find((d) => d.iso === addDays(monday, 10))?.note, "외식");
    assert.deepEqual(pick.placed[a], [
      { date: null, which: "this" },
      { date: addDays(monday, 9), which: "next" },
    ]);
    assert.deepEqual(pick.placed[b], [{ date: null, which: "next" }]);
    await setNote(addDays(monday, 10), "");
    console.log("PASS: dates decide the week, day notes, and date-first picking");

    /*
      같은 표기가 사전에 붙은 행과 못 붙은 행으로 갈리면 장보기에 두 줄이
      된다 — 마트에서 두 단을 산다. 화면에는 한 줄만 낸다 (lib/shopping.ts).
    */
    await query(
      `INSERT INTO recipe_ingredient (recipe_id, raw_name, raw_qty, ingredient_id, origin, confirmed)
       VALUES ($1, '양파', '2개', NULL, 'LIST', true)`,
      [b],
    );
    const dup = await items(nextId);
    assert.equal(
      dup.filter((i) => i.label === "양파").length,
      1,
      "같은 이름은 한 줄로 낸다",
    );
    assert.equal(
      dup.find((i) => i.label === "양파")?.ingredient_id,
      ing.id,
      "남는 줄은 살 것부터 — 사는 게 안 사는 것보다 되돌리기 쉽다",
    );
    await query(
      `DELETE FROM recipe_ingredient WHERE recipe_id=$1 AND ingredient_id IS NULL AND raw_name='양파'`,
      [b],
    );
    console.log("PASS: one line per name in the merged shopping list");
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
