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
    await globalThis.__recipePool?.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
