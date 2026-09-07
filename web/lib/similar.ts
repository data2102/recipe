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
 * 재료 두 개짜리(제목만 저장한 것 등)는 뭐에나 포함돼서, 개수를 안 보면
 * 아무 상관 없는 짝이 100% 로 올라온다.
 */
const MIN_SHARED = 3;

/** 한 화면에 이만큼만. 더 있으면 그렇다고 적는다 */
export const MAX_PAIRS = 40;

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
 * 닮은 짝. 닮은 순으로.
 *
 * 미확인 BODY 재료는 뺀다 — 2패스가 지어냈을 수 있는 것들이라, 사용자가
 * 넣겠다고 한 것만으로 잰다 (lib/week.ts 와 같은 규칙).
 */
export async function pairs(): Promise<{ list: Pair[]; recipes: number; found: number }> {
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

  const found: Pair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const byName = jaccard(names[i], names[j]).score;
      const it = jaccard(bags[i], bags[j]);
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

  found.sort((x, y) => y.score - x.score || x.a.id - y.a.id);
  return {
    list: found.slice(0, MAX_PAIRS),
    recipes: rows.length,
    found: found.length,
  };
}
