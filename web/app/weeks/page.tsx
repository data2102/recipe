/**
 * 지난 주 — 이미 지나간 주들
 *
 * **날짜로 가른다.** 오늘이 속한 주보다 앞에서 시작한 주가 여기 온다
 * (lib/weeks.ts). 장보기를 끝냈는지는 상관없다 — 안 끝낸 채 지나간
 * 주도 지난 주고, 화면에 "안 끝냈어요" 라고 적힌다.
 *
 * 하는 일은 셋이다.
 *   ① 그 주에 뭘 담았는지 되짚어 본다 — **펼치면 이레가 날짜로 나온다**
 *   ② 뭘 만들었고 뭘 못 만들었는지 본다
 *   ③ 잘못 끝냈으면 **되돌린다**
 *
 * 펼친 안쪽은 식단 화면과 같은 모양이다 (날짜 · 그날 먹은 것). 다만
 * **여기서는 아무것도 못 바꾼다** — 지나간 주의 날짜를 옮기는 건 기록을
 * 고치는 일이다. 되돌릴 수 있는 건 "장보기 끝" 하나뿐이다.
 *
 * 되돌리기는 지금 열린 목록이 없을 때만 낸다. 두 주가 동시에 열리면
 * "이번 주" 가 뭔지 알 수 없다.
 */

import Link from "next/link";
import { reopenWeek } from "../actions";
import Fold from "../Fold";
import { Broken, Setup } from "../Shell";
import { dbUrl } from "@/lib/db";
import {
  addDays,
  dateRange,
  dateSay,
  dayIndex,
  monthWeek,
  whenShort,
} from "@/lib/say";
import { notes } from "@/lib/notes";
import { DAYS } from "@/lib/week.types";
import { dishesOf, past, type PastDish, type PastWeek } from "@/lib/weeks";
import styles from "../page.module.css";
import weekStyles from "./weeks.module.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "지난 주" };

type Loaded =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      list: PastWeek[];
      dishes: PastDish[];
      note: Record<string, string>;
    };

async function load(): Promise<Loaded> {
  try {
    const list = await past();
    if (list.length === 0)
      return { kind: "ok", list, dishes: [], note: {} };

    // 주마다 따로 묻지 않는다 — 한 번에 가져와서 화면에서 나눈다.
    // 메모도 마찬가지로 제일 오래된 주부터 제일 최근 주 끝까지 한 번에.
    const oldest = list[list.length - 1].opened_on;
    const newest = addDays(list[0].opened_on, 6);
    const [dishes, note] = await Promise.all([
      dishesOf(list.map((w) => w.id)),
      notes(oldest, newest),
    ]);
    return { kind: "ok", list, dishes, note };
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
        data.list.map((w) => {
          const mine = data.dishes.filter((d) => d.list_id === w.id);
          const dates = Array.from({ length: 7 }, (_, i) =>
            addDays(w.opened_on, i),
          );
          const loose = mine.filter((d) => d.day === null);
          const made = mine.filter((d) => d.cooked).length;

          return (
            <section key={w.id} className="ds-card">
              {/*
                접힌 채로도 그 주가 어땠는지 한 줄로 알 수 있어야 한다.
                펼쳐야만 보이면 열두 주를 다 펼쳐보게 된다.
              */}
              <Fold
                title={monthWeek(w.opened_on)}
                hint={`${
                  w.closed_on ? `${whenShort(w.closed_on)} 끝냈어요` : "안 끝냈어요"
                } · ${
                  mine.length > 0
                    ? `담은 ${mine.length} · 만든 ${made}`
                    : "담은 요리 없음"
                }`}
              >

              {/*
                **그 주 이레를 그대로 적는다.** 예전에는 "연 날 ~ 끝낸 날" 이라
                끝낸 날이 주 중간이면 기간이 짧게 나왔다. 이제 주는 날짜가
                정하니까 (월요일부터 이레) 끝낸 날은 위 줄이 따로 말한다.
              */}
              <p className={weekStyles.range}>
                {dateRange(dates[0], dates[6])}
              </p>

              {/* 식단 화면과 같은 모양 — 날짜가 세로로, 그 밑에 그날 먹은 것 */}
              <div className={weekStyles.days}>
                {dates.map((iso) => {
                  const day = mine.filter((d) => d.day === dayIndex(iso));
                  const memo = data.note[iso];
                  return (
                    <div key={iso} className={weekStyles.day}>
                      <h3 className={weekStyles.dayName}>
                        <span>{dateSay(iso)}</span>
                        <span className={weekStyles.weekday}>
                          ({DAYS[dayIndex(iso)]})
                        </span>
                      </h3>
                      {memo && <p className={weekStyles.memo}>{memo}</p>}
                      {day.length > 0 ? (
                        <ul className={weekStyles.dishes}>
                          {day.map((d) => (
                            <li key={d.recipe_id}>
                              <Link href={`/recipe/${d.recipe_id}`}>
                                {d.title}
                              </Link>
                              {/*
                                담은 것과 만든 것은 다르다. 담아놓고 못 만든
                                날이 흔한데, 한 줄로 합치면 그게 안 보인다.
                              */}
                              <span className={weekStyles.mark}>
                                {d.cooked ? "만들었어요" : "안 만들었어요"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={weekStyles.none}>
                          {memo ? "" : "안 정했어요"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {loose.length > 0 && (
                <div className={weekStyles.day}>
                  <h3 className={weekStyles.dayName}>
                    <span>날짜 미정</span>
                    <span className={weekStyles.weekday}>{loose.length}개</span>
                  </h3>
                  <ul className={weekStyles.dishes}>
                    {loose.map((d) => (
                      <li key={d.recipe_id}>
                        <Link href={`/recipe/${d.recipe_id}`}>{d.title}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
              </Fold>
            </section>
          );
        })
      )}
    </main>
  );
}
