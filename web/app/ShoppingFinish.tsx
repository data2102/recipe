"use client";

/**
 * 장보기를 끝낸다 — 두 보기(합쳐서·요리별)가 같이 쓴다
 *
 * 목록을 어떻게 보든 끝내는 방법은 하나여야 한다. 보기마다 따로 두면
 * 한쪽에서만 고쳐져서 "요리별로 보면 끝낼 수가 없다" 같은 게 생긴다.
 *
 * 체크가 하나도 없으면 못 누른다. 아무것도 안 담고 끝내면 다음 주에
 * "산 적 없어요" 만 남는다.
 */

import { finishShopping } from "./actions";
import styles from "./Shopping.module.css";

export default function ShoppingFinish({ bought }: { bought: number }) {
  return (
    /* PC 에서 두 칸으로 벌어져도 이건 통으로 간다 (globals.css 의 .wide) */
    <div className="wide">
      <p className={styles.note}>
        체크하면 &quot;오늘 샀다&quot;로 기록해둘게요. 다음에 살 때가 됐는지
        여기서 알려드려요.
      </p>

      <form action={finishShopping}>
        <button
          type="submit"
          className="ds-btn ds-btn-primary ds-btn-block"
          disabled={bought === 0}
        >
          {bought > 0 ? `장보기 끝 (${bought}개 담음)` : "장보기 끝"}
        </button>
      </form>
    </div>
  );
}
