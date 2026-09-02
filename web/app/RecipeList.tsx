/**
 * 레시피 목록 한 덩어리 — 세 화면이 같은 모양을 쓴다
 *
 * 행 자체는 RecipeRow 가 그린다. 여기 있는 건 "여러 줄을 어떻게 묶는가" 다.
 * 화면마다 따로 그리면 한 화면만 좋아지고 나머지는 뒤처진다.
 */

import RecipeRow from "./RecipeRow";
import type { RecipeRow as Row } from "@/lib/recipes";
import { OLD_DAYS, cookedAgo, daysSince, ingredientSummary } from "@/lib/say";
import styles from "./page.module.css";

/** 빈 화면. 사과 말고 초대다 (design-system.md 7장 마이크로카피) */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ds-empty ${styles.empty}`}>
      <p>{children}</p>
    </div>
  );
}

export function rows(
  list: Row[],
  today: string,
  mode: "wish" | "cooked",
  pick?: "add" | "in",
  inBasket?: Set<number>,
  week?: "this" | "next",
) {
  return list.map((r) => {
    const days = daysSince(r.last_cooked_on);
    return (
      <RecipeRow
        key={r.id}
        id={r.id}
        title={r.title}
        sourceUrl={r.source_url}
        today={today}
        week={week}
        pick={pick === "add" && inBasket?.has(r.id) ? "in" : pick}
        warm={mode === "cooked" && days !== null && days >= OLD_DAYS}
        meta={
          mode === "cooked"
            ? cookedAgo(r.last_cooked_on)
            : ingredientSummary(r.ingredients, Boolean(r.source_url))
        }
      />
    );
  });
}

export default function List({
  list,
  today,
  mode,
  empty,
  pick,
  inBasket,
  week,
}: {
  list: Row[];
  today: string;
  mode: "wish" | "cooked";
  empty: string;
  pick?: "add" | "in";
  inBasket?: Set<number>;
  week?: "this" | "next";
}) {
  if (list.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className={styles.list}>
      {rows(list, today, mode, pick, inBasket, week)}
    </ul>
  );
}
