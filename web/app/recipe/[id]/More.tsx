"use client";

/**
 * 더보기 — 자주 안 하지만 있어야 하는 둘
 *
 *   ① 다른 날에 만들었어요 — 그날 체크를 못 하고 다음날 하는 경우가 흔하고,
 *      처음 데이터를 채울 때는 "두 달 전쯤" 이 필요하다 (지시서 3장).
 *   ② 레시피 삭제 — 되돌릴 수 없어서 화면이 한 번 더 묻는다.
 *
 * 예전에는 목록 줄의 "⋯" 안에 있었다 (app/RecipeRow.tsx). 목록이 카드로
 * 바뀌면서 그 줄이 없어졌는데, 두 기능을 같이 잃을 수는 없다 — 레시피
 * 한 건에 대한 일이니 레시피 화면으로 옮겼다.
 *
 * 접어둔다. 늘 하는 일(담기·만들었어요)은 위에 있고, 여기는 찾아서 하는
 * 일이다. 펴두면 "지울게요" 가 늘 화면에 있다.
 */

import { useState } from "react";
import { dropRecipe, markCooked } from "../../actions";
import Fold from "../../Fold";
import styles from "./recipe.module.css";

export default function More({ id, today }: { id: number; today: string }) {
  const [dropping, setDropping] = useState(false);

  return (
    <section className={`ds-card ${styles.more}`}>
      <Fold title="더보기">

      <form action={markCooked} className={styles.pickDay}>
        <input type="hidden" name="id" value={id} />
        <div className="ds-field">
          <label className="ds-label" htmlFor={`cooked-${id}`}>
            다른 날에 만들었어요
          </label>
          <input
            id={`cooked-${id}`}
            className="ds-input"
            type="date"
            name="cookedOn"
            defaultValue={today}
            max={today}
          />
          <span className="ds-help">
            정확하지 않아도 돼요. 순서만 맞으면 됩니다.
          </span>
        </div>
        <button type="submit" className="ds-btn ds-btn-secondary ds-btn-block">
          이 날로 기록
        </button>
      </form>

      {dropping ? (
        <div className={styles.drop}>
          <p className={styles.body}>
            이 레시피를 지울게요. 재료·만드는 법·만든 기록까지 같이 사라지고
            되돌릴 수 없어요.
          </p>
          <form action={dropRecipe}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="ds-btn ds-btn-primary ds-btn-block"
            >
              지울게요
            </button>
          </form>
          <button
            type="button"
            className="ds-btn ds-btn-secondary ds-btn-block"
            onClick={() => setDropping(false)}
          >
            돌아가기
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.quiet}
          onClick={() => setDropping(true)}
        >
          레시피 삭제
        </button>
      )}
      </Fold>
    </section>
  );
}
