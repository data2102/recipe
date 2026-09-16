/**
 * 식단 — 날짜를 쭉 늘어놓는다 (이번 주 + 다음 주 열나흘)
 *
 * 예전에는 이 화면이 **추천 화면**이었다 — 오늘의 제안, 다른 메뉴도
 * 있어요, 그 아래 접힌 "이번 주 식단". 고르는 일과 보는 일이 겹쳐서
 * 자주 하는 쪽(뭘 먹기로 했더라)이 아래로 밀렸고, 이번 주/다음 주
 * 탭까지 있어서 날짜 하나 확인하려고 두 번을 오갔다.
 *
 * 고르는 건 메뉴 고르기 탭이 한다 (`/recipes` — 거기서 날짜를 골라
 * 담는다). 여기는 **정해진 걸 보고 옮기는 자리**다.
 *
 * 추천 자체를 지운 건 아니다 (`lib/recipes.ts` 의 suggest·weave 는
 * 그대로 있다). 이 화면에서 뺀 것뿐이다 — 되살릴 자리는 메뉴 고르기다.
 */

import Link from "next/link";
import Plan, { type PlanDay, type PlanDish } from "./Plan";
import { Broken, Setup } from "./Shell";
import { dbUrl } from "@/lib/db";
import { dateRange, todayInput } from "@/lib/say";
import { notes } from "@/lib/notes";
import { exclusions } from "@/lib/shopping";
import { horizon } from "@/lib/week";
import { NO_HAVE, type Have } from "@/lib/fridge.types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function load() {
  const weeks = await horizon();
  const dates = weeks.flatMap((w) => w.dates);
  const [note, ...have] = await Promise.all([
    notes(dates[0], dates[dates.length - 1]),
    ...weeks.map((w) => exclusions(w.listId)),
  ]);

  // 두 주를 한 줄로 이어붙인다. 어느 목록에서 왔는지는 들고 다닌다 —
  // 날짜를 옮길 때 저쪽 주에서 떼야 한다 (actions.ts planOnDate).
  const dishes: PlanDish[] = weeks.flatMap((w) =>
    w.plan.map((p) => ({ ...p, which: w.which })),
  );

  const days: PlanDay[] = dates.map((iso, i) => ({
    iso,
    which: i < 7 ? ("this" as const) : ("next" as const),
    note: note[iso] ?? "",
    dishes: dishes.filter((d) => d.plannedOn === iso),
  }));

  return {
    days,
    loose: dishes.filter((d) => d.plannedOn === null),
    picked: dishes.length,
    have: {
      this: have[0] ?? NO_HAVE,
      next: have[1] ?? NO_HAVE,
    } as Record<"this" | "next", Have>,
    from: dates[0],
    to: dates[dates.length - 1],
  };
}

export default async function Home() {
  if (!dbUrl()) return <Setup />;
  const data = await load().catch((e: Error) => ({ error: e.message }));
  if ("error" in data) return <Broken message={data.error} />;

  const today = todayInput();
  const left = data.days.filter(
    (d) => d.iso >= today && d.dishes.length === 0 && !d.note,
  ).length;

  return (
    <main className={`shell compact-page ${styles.home}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>식단</h1>
        <p className={styles.sub}>
          {dateRange(data.from, data.to)} · 담은 메뉴 {data.picked}개
          {left > 0 ? ` · 안 정한 날 ${left}일` : ""}
        </p>
      </header>

      {data.picked === 0 && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>아직 담은 메뉴가 없어요</h2>
          <p className={styles.body}>
            메뉴 고르기에서 먹고 싶은 걸 고르면 날짜를 물어보고, 그 날짜에
            바로 담아드려요.
          </p>
          <Link href="/recipes" className="ds-btn ds-btn-primary ds-btn-block">
            메뉴 고르러 가기
          </Link>
        </section>
      )}

      <Plan
        days={data.days}
        loose={data.loose}
        have={data.have}
        today={today}
      />

      {/*
        **탭바에 이미 있는 곳은 여기 또 적지 않는다.** 예전에는 "메뉴
        고르기 →" 와 "장보기 →" 가 여기 있었는데, 둘 다 화면 아래
        탭바에 그대로 있는 곳이다 (docs/ui-references.md 9장).

        지난 주는 탭이 없다 — **화면은 셋**이라는 규칙을 지키려고 탭으로
        안 올렸고, 그래서 들어가는 길이 여기 하나다.
      */}
      <nav className={styles.after} aria-label="이어서 할 일">
        <Link href="/weeks" className={styles.more}>
          지난 주 보기 →
        </Link>
      </nav>
    </main>
  );
}
