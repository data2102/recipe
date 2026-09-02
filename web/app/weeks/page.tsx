/**
 * 지난 주 — 끝낸 장보기들
 *
 * 이 앱에서 한 주를 끝내는 건 날짜가 아니라 장보기 끝이다. 그래서
 * 끝낸 목록 하나가 지난 한 주다 (lib/weeks.ts).
 *
 * 하는 일은 둘이다.
 *   ① 그 주에 뭘 담았는지 되짚어 본다
 *   ② 잘못 끝냈으면 **되돌린다**
 *
 * 되돌리기는 지금 열린 목록이 없을 때만 낸다. 두 주가 동시에 열리면
 * "이번 주" 가 뭔지 알 수 없다.
 */

import Link from "next/link";
import { reopenWeek } from "../actions";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import { monthWeek, whenShort } from "@/lib/say";
import { justClosed, past, type PastWeek } from "@/lib/weeks";
import styles from "../page.module.css";
import weekStyles from "./weeks.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "지난 주" };

type Loaded =
  | { kind: "error"; message: string }
  | { kind: "ok"; list: PastWeek[]; undoable: number | null };

async function load(): Promise<Loaded> {
  try {
    const [list, recent] = await Promise.all([past(), justClosed()]);
    return { kind: "ok", list, undoable: recent?.id ?? null };
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function WeeksPage() {
  if (!dbUrl()) return <Setup />;
  const data = await load();
  if (data.kind === "error") return <Broken message={data.message} />;

  return (
    <main className="shell">
      <header className={styles.head}>
        <Link href="/" className={weekStyles.back}>
          ← 식단
        </Link>
        <h1 className={styles.title}>지난 주</h1>
        <p className={styles.sub}>끝낸 장보기 {data.list.length}개</p>
      </header>

      {data.list.length === 0 ? (
        <div className={`ds-empty ${styles.empty}`}>
          <p>장보기를 끝내면 그 주가 여기 남아요.</p>
        </div>
      ) : (
        data.list.map((w) => (
          <section key={w.id} className="ds-card">
            <h2 className={weekStyles.when}>
              {monthWeek(w.opened_on)}
              <span className={weekStyles.range}>
                {w.closed_on ? `${whenShort(w.closed_on)} 끝냈어요` : "안 끝냈어요"}
              </span>
            </h2>
            <p className={weekStyles.range}>
              {w.opened_on}
              {w.closed_on && w.closed_on !== w.opened_on
                ? ` ~ ${w.closed_on}`
                : ""}
            </p>

            {/*
              담은 것과 만든 것을 나눠 적는다. 담아놓고 못 만든 주가
              흔한데, 한 줄로 합치면 그게 안 보인다.
            */}
            <p className={weekStyles.label}>담았어요</p>
            <p className={weekStyles.titles}>
              {w.titles.length > 0
                ? w.titles.join(" · ")
                : "담은 요리가 없었어요"}
            </p>

            <p className={weekStyles.label}>만들었어요</p>
            <p className={weekStyles.titles}>
              {w.cooked.length > 0 ? w.cooked.join(" · ") : "기록이 없어요"}
            </p>

            <p className={weekStyles.bought}>{w.bought}개 샀어요</p>

            {/* 되돌리기는 제일 최근 것 하나에만. 그 위의 주는 이미 지났다 */}
            {data.undoable === w.id && (
              <form action={reopenWeek}>
                <input type="hidden" name="listId" value={w.id} />
                <button
                  type="submit"
                  className="ds-btn ds-btn-secondary ds-btn-block"
                >
                  이 주를 다시 열게요
                </button>
              </form>
            )}
          </section>
        ))
      )}
    </main>
  );
}
