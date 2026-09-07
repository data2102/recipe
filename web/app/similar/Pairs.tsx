"use client";

/**
 * 닮은 짝 목록 — 두 레시피를 나란히 놓고 하나를 고른다
 *
 * **판정하지 않는다.** 왜 닮았다고 봤는지만 적고, 지울지 말지는 사람이
 * 정한다 (원칙 ③). 같은 이름이어도 다른 레시피일 수 있다 — 엄마 레시피와
 * 유튜브 레시피가 둘 다 '김치찌개' 다.
 *
 * 자동 병합은 없다. 두 레시피를 합치면 어느 쪽 재료·만드는 법을 남길지
 * 골라야 하는데, 그건 "고치기" 화면이 이미 하는 일이다 — 여기서는 남길
 * 것을 열어 고치고 나머지를 지운다.
 *
 * 지우는 건 되돌릴 수 없어서 그 줄이 한 번 더 묻는다 (RecipeRow 와 같은
 * 방식). 실제로 지우는 일은 `recipes.remove` 한 군데다.
 */

import Link from "next/link";
import { useState } from "react";
import { dropRecipe } from "../actions";
import { cookedAgo, dateSay } from "@/lib/say";
import type { Pair, Side } from "@/lib/similar";
import styles from "./similar.module.css";

/** 재료를 몇 개까지 적어 보여줄까. 판단에 필요한 만큼만 */
const SHOW_ITEMS = 8;

/** 왜 닮았다고 봤나. 숫자만 던지지 않고 문장으로 적는다 (지시서 5장) */
function why(p: Pair): string {
  const parts: string[] = [];
  if (p.byName >= 0.8) parts.push("이름이 거의 같아요");
  else if (p.byName >= 0.3) parts.push("이름이 닮았어요");
  if (p.byItems > 0) {
    parts.push(`재료 ${p.total}가지 중 ${p.shared}가지가 같아요`);
  }
  return parts.join(" · ") || "닮은 데가 있어요";
}

export default function Pairs({ list }: { list: Pair[] }) {
  /** 지우기를 누른 레시피. 한 번 더 묻는 동안만 */
  const [asking, setAsking] = useState<number | null>(null);

  function Row({ r }: { r: Side }) {
    const shown = r.items.slice(0, SHOW_ITEMS);
    const rest = r.items.length - shown.length;
    return (
      <div className={styles.side}>
        <div className={styles.head}>
          <span className={styles.title}>{r.title}</span>
          {/* cookedAgo 가 "아직 안 만들어봤어요" 까지 그대로 낸다 */}
          <span className={styles.when}>
            {dateSay(r.saved_on)} 저장 · {cookedAgo(r.last_cooked_on)}
          </span>
        </div>

        <p className={styles.items}>
          {r.items.length === 0
            ? "재료가 안 붙어 있어요"
            : shown.join(" · ") + (rest > 0 ? ` … +${rest}` : "")}
        </p>

        {asking === r.id ? (
          <div className={styles.ask}>
            <p className={styles.askText}>
              지우면 재료·만드는 법·만든 기록까지 같이 사라져요. 되돌릴 수 없어요.
            </p>
            <div className={styles.buttons}>
              <form action={dropRecipe}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="ds-btn ds-btn-primary">
                  지울게요
                </button>
              </form>
              <button
                type="button"
                className="ds-btn ds-btn-secondary"
                onClick={() => setAsking(null)}
              >
                돌아가기
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.buttons}>
            <Link
              href={`/recipe/${r.id}`}
              className="ds-btn ds-btn-secondary"
            >
              열어보기
            </Link>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={() => setAsking(r.id)}
            >
              지울게요
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {list.map((p) => (
        <section key={`${p.a.id}-${p.b.id}`} className="ds-card">
          <h2 className={styles.why}>{why(p)}</h2>
          {/*
            문턱을 정하려면 숫자가 보여야 한다. 이 화면은 "몇 쌍이 실제로
            걸리나" 를 재는 자리이기도 해서, 근거를 문장으로 적고 숫자를
            작게 덧붙인다 (lib/similar.ts 머리말).
          */}
          <p className={styles.score}>
            이름 {Math.round(p.byName * 100)}% · 재료{" "}
            {p.total > 0 ? `${p.shared}/${p.total}` : "없음"}
          </p>

          <div className={styles.pair}>
            <Row r={p.a} />
            <Row r={p.b} />
          </div>
        </section>
      ))}
    </>
  );
}
