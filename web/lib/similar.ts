/**
 * 닮은 레시피 찾기 (지시서 9장 "중복 레시피 병합 기준" 의 첫 조각)
 *
 * **판정하지 않는다. 짝을 지어 근거만 보여준다** (원칙 ③).
 * 같은 이름이어도 다른 레시피일 수 있다 — 엄마 레시피와 유튜브 레시피가
 * 둘 다 '김치찌개' 다. 어느 쪽을 남길지는 사람만 안다.
 *
 * **문턱을 일부러 낮게 잡았다.** 이 화면은 "몇 쌍이 실제로 걸리나" 를
 * 재는 자리이기도 하다. 실측 없이 문턱을 지어내면 그게 다시 틀린 판정이
 * 된다 (사전을 문서 예시로 채우지 않는 것과 같은 이유). 눌러보고 나서
 * 저장 확인 화면에 붙일 값을 정한다.
 *
 * 새 컬럼도 확장(pg_trgm)도 안 쓴다. 신호는 이미 테이블에 다 있고,
 * 셈은 여기 순수 함수에서 한다 — 레시피가 수백 건이어도 짝 계산은
 * 밀리초다 (100건 = 4,950쌍).
 */

import { query } from "./db";
import { key } from "./parse/normalize";

/** 이 아래는 안 보여준다. 낮게 잡아 눈으로 걸러낸다 */
export const FLOOR = 0.3;

/**
 * 재료가 이만큼은 겹쳐야 "재료가 닮았다" 로 센다.
 *
 * 재료 두세 개짜리(제목만 저장한 것 등)는 뭐에나 포함돼서, 개수를 안 보면
 * 아무 상관 없는 짝이 100% 로 올라온다.
 *
 * **3에서 4로 올렸다.** 김치찌개와 제육볶음이 돼지고기·양파·대파 세 가지로
 * 이어져서, 묶음으로 낼 때 제육볶음이 김치찌개 계열에 딸려 들어왔다.
 * 한국 요리는 셋 정도는 그냥 겹친다 — 넷이 넘어야 근거가 된다.
 *
 * 재료가 셋 이하인 레시피는 재료로는 안 걸린다. 그건 이름으로 잡는다.
 */
const MIN_SHARED = 4;

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
): { score: number; shared: number; total: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0, total: 0 };
  let hit = 0;
  let all = 0;
  let shared = 0;
  const seen = new Set<string>();
  for (const v of [...a, ...b]) {
    if (seen.has(v)) continue;
    seen.add(v);
    const w = weight.get(v) ?? 1;
    all += w;
    if (a.has(v) && b.has(v)) {
      hit += w;
      shared++;
    }
  }
  return { score: all === 0 ? 0 : hit / all, shared, total: seen.size };
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
export async function groups(): Promise<{
  list: Group[];
  recipes: number;
  found: number;
}> {
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

  const found: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const byName = jaccard(names[i], names[j]).score;
      const it = weighted(bags[i], bags[j], weight);
      // 겹친 재료가 몇 개 안 되면 비율이 커도 근거가 아니다
      const byItems = it.shared >= MIN_SHARED ? it.score : 0;
      const score = Math.max(byName, byItems);
      if (score < FLOOR) continue;
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
