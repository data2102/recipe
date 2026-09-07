/**
 * 지난 주 — 이미 지나간 주들
 *
 * **날짜로 가른다.** 오늘이 속한 주보다 앞에서 시작한 주가 여기 온다
 * (lib/weeks.ts). 장보기를 끝냈는지는 상관없다 — 안 끝낸 채 지나간
 * 주도 지난 주고, 화면에 "안 끝냈어요" 라고 적힌다.
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
import { addDays, dateRange, monthWeek, whenShort } from "@/lib/say";
import { past, type PastWeek } from "@/lib/weeks";
import styles from "../page.module.css";
import weekStyles from "./weeks.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "지난 주" };

type Loaded =
  | { kind: "error"; message: string }
  | { kind: "ok"; list: PastWeek[] };

async function load(): Promise<Loaded> {
  try {
    return { kind: "ok", list: await past() };
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
        <p className={styles.sub}>지나간 주 {data.list.length}개</p>
      </header>

      {data.list.length === 0 ? (
        <div className={`ds-empty ${styles.empty}`}>
          <p>한 주가 지나가면 여기 남아요.</p>
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
            {/*
              **그 주 이레를 그대로 적는다.** 예전에는 "연 날 ~ 끝낸 날" 이라
              끝낸 날이 주 중간이면 기간이 짧게 나왔다. 이제 주는 날짜가
              정하니까 (월요일부터 이레) 끝낸 날은 위 줄이 따로 말한다.
            */}
            <p className={weekStyles.range}>
              {dateRange(w.opened_on, addDays(w.opened_on, 6))}
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

            {/*
              끝낸 주는 아무거나 다시 열 수 있다. 주가 날짜로 정해지면서
              (lib/shopping.ts weekStart) 되돌려도 "이번 주" 가 흔들리지
              않는다 — 예전에는 승격을 되돌려야 해서 최근 것 하나만 됐다.
            */}
            {w.closed_on && (
              <form action={reopenWeek}>
                <input type="hidden" name="listId" value={w.id} />
                <button
                  type="submit"
                  className="ds-btn ds-btn-secondary ds-btn-block"
                >
                  아직 안 끝낸 걸로 돌릴게요
                </button>
              </form>
            )}
          </section>
        ))
      )}
    </main>
  );
}
