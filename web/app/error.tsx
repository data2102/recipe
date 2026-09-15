"use client";

/**
 * 화면이 통째로 죽었을 때 — 마지막 그물
 *
 * 여기 없으면 Next 기본 오류 화면이 뜬다. 우리 말투도 없고, 무엇보다
 * **다음에 할 일이 안 적혀 있다** (원칙 ③: 사과 말고 다음 걸음).
 *
 * `Shell.tsx` 의 `Broken` 과 다르다. 저쪽은 "DB 에 못 붙었다" 처럼 **우리가
 * 예상한** 실패를 우리 손으로 잡아서 그리는 것이고, 여기는 **예상 못 한**
 * 것이 올라왔을 때 React 가 부르는 자리다.
 *
 * 배포가 바뀌면 열어둔 화면의 서버 함수가 사라진다 ("Server Action ... was
 * not found"). 그건 다시 눌러도 계속 막히는 실패라, 새로고침이 아니라
 * **처음부터 다시 여는 길**을 같이 낸다 (CLAUDE.md).
 */

import Link from "next/link";
import styles from "./page.module.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 배포가 바뀌어 서버 함수가 사라진 경우. 다시 누르는 건 소용이 없다.
  const stale = /server action|was not found/i.test(error.message);

  return (
    <main className="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>화면이 멈췄어요</h1>
        <p className={styles.sub}>
          {stale
            ? "앱이 새로 올라가면서 열어둔 화면이 낡았어요."
            : "담아둔 것은 그대로예요. 무엇을 하려던 거였는지에 따라 아래로 가주세요."}
        </p>
      </header>

      <section className="ds-card">
        {stale ? (
          <p className={styles.body}>
            다시 눌러도 같은 자리에서 막혀요. <strong>화면을 새로 열면</strong>{" "}
            됩니다 — 저장하던 중이었다면 올린 원본은 보관돼 있어요.
          </p>
        ) : (
          <p className={styles.body}>
            잠깐 그런 걸 수도 있어요. 한 번 다시 해보고, 그래도 안 되면 식단으로
            돌아가면 됩니다.
          </p>
        )}

        {!stale && (
          <button
            type="button"
            onClick={reset}
            className="ds-btn ds-btn-primary ds-btn-block"
          >
            다시 해볼게요
          </button>
        )}
        <Link href="/" className="ds-btn ds-btn-secondary ds-btn-block">
          식단으로 가기
        </Link>
      </section>

      {/*
        무슨 일이 있었는지는 적어둔다. 안 적으면 "그냥 안 됐어요" 밖에 못
        말하고, 그러면 고칠 수가 없다. 접어두는 건 평소에 볼 것이 아니라서다.
      */}
      <details className="ds-card">
        <summary className={styles.summary}>무슨 일이 있었나</summary>
        <p className={styles.note}>{error.message}</p>
        {error.digest && <p className={styles.note}>표시: {error.digest}</p>}
      </details>
    </main>
  );
}
