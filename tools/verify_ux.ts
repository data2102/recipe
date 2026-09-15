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
import {
  addDays,
  cookedAgo,
  dateFull,
  dateRange,
  dateSay,
  dateTiny,
  daysFrom,
  daysSince,
  dayIndex,
  ingredientSummary,
  mondayOf,
  monthWeek,
  todayInput,
  whenShort,
} from "../web/lib/say";
import {
  suggest,
  searchRecipes,
  recipeCatalog,
  detail,
  remove as dropRecipe,
} from "../web/lib/recipes";
import { picked, removeRecipe } from "../web/lib/shopping";
import {
  past as pastWeeks,
  week as weekOf,
  reopen,
  dishesOf,
} from "../web/lib/weeks";
import { attachTarget } from "../web/lib/photos";
import {
  recordAsset,
  recordParsed,
  save,
  saveTitleOnly,
  assetKeys,
} from "../web/lib/parse/store";
import { loadDictionary, normalize } from "../web/lib/parse/normalize";
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

  /*
   * 앱의 시계는 한국이다 (lib/say.ts TZ).
   *
   * 서버는 UTC 로 돈다. 그냥 두면 한국 새벽 0~9시에 "오늘" 이 어제가 되고,
   * 밤에 만들고 체크한 게 **어제 만든 것으로 기록된다.** 여기가 그 경계다.
   */
  assert.equal(
    todayInput(new Date("2026-09-14T15:30:00Z")),
    "2026-09-15",
    "한국 9/15 새벽 0:30 은 9월 15일이다 (UTC 로는 아직 14일)",
  );
  assert.equal(todayInput(new Date("2026-09-15T14:59:00Z")), "2026-09-15");
  assert.equal(
    todayInput(new Date("2026-09-15T15:00:00Z")),
    "2026-09-16",
    "한국 자정이 지나면 다음 날",
  );

  const noon = new Date("2026-09-15T03:00:00Z"); // 한국 9/15 정오
  assert.equal(daysSince("2026-09-15", noon), 0);
  assert.equal(daysSince("2026-09-14", noon), 1);
  assert.equal(daysSince(null, noon), null);

  // 숫자만 던지지 않는다 — 문장으로 말한다 (지시서 5장)
  assert.equal(cookedAgo(null, noon), "아직 안 만들어봤어요");
  assert.equal(cookedAgo("2026-09-15", noon), "오늘 만들었어요");
  assert.equal(cookedAgo("2026-09-14", noon), "어제 만들었어요");
  assert.equal(cookedAgo("2026-07-08", noon), "69일 전에 만들었어요");
  assert.equal(whenShort("2026-09-13", noon), "2일 전");

  // 날짜 말은 한 군데에 있다. 화면마다 toLocaleDateString 을 부르지 마라
  assert.equal(dateTiny("2026-09-01"), "9/1");
  assert.equal(dateSay("2026-09-01"), "9월 1일");
  assert.equal(dateFull("2026-09-01"), "9월 1일(화)");
  assert.equal(dateRange("2026-08-31", "2026-09-06"), "8월 31일 ~ 9월 6일");
  assert.equal(dateRange("2026-09-01", "2026-09-01"), "9월 1일", "하루면 한 번만 적는다");
  assert.equal(monthWeek("2026-09-08"), "9월 2주차");

  // 날짜 셈은 문자열로 한다 — Date 로 넘기면 시간대가 따라붙어 하루씩 밀린다
  assert.deepEqual(daysFrom("2026-08-31", 3), ["2026-08-31", "2026-09-01", "2026-09-02"]);
  assert.equal(addDays("2026-02-28", 1), "2026-03-01", "2026 년은 윤년이 아니다");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(dayIndex("2026-09-14"), 0, "0 = 월요일");
  assert.equal(dayIndex("2026-09-20"), 6, "6 = 일요일");
  assert.equal(mondayOf("2026-09-20"), "2026-09-14", "일요일은 그 주 월요일에 속한다");
  assert.equal(mondayOf("2026-09-14"), "2026-09-14");

  // 재료가 없어도 할 말이 있어야 한다 (원칙 ③)
  assert.equal(ingredientSummary([], false), "재료는 아직 안 넣었어요");
  assert.equal(ingredientSummary([], true), "재료는 링크에서 확인해요");
  assert.equal(ingredientSummary(["양파", "대파"], true), "양파 · 대파");
  console.log("PASS: Korean clock, date arithmetic, and saying it in words");
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
  const extra: number[] = []; // 테스트가 새로 만드는 레시피 — 실패해도 치운다
  const assets: number[] = [];
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

    /*
      **매대 순서.** 칸(BUY/CHECK/HAVE) 안에서는 마트 동선대로 선다 —
      같은 구역을 두 번 안 가려는 것이다.

      예전에는 COALESCE(i.aisle, 'zz') 였는데 거꾸로 돌았다: 한글이 'z' 보다
      뒤라 ('청과' > 'zz' 가 참) **매대를 모르는 미분류가 맨 위로** 왔다.
    */
    assert.equal(
      (await query<{ ok: boolean }>(`SELECT '청과' > 'zz' AS ok`))[0].ok,
      true,
      "한글 매대명은 'zz' 보다 뒤다 — 파수꾼 문자열을 쓰면 안 되는 이유",
    );
    const aisled = await items(thisId);
    const 양파 = aisled.findIndex((i) => i.label === "양파");
    const 미분류 = aisled.findIndex((i) => i.label === "UXTEST 미분류");
    assert(양파 >= 0 && 미분류 >= 0, "둘 다 목록에 있다");
    assert(
      양파 < 미분류,
      "매대를 아는 재료가 먼저 온다 — 모르는 것이 맨 뒤 (NULLS LAST)",
    );
    /*
      **칸이 먼저, 그 안에서 매대.** 자릿수(ORDER BY 4)로 정렬하다가 컬럼을
      하나 끼워 넣는 순간 조용히 매대 기준으로 정렬됐다 — 실제로 그랬다.
      순서가 뒤집히면 "사야 해요" 와 "있는지 봐주세요" 가 섞여 나온다.
    */
    //  칸이 둘로 갈려야 잴 수 있다 — 양파를 오늘 산 것으로 만들어 CHECK 로
    //  보낸다 (미분류는 구매 이력이 없으니 BUY 로 남는다).
    await query(
      `INSERT INTO purchase (ingredient_id, purchased_on, source)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, 'UXTEST-order')`,
      [ing.id],
    );
    const mixed = await items(thisId);
    const rank = { BUY: 0, CHECK: 1, HAVE: 2 } as const;
    assert(
      new Set(mixed.map((i) => i.bucket)).size > 1,
      "칸이 둘 이상이어야 이 검사가 뜻이 있다",
    );
    assert.deepEqual(
      mixed.map((i) => rank[i.bucket]),
      [...mixed.map((i) => rank[i.bucket])].sort((x, y) => x - y),
      "칸이 먼저다 — 매대가 칸을 앞지르면 '사야 해요' 와 '있는지 봐주세요' 가 섞인다",
    );
    await query(`DELETE FROM purchase WHERE source = 'UXTEST-order'`);
    assert(
      aisled.every((i) => "aisle" in i),
      "매대가 화면까지 따라온다 (shopping_item 에 굳히지 않는다)",
    );
    assert.equal(
      aisled.find((i) => i.label === "양파")?.aisle,
      "청과",
      "사전이 아는 매대를 그대로 낸다",
    );
    assert.equal(
      aisled.find((i) => i.label === "UXTEST 미분류")?.aisle,
      null,
      "모르는 건 null 이다 — 지어내지 않는다",
    );
    console.log("PASS: known aisles come first, buckets still lead the order");

    /* 담기와 빼기는 그 주 목록에만 걸린다 */
    assert.deepEqual(
      (await picked(thisId)).map((r) => r.title),
      ["UXTEST 오늘 요리"],
    );
    await removeRecipe(b, "next");
    assert(
      !(await picked(nextId)).some((r) => r.id === b),
      "뺀 요리는 그 주 목록에서 사라진다",
    );
    assert(
      (await picked(thisId)).some((r) => r.id === a),
      "다른 주 목록은 안 건드린다",
    );
    await addRecipe(b, "next");

    /* 상세 화면이 읽는 것 — 확인 안 된 재료도 보여준다 (흐리게 적는다) */
    const one = await detail(a);
    assert.equal(one?.title, "UXTEST 오늘 요리");
    assert(one!.items.some((i) => i.raw_name === "양파" && i.confirmed));
    assert(
      one!.items.some((i) => i.raw_name === "확인 안 된 재료" && !i.confirmed),
      "장보기에서 뺀 재료도 레시피에는 적혀 있던 것이다 (원칙 ①)",
    );
    assert.equal(await detail(2147483000), null, "없는 레시피는 null");

    /*
      레시피를 지운다 — **shopping_list_recipe 만 CASCADE 가 없다.**
      (지난 주 기록이 요리 하나 지웠다고 사라지면 안 되니까.)
      그래서 손으로 먼저 떼야 지워진다. 그 순서가 recipes.remove 안에 있고,
      누가 "간단히" 한 줄로 줄이면 여기서 외래키에 걸려 막힌다.
    */
    const [doomed] = await query<{ id: number }>(
      `INSERT INTO recipe (title, status) VALUES ('UXTEST 지울 요리', 'WISH') RETURNING id`,
    );
    extra.push(doomed.id);
    await query(
      `INSERT INTO recipe_ingredient (recipe_id, raw_name, origin, confirmed)
       VALUES ($1, '양파', 'LIST', true)`,
      [doomed.id],
    );
    await query(
      `INSERT INTO cook_log (recipe_id, cooked_on)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date)`,
      [doomed.id],
    );
    await addRecipe(doomed.id, "this");
    await dropRecipe(doomed.id); // 담긴 채로 지운다
    for (const [table, why] of [
      ["recipe", "레시피가 사라진다"],
      ["recipe_ingredient", "재료는 CASCADE 로 같이"],
      ["cook_log", "조리 기록도 같이"],
    ] as const) {
      const left = await query(
        `SELECT 1 FROM ${table} WHERE ${table === "recipe" ? "id" : "recipe_id"} = $1`,
        [doomed.id],
      );
      assert.equal(left.length, 0, why);
    }
    assert.equal(
      (await query(`SELECT 1 FROM shopping_list_recipe WHERE recipe_id = $1`, [doomed.id]))
        .length,
      0,
      "담겨 있던 줄도 떨어진다",
    );
    assert.equal(
      (await query(`SELECT 1 FROM shopping_list WHERE id = $1`, [thisId])).length,
      1,
      "**목록 자체는 남는다** — 요리 하나 지웠다고 그 주가 사라지면 안 된다",
    );
    assert(
      (await picked(thisId)).some((r) => r.id === a),
      "같은 목록의 다른 요리도 남는다",
    );
    console.log("PASS: deleting a recipe that is still in a list");

    /*
      지난 주 — 끝낸 장보기를 지우지 않는다. 목록 하나가 지난 한 주다.
      되돌리기는 상태 한 줄이면 된다 (승격이라는 게 없어졌다).
    */
    const [old] = await query<{ id: number }>(
      `INSERT INTO shopping_list (starts_on, status, completed_at)
       VALUES ($1::date, 'DONE', now()) RETURNING id`,
      [addDays(monday, -14)],
    );
    listIds.push(old.id);
    await query(
      `INSERT INTO shopping_list_recipe (list_id, recipe_id, day_of_week)
       VALUES ($1, $2, 2)`,
      [old.id, a],
    );
    const seen = await pastWeeks();
    const mine = seen.find((w) => w.id === old.id);
    assert(mine, "지난 주가 목록에 나온다");
    assert.equal(mine!.opened_on, addDays(monday, -14));
    assert.deepEqual(mine!.titles, ["UXTEST 오늘 요리"]);
    assert(mine!.closed_on, "끝낸 날이 적힌다");
    assert.deepEqual(
      mine!.cooked,
      [],
      "담은 것과 만든 것은 다르다 — 담아만 두고 안 만든 주가 흔하다",
    );
    assert(
      !seen.some((w) => w.id === thisId || w.id === nextId),
      "이번 주와 다음 주는 지난 주가 아니다",
    );
    await reopen(old.id);
    const back = await weekOf(old.id);
    assert.equal(back!.closed_on, null, "다시 열면 끝낸 날이 지워진다");
    assert.deepEqual(
      back!.titles,
      ["UXTEST 오늘 요리"],
      "되돌려도 담았던 요리는 그대로 — 상태 한 줄만 바뀐다",
    );
    /*
      지난 주를 펼치면 이레가 날짜로 나온다 (app/weeks/page.tsx).
      주마다 따로 묻지 않고 한 번에 가져온다 — 접속이 하나뿐인 데서
      열두 주가 스물네 번 왕복이면 그대로 줄을 선다.
    */
    const [logged] = await query<{ id: number }>(
      `INSERT INTO cook_log (recipe_id, cooked_on)
       VALUES ($1, $2::date + 2) RETURNING id`,
      [a, addDays(monday, -14)],
    );
    const backlog = await dishesOf([old.id, thisId]);
    const mineAgain = backlog.filter((d) => d.list_id === old.id);
    assert.deepEqual(
      mineAgain.map((d) => [d.title, d.day, d.cooked]),
      [["UXTEST 오늘 요리", 2, true]],
      "그 주의 그 날짜에 만든 기록이 있으면 만든 것으로 센다",
    );
    assert(
      backlog.some((d) => d.list_id === thisId),
      "여러 주를 한 번에 가져온다",
    );
    await query(`UPDATE cook_log SET cooked_on = $2::date + 3 WHERE id = $1`, [
      logged.id,
      addDays(monday, -14),
    ]);
    assert.equal(
      (await dishesOf([old.id]))[0].cooked,
      false,
      "**그 날짜**에 만든 것만 센다 — 같은 주 다른 날에 만든 건 그날 만든 게 아니다",
    );
    await query(`DELETE FROM cook_log WHERE id = $1`, [logged.id]);
    console.log("PASS: past weeks are kept and reopening only flips the status");

    /*
      사진은 조리 기록에 붙는다. 한 번 만들 때 한 장이고, 만든 날 바로
      안 올리는 게 보통이라 며칠 창을 둔다 (photos.ATTACH_WITHIN_DAYS).
    */
    assert.equal(await attachTarget(b), null, "만든 기록이 없으면 붙일 데가 없다");
    const [shot] = await query<{ id: number }>(
      `INSERT INTO cook_log (recipe_id, cooked_on)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date) RETURNING id`,
      [b],
    );
    assert.equal((await attachTarget(b))?.id, shot.id, "오늘 만든 기록에 붙는다");
    await query(`UPDATE cook_log SET photo_key = 'x' WHERE id = $1`, [shot.id]);
    assert.equal(
      await attachTarget(b),
      null,
      "사진이 이미 있는 기록에는 덮어쓰지 않는다 — 먼저 올린 게 소리 없이 사라진다",
    );
    await query(
      `UPDATE cook_log SET photo_key = NULL,
              cooked_on = (now() AT TIME ZONE 'Asia/Seoul')::date - 10
        WHERE id = $1`,
      [shot.id],
    );
    assert.equal(
      await attachTarget(b),
      null,
      "열흘 전 기록은 창 밖이다 — 없는 날짜를 지어내지 않는다",
    );
    await query(`DELETE FROM cook_log WHERE id = $1`, [shot.id]);
    console.log("PASS: photos attach to a cook log, never overwrite, never invent a date");

    /* ---------------------------------------------------------------- */
    /*  저장 흐름 (/add) — lib/parse/store.ts                            */
    /* ---------------------------------------------------------------- */

    const dict = await loadDictionary();

    // 원본은 파싱보다 **먼저** 보관한다 (원칙 ⑤). 파싱이 실패해도 남아야
    // 재파싱할 수 있다.
    const assetId = await recordAsset(
      { kind: "IMAGE", storageKey: "uxtest/capture.png", rawText: null },
      "UXTEST-1",
    );
    assets.push(assetId);
    assert.deepEqual(
      (await assetKeys([assetId])).map((r) => r.storage_key),
      ["uxtest/capture.png"],
      "아직 레시피가 안 된 원본은 다시 꺼내 쓸 수 있다 (공유받은 캡처 되살리기)",
    );

    const rows = normalize(
      [
        { raw_name: "양파", raw_qty: "1개", section: "재료", origin: "LIST", evidence: null },
        { raw_name: "간장", raw_qty: "2T", section: "양념", origin: "LIST", evidence: null },
        { raw_name: "UXTEST 듣보재료", raw_qty: "약간", section: null, origin: "LIST", evidence: null },
        { raw_name: "참기름", raw_qty: null, section: null, origin: "BODY", evidence: "조리 단계에만 나와요" },
      ],
      [],
      dict,
    );
    assert.equal(rows[0].ingredient_id, ing.id, "사전에 있는 건 붙는다");
    assert.equal(rows[1].ingredient_id, null, "AMBIGUOUS 는 단정하지 않는다");
    assert.equal(
      rows[1].recordUnmapped,
      false,
      "**AMBIGUOUS 는 미분류가 아니다** — 사전에 후보가 있으니 쌓지 않는다",
    );
    assert.equal(rows[2].recordUnmapped, true, "사전에 없는 표기만 쌓는다");

    const before = await query<{ hit_count: number }>(
      `SELECT hit_count FROM unmapped_term WHERE raw_name = 'UXTEST 듣보재료'`,
    );
    const saved = await save({
      title: "UXTEST 저장 흐름",
      steps: ["양파를 볶는다", "간장을 넣고 조린다"],
      rows,
      confirmed: (r) => r.origin !== "BODY", // 화면이 하는 것과 같다
      assetIds: [assetId],
      sourceUrl: "https://example.com/uxtest",
      sourceKind: "IMAGE",
    });
    extra.push(saved);

    const [made] = await query<{ status: string; source_url: string }>(
      `SELECT status, source_url FROM recipe WHERE id = $1`,
      [saved],
    );
    assert.equal(made.status, "WISH", "저장 시점은 '해보고 싶다' 이지 '맛있었다' 가 아니다");
    assert.equal(
      made.source_url,
      "https://example.com/uxtest",
      "화면에 안 보여도 원문 주소는 남는다 (저작권)",
    );

    // 배열로 한 번에 넣는다. 그러면서 **순서가 안 흐트러져야** 한다 —
    // 목록의 재료 요약이 ri.id 순으로 앞 넷을 자른다.
    const stored = await query<{
      raw_name: string;
      raw_qty: string | null;
      section: string | null;
      ingredient_id: number | null;
      confirmed: boolean;
    }>(
      `SELECT raw_name, raw_qty, section, ingredient_id, confirmed
         FROM recipe_ingredient WHERE recipe_id = $1 ORDER BY id`,
      [saved],
    );
    assert.deepEqual(
      stored.map((r) => r.raw_name),
      ["양파", "간장", "UXTEST 듣보재료", "참기름"],
      "배열 순서가 그대로 박힌다",
    );
    assert.equal(stored[0].raw_qty, "1개", "수량은 원문 그대로 (원칙 ①)");
    assert.equal(stored[0].section, "재료");
    assert.equal(stored[0].ingredient_id, ing.id);
    assert.equal(stored[2].ingredient_id, null, "못 붙인 건 NULL 로 둔다 — 추측하지 않는다");
    assert.equal(
      stored[3].confirmed,
      false,
      "조리 단계에만 나온 재료는 사용자가 확인해야 TRUE 다",
    );
    assert.deepEqual(
      (
        await query<{ seq: number; body: string }>(
          `SELECT seq, body FROM recipe_step WHERE recipe_id = $1 ORDER BY seq`,
          [saved],
        )
      ).map((r) => [r.seq, r.body]),
      [
        [1, "양파를 볶는다"],
        [2, "간장을 넣고 조린다"],
      ],
      "만드는 법도 순서대로",
    );

    const after = await query<{ hit_count: number }>(
      `SELECT hit_count FROM unmapped_term WHERE raw_name = 'UXTEST 듣보재료'`,
    );
    assert.equal(
      Number(after[0].hit_count) - Number(before[0]?.hit_count ?? 0),
      1,
      "사전을 키우는 유일한 경로 — 못 붙인 표기가 쌓인다",
    );
    assert.equal(
      (await query(`SELECT 1 FROM unmapped_term WHERE raw_name = '간장'`)).length,
      0,
      "AMBIGUOUS 는 여기 안 들어온다",
    );

    assert.equal(
      (await query<{ recipe_id: number }>(
        `SELECT recipe_id FROM source_asset WHERE id = $1`,
        [assetId],
      ))[0].recipe_id,
      saved,
      "저장이 끝나면 원본에 레시피가 박힌다",
    );
    assert.deepEqual(
      await assetKeys([assetId]),
      [],
      "이미 레시피가 된 원본은 다시 안 준다",
    );
    console.log("PASS: one save writes raw text, dictionary hits, order, and unmapped terms");

    /*
      **같은 초안을 두 번 저장하지 않는다.**

      폰이 잠기거나 지하철에 들어가면 서버는 저장을 끝냈는데 응답만
      사라진다. 사용자 눈에는 실패라서 다시 누른다 — 실제로 두 건이 생겼다.
      화면에서 버튼을 막는 것만으로는 못 막는다.

      (여기서는 접속이 하나라 두 번째가 첫 번째 뒤에 선다. 진짜 동시
       두 트랜잭션의 FOR UPDATE 경합까지는 못 재지만, 다시 누르는 길은
       정확히 이 길이다.)
    */
    const again = await save({
      title: "UXTEST 저장 흐름 (다시 누름)",
      steps: ["다른 내용"],
      rows,
      confirmed: () => true,
      assetIds: [assetId],
      sourceUrl: null,
      sourceKind: "IMAGE",
    });
    assert.equal(again, saved, "두 번째는 새로 만들지 않고 아까 그 id 를 돌려준다");
    assert.equal(
      (await query(`SELECT 1 FROM recipe WHERE title LIKE 'UXTEST 저장 흐름%'`)).length,
      1,
      "레시피는 한 건뿐이다",
    );
    assert.deepEqual(
      (
        await query<{ body: string }>(
          `SELECT body FROM recipe_step WHERE recipe_id = $1 ORDER BY seq`,
          [saved],
        )
      ).map((r) => r.body),
      ["양파를 볶는다", "간장을 넣고 조린다"],
      "먼저 저장된 것을 덮어쓰지도 않는다",
    );

    // 이름만 저장(링크를 못 읽었을 때)도 같은 일을 겪는다. 여긴 붙잡을
    // 원본이 없어서 **몇 분 안쪽 같은 주소**로 본다.
    const linkA = await saveTitleOnly("UXTEST 이름만", "https://example.com/only", "LINK");
    const linkB = await saveTitleOnly("UXTEST 이름만", "https://example.com/only", "LINK");
    extra.push(linkA);
    assert.equal(linkB, linkA, "몇 분 안에 같은 주소면 다시 누른 것이다");
    const linkC = await saveTitleOnly("UXTEST 이름만 2", "https://example.com/other", "LINK");
    extra.push(linkC);
    assert.notEqual(linkC, linkA, "다른 주소는 다른 레시피다");
    const noUrlA = await saveTitleOnly("UXTEST 주소 없음", null, "TEXT");
    const noUrlB = await saveTitleOnly("UXTEST 주소 없음", null, "TEXT");
    extra.push(noUrlA, noUrlB);
    assert.notEqual(
      noUrlB,
      noUrlA,
      "주소가 없으면 같은 것인지 알 수 없다 — 지어내서 합치지 않는다",
    );
    console.log("PASS: the same draft never saves twice");

    /*
      파싱 응답 원문도 적어둔다. **먼저 보관한 원문을 덮어쓰지 않는다** —
      붙여넣기로 들어온 글은 그 자체가 원본이다.
    */
    const pasted = await recordAsset(
      { kind: "TEXT", storageKey: null, rawText: "사용자가 붙여넣은 글" },
      "UXTEST-1",
    );
    const empty = await recordAsset(
      { kind: "IMAGE", storageKey: "uxtest/b.png", rawText: null },
      "UXTEST-1",
    );
    assets.push(pasted, empty);
    await recordParsed([pasted, empty], "파서가 돌려준 응답");
    const texts = await query<{ id: number; raw_text: string; parsed_at: string | null }>(
      `SELECT id, raw_text, parsed_at::text AS parsed_at FROM source_asset
        WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [[pasted, empty]],
    );
    assert.equal(texts[0].raw_text, "사용자가 붙여넣은 글", "있던 원문은 그대로 둔다");
    assert.equal(texts[1].raw_text, "파서가 돌려준 응답", "비어 있던 자리만 채운다");
    assert(texts[0].parsed_at && texts[1].parsed_at, "언제 파싱했는지는 둘 다 적힌다");
    console.log("PASS: the original text is never overwritten by the parser output");
  } finally {
    for (const id of listIds)
      await query(`DELETE FROM purchase WHERE source LIKE $1`, [
        `CHECKOFF:${id}:%`,
      ]);
    await query(`DELETE FROM shopping_list WHERE id=ANY($1::bigint[])`, [
      listIds,
    ]);
    await query(`DELETE FROM recipe WHERE id=ANY($1::bigint[])`, [
      [a, b, ...extra],
    ]);
    await query(`DELETE FROM source_asset WHERE id=ANY($1::bigint[])`, [assets]);
    /*
      **어디서 실패해도 다음 실행이 깨끗해야 한다.**

      위의 id 목록은 실패 지점까지 모은 것만 들고 있다. 중간에 걸리면
      그 뒤에 만들어진 행은 아무도 모르는 채 남고, 다음 실행이 "레시피는
      한 건뿐이다" 같은 데서 엉뚱하게 실패한다 (실제로 겪었다).
      이 DB 는 버리는 것이라(`recipe_ux_test` 만 허용한다) 이름으로 쓸어낸다.
    */
    await query(`DELETE FROM recipe WHERE title LIKE 'UXTEST %'`);
    await query(`DELETE FROM source_asset WHERE parser_version = 'UXTEST-1'`);
    await query(`DELETE FROM unmapped_term WHERE raw_name LIKE 'UXTEST %'`);
    await globalThis.__recipePool?.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
