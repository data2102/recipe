/**
 * 닮은 레시피 찾기 (지시서 9장 "중복 레시피 병합 기준" 의 첫 조각)
 *
 * **판정하지 않는다. 묶어서 근거만 보여준다** (원칙 ③).
 * 같은 이름이어도 다른 레시피일 수 있다 — 엄마 레시피와 유튜브 레시피가
 * 둘 다 '김치찌개' 다. 어느 쪽을 남길지는 사람만 안다.
 *
 * **문턱은 화면에서 고른다** (LEVELS). 실측 없이 코드에 박으면 그게 다시
 * 틀린 판정이 된다 (사전을 문서 예시로 채우지 않는 것과 같은 이유).
 * 눌러보고 맞는 값을 찾은 다음, 저장 확인 화면에 그 값을 쓴다.
 *
 * 새 컬럼도 확장(pg_trgm)도 안 쓴다. 신호는 이미 테이블에 다 있고,
 * 셈은 여기 순수 함수에서 한다 — 레시피가 수백 건이어도 짝 계산은
 * 밀리초다 (100건 = 4,950쌍).
 */

import { query } from "./db";
import { key } from "./parse/normalize";

/**
 * 얼마나 닮아야 묶나. **화면에서 고를 수 있다** (`?min=`).
 *
 * 이 값을 코드에 박아두면 안 된다 — 어느 값이 맞는지는 실제 레시피를 넣어
 * 봐야 알고, 그게 이 화면을 만든 이유다 (lib/similar.ts 머리말). 느슨하면
 * 아닌 것까지 딸려 들어오고 (실제로 "제육볶음 묶음에 제육볶음 아닌 게
 * 하나 있다" 가 나왔다), 엄격하면 진짜 중복을 놓친다.
 *
 * 여기서 고른 값이 나중에 저장 확인 화면에서 "이거 이미 있는 것 같아요"
 * 를 물어보는 기준이 된다.
 */
export const LEVELS = [
  { key: "loose", label: "넉넉하게", min: 0.3 },
  { key: "normal", label: "보통", min: 0.45 },
  { key: "tight", label: "엄격하게", min: 0.6 },
] as const;

export type Level = (typeof LEVELS)[number]["key"];

/**
 * 기본은 제일 넉넉한 쪽.
 *
 * 훑어보는 화면이라 **놓치는 쪽이 더 나쁘다** — 아닌 게 섞여 있으면 눈으로
 * 넘기면 되지만, 안 나온 중복은 찾을 방법이 없다. 30% 가 느슨해 보였던 건
 * 문턱 탓이 아니라 양념·바탕 재료만 겹쳐도 묶였기 때문이고, 그건
 * `rareLimit` 으로 따로 막았다.
 */
export const DEFAULT_LEVEL: Level = "loose";

export function floorOf(level: Level): number {
  return LEVELS.find((l) => l.key === level)?.min ?? 0.45;
}

/**
 * 재료가 이만큼은 겹쳐야 "재료가 닮았다" 로 센다.
 *
 * 재료 한두 개짜리(제목만 저장한 것 등)는 뭐에나 포함돼서, 개수를 안 보면
 * 아무 상관 없는 짝이 100% 로 올라온다.
 */
const MIN_SHARED = 3;

/**
 * **겹친 재료 중에 "그 요리를 그 요리로 만드는 재료" 가 하나는 있어야 한다.**
 *
 * 개수와 비율만으로는 제육볶음과 돼지고기 두루치기를 못 가른다 — 돼지고기·
 * 양파·대파·간장·설탕을 다섯 가지나 같이 쓴다. 실제로 두루치기가 제육볶음
 * 묶음에 들어갔고, **문턱을 올려도 안 빠졌다.** 한국 가정식은 계열째로
 * 같은 바탕을 쓰기 때문이다.
 *
 * 그래서 겹친 재료 중 **드문 것**이 하나는 있어야 재료를 근거로 센다.
 *   - 양념은 아예 안 센다 (사전의 `category='양념'`). 어디에나 들어간다
 *   - 남은 것 중에서도 전체의 1/4 넘게 나오는 건 바탕 재료로 본다
 *
 * 그러면 감바스/버터갈릭새우는 새우·페페론치노로 걸리고, 제육볶음/두루치기는
 * 안 걸린다 (겹친 게 전부 바탕이라서). 제육볶음끼리는 이름으로 걸린다.
 */
function rareLimit(recipes: number): number {
  return Math.max(2, Math.round(recipes / 4));
}

/** 한 화면에 이만큼만. 더 있으면 그렇다고 적는다 */
export const MAX_GROUPS = 30;

export type Side = {
  id: number;
  title: string;
  /** 저장한 날 (한국 기준) */
  saved_on: string;
  last_cooked_on: string | null;
  /** 원문 표기 그대로 (원칙 ①) */
  items: string[];
};

export type Pair = {
  a: Side;
  b: Side;
  /** 둘 중 큰 쪽. 이름이든 재료든 하나만 높아도 볼 만하다 */
  score: number;
  /** 이름 닮은 정도 (0~1) */
  byName: number;
  /** 재료 닮은 정도 (0~1). 겹친 게 MIN_SHARED 미만이면 0 */
  byItems: number;
  /** 겹친 재료 수 · 합친 재료 수 — 화면에 근거로 적는다 */
  shared: number;
  total: number;
};

/**
 * 서로 닮은 것들 한 덩어리.
 *
 * 두 개면 흔한 중복이고, 셋 이상이면 테스트하다 여러 번 넣었거나 변형을
 * 따로 저장한 것이다. 어느 쪽이든 **한 장에 나란히** 놓고 사람이 고른다.
 */
export type Group = {
  /** 저장 순 (오래된 것 먼저) */
  members: Side[];
  /** 이 묶음에서 가장 닮은 짝. 왜 묶였는지 근거로 쓴다 */
  best: Pair;
};

/**
 * 글자 2-gram.
 *
 * 한국어는 형태소 분석기 없이 어간을 못 자른다. 그런데 요리 이름은 짧고
 * 어미 변화가 없어서 글자 단위로 충분하다 — '제육볶음' 과 '매콤제육볶음'
 * 은 2-gram 이 3개 겹친다. 이름이 한 글자면 그 글자 하나를 쓴다.
 */
function grams(s: string): Set<string> {
  const t = key(s);
  if (t.length < 2) return new Set(t ? [t] : []);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number; total: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0, total: 0 };
  let shared = 0;
  for (const v of a) if (b.has(v)) shared++;
  const total = a.size + b.size - shared;
  return { score: total === 0 ? 0 : shared / total, shared, total };
}

/**
 * 재료를 흔한 정도로 깎아서 잰 자카드.
 *
 * **대파·양파는 어디에나 들어간다.** 개수만 세면 김치찌개와 제육볶음이
 * 돼지고기·양파·대파로 3가지 겹쳐서 닮은 짝으로 올라온다 — 냉장고 칩에서
 * "간장 하나 눌렀는데 전부 올라온다" 와 같은 문제다.
 *
 * 그래서 흔한 재료는 무게를 낮춘다 (IDF). 전부에 들어가는 재료는 0 에
 * 가깝고, 한 요리에만 있는 재료는 무겁다. 겹친 **개수**는 화면에 그대로
 * 적는다 — 사람이 읽는 근거는 "몇 가지가 같다" 지 가중치가 아니다.
 */
function weighted(
  a: Set<string>,
  b: Set<string>,
  weight: Map<string, number>,
): { score: number; shared: number; total: number; both: string[] } {
  if (a.size === 0 || b.size === 0) {
    return { score: 0, shared: 0, total: 0, both: [] };
  }
  let hit = 0;
  let all = 0;
  let shared = 0;
  const both: string[] = [];
  const seen = new Set<string>();
  for (const v of [...a, ...b]) {
    if (seen.has(v)) continue;
    seen.add(v);
    const w = weight.get(v) ?? 1;
    all += w;
    if (a.has(v) && b.has(v)) {
      hit += w;
      shared++;
      both.push(v);
    }
  }
  return { score: all === 0 ? 0 : hit / all, shared, total: seen.size, both };
}

/**
 * 닮은 묶음. 닮은 순으로.
 *
 * **짝이 아니라 묶음으로 낸다.** 짝으로 늘어놓으면 닮은 게 4개일 때
 * 카드가 6장이고, 김치찌개가 그중 다섯 장에 나온다 — 실제로 "같은 게
 * 반복된다" 로 보였다. 서로 닮은 것들을 한 덩어리로 묶어 한 장에 낸다.
 *
 * 미확인 BODY 재료는 뺀다 — 2패스가 지어냈을 수 있는 것들이라, 사용자가
 * 넣겠다고 한 것만으로 잰다 (lib/week.ts 와 같은 규칙).
 */
export async function groups(level: Level = DEFAULT_LEVEL): Promise<{
  list: Group[];
  recipes: number;
  found: number;
}> {
  const floor = floorOf(level);
  const rows = await query<Side>(
    `SELECT r.id, r.title,
            (r.created_at AT TIME ZONE 'Asia/Seoul')::date::text AS saved_on,
            r.last_cooked_on::text AS last_cooked_on,
            COALESCE(
              array_agg(ri.raw_name ORDER BY ri.id)
                FILTER (WHERE ri.raw_name IS NOT NULL),
              '{}'
            ) AS items
       FROM recipe r
       LEFT JOIN recipe_ingredient ri
              ON ri.recipe_id = r.id
             AND (ri.origin <> 'BODY' OR ri.confirmed)
      GROUP BY r.id, r.title, r.created_at, r.last_cooked_on
      ORDER BY r.id`,
  );

  /*
    양념 표기 (사전의 `category='양념'`). 표준명과 별칭을 다 모은다 —
    레시피에는 '진간장' 이 아니라 '간장' 으로 적혀 있는 일이 흔하고,
    그건 사전에서 ingredient_id 가 안 붙는 표기다 (AMBIGUOUS).
  */
  const seasonings = new Set(
    (
      await query<{ name: string }>(
        `SELECT i.canonical_name AS name FROM ingredient i WHERE i.category = '양념'
         UNION
         SELECT a.alias FROM ingredient_alias a
           JOIN ingredient i ON i.id = a.ingredient_id
          WHERE i.category = '양념'`,
      )
    ).map((r) => key(r.name)),
  );

  // 미리 한 번만 만들어 둔다. 짝마다 다시 만들면 n² 번 만든다.
  const names = rows.map((r) => grams(r.title));
  const bags = rows.map((r) => new Set(r.items.map(key)));

  /*
    재료마다 무게. 몇 개의 레시피에 들어가는지로 정한다 (IDF) —
    전부에 들어가면 0, 하나에만 있으면 무겁다.
  */
  const seenIn = new Map<string, number>();
  for (const bag of bags) {
    for (const v of bag) seenIn.set(v, (seenIn.get(v) ?? 0) + 1);
  }
  const weight = new Map<string, number>();
  for (const [v, n] of seenIn) weight.set(v, Math.log(rows.length / n));

  /** 드문 재료인가 — 양념도 아니고, 전체의 1/4 안쪽에만 나오는 것 */
  const limit = rareLimit(rows.length);
  const rare = (v: string) =>
    !seasonings.has(v) && (seenIn.get(v) ?? 0) <= limit;

  const found: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const byName = jaccard(names[i], names[j]).score;
      const it = weighted(bags[i], bags[j], weight);
      /*
        재료를 근거로 세는 조건 둘. 개수만으로는 제육볶음과 두루치기를
        못 가른다 — 겹친 것 중에 그 요리다운 재료가 있어야 한다.
      */
      const enough = it.shared >= MIN_SHARED && it.both.some(rare);
      const byItems = enough ? it.score : 0;
      const score = Math.max(byName, byItems);
      if (score < floor) continue;
      found.push({
        a: rows[i],
        b: rows[j],
        score,
        byName,
        byItems,
        shared: it.shared,
        total: it.total,
      });
    }
  }

  /*
    서로 닮은 것들을 한 덩어리로. A~B 와 B~C 가 걸렸으면 A·B·C 가 한 묶음이다
    — 셋을 따로 내면 B 가 두 번 나온다.

    이어붙이기(union-find)라 A 와 C 가 직접 안 닮았어도 같이 묶인다. 그게
    맞다: 셋을 나란히 놓고 사람이 보는 게 목적이고, 한 덩어리로 봐야 어느
    하나를 남길지 정할 수 있다.
  */
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) [x, parent[x]] = [parent[x], r];
    return r;
  };
  const byIndex = new Map(rows.map((r, i) => [r.id, i]));
  for (const p of found) {
    const a = find(byIndex.get(p.a.id)!);
    const b = find(byIndex.get(p.b.id)!);
    if (a !== b) parent[a] = b;
  }

  // 묶음마다 **가장 닮은 짝**을 근거로 들고 간다
  const best = new Map<number, Pair>();
  for (const p of found) {
    const root = find(byIndex.get(p.a.id)!);
    const had = best.get(root);
    if (!had || p.score > had.score) best.set(root, p);
  }

  const members = new Map<number, Side[]>();
  for (const p of found) {
    for (const side of [p.a, p.b]) {
      const root = find(byIndex.get(side.id)!);
      const list = members.get(root) ?? [];
      if (!list.some((m) => m.id === side.id)) list.push(side);
      members.set(root, list);
    }
  }

  const list: Group[] = [...members.entries()]
    .map(([root, mine]) => ({
      // 오래된 것부터. 먼저 저장한 쪽을 남기는 일이 많다
      members: mine
        .slice()
        .sort((x, y) => x.saved_on.localeCompare(y.saved_on) || x.id - y.id),
      best: best.get(root)!,
    }))
    .sort((x, y) => y.best.score - x.best.score);

  return {
    list: list.slice(0, MAX_GROUPS),
    recipes: rows.length,
    found: list.length,
  };
}
