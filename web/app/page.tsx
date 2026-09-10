/** Today first; weekly planning remains optional and keeps an explicit week. */
import Link from "next/link";
import List from "./RecipeList";
import Week from "./Week";
import WeekStrip from "./WeekStrip";
import ActionButton from "./ActionButton";
import { addToWeekOn, markCooked } from "./actions";
import { Broken, Setup } from "./Shell";
import { dbUrl } from "@/lib/db";
import { suggest } from "@/lib/recipes";
import {
  addDays,
  dateRange,
  dayIndex,
  daysFrom,
  todayInput,
  cookedAgo,
} from "@/lib/say";
import {
  openList,
  picked,
  weekStart,
  exclusions,
  type Which,
} from "@/lib/shopping";
import { plan as weekPlan } from "@/lib/week";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function load(which: Which, again: number) {
  const listId = await openList(false, which);
  const start = weekStart(which);
  const [basket, plan, have] = await Promise.all([
    picked(listId),
    weekPlan(listId, start),
    exclusions(listId),
  ]);
  const recommendations = await suggest(
    again,
    basket.map((r) => r.id),
  );
  return { basket, plan, have, start, ...recommendations };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  if (!dbUrl()) return <Setup />;
  const params = await searchParams;
  const which: Which = params.week === "next" ? "next" : "this";
  const next = which === "next";
  const again = Math.max(
    0,
    Math.min(999, Math.floor(Number(params.again) || 0)),
  );
  const data = await load(which, again).catch((e: Error) => ({
    error: e.message,
  }));
  if ("error" in data) return <Broken message={data.error} />;
  const today = todayInput();
  const dates = daysFrom(data.start);
  const todays = next ? [] : data.plan.filter((p) => p.plannedOn === today);
  const options = [...data.old, ...data.fresh];
  const hero = !next && todays.length === 0 ? options[0] : null;
  const alternatives = options.filter((r) => r.id !== hero?.id);
  const inBasket = new Set(data.basket.map((r) => r.id));

  return (
    <main className={`shell compact-page ${styles.home}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          {next ? "다음 주 미리 정하기" : "오늘 뭐 먹지?"}
        </h1>
        <p className={styles.sub}>
          {next
            ? dateRange(dates[0], dates[6])
            : "모아둔 레시피로 오늘 한 끼."}
        </p>
      </header>
      <nav className={`ds-tabs ${styles.tabs}`} aria-label="식단 기간">
        <Link
          href="/?week=this"
          className={`ds-tab ${!next ? "on" : ""}`}
          aria-current={!next ? "page" : undefined}
        >
          오늘 · 이번 주
        </Link>
        <Link
          href="/?week=next"
          className={`ds-tab ${next ? "on" : ""}`}
          aria-current={next ? "page" : undefined}
        >
          다음 주
        </Link>
      </nav>

      {todays.length > 0 && (
        <section className={`ds-card ${styles.hero}`}>
          <p className={styles.group}>오늘 먹기로 했어요</p>
          {todays.map((p) => (
            <div key={p.recipe_id} className={styles.todayDish}>
              <h2 className={styles.heroTitle}>{p.title}</h2>
              <div className={styles.quickActions}>
                <Link
                  href={`/recipe/${p.recipe_id}?week=this`}
                  className="ds-btn ds-btn-primary"
                >
                  만드는 법 보기
                </Link>
                {p.cooked ? (
                  <span>만들었어요</span>
                ) : (
                  <ActionButton
                    action={markCooked}
                    fields={{ id: p.recipe_id }}
                    label="만들었어요"
                    doneLabel="기록했어요"
                    className="ds-btn ds-btn-secondary"
                  />
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      {hero && (
        <section className={`ds-card ${styles.hero}`}>
          <p className={styles.group}>오늘의 제안</p>
          <h2 className={styles.heroTitle}>{hero.title}</h2>
          <p className={styles.body}>
            {hero.last_cooked_on
              ? cookedAgo(hero.last_cooked_on)
              : "저장해둔 요리, 이번에 만들어볼까요?"}
          </p>
          {hero.ingredients.length > 0 && (
            <p className={styles.note}>{hero.ingredients.join(" · ")}</p>
          )}
          <div className={styles.quickActions}>
            <ActionButton
              action={addToWeekOn}
              fields={{ id: hero.id, week: "this", day: dayIndex(today) }}
              label="오늘 먹기"
            />
            <Link
              href={`/recipe/${hero.id}?week=this`}
              className={styles.detailLink}
            >
              재료 · 만드는 법
            </Link>
          </div>
        </section>
      )}

      <section aria-label="추천 메뉴">
        <div className={styles.sectionRow}>
          <h2 className={styles.section}>
            {next
              ? "먹을 메뉴를 골라보세요"
              : hero
                ? "다른 메뉴도 있어요"
                : "다른 날 먹을 메뉴"}
          </h2>
          {data.pages > 1 && (
            <Link
              href={`/?week=${which}&again=${again + 1}`}
              className={styles.again}
              scroll={false}
            >
              {data.page === data.pages - 1 ? "처음부터 다시" : "다른 메뉴"}
            </Link>
          )}
        </div>
        <p className={styles.note}>
          담으면 필요한 재료를 장보기에 모아드려요.
        </p>
        <List
          list={alternatives.slice(0, 2)}
          today={today}
          mode="wish"
          pick="add"
          inBasket={inBasket}
          week={which}
          empty={
            data.basket.length
              ? "다른 후보는 모두 담았어요. 식단에서 확인해보세요."
              : hero
                ? "아래에서 다른 레시피를 추가할 수 있어요."
                : "레시피를 추가하면 여기서 메뉴를 골라드려요."
          }
        />
        {alternatives.length > 2 && (
          <details className={styles.extraOptions}>
            <summary className={styles.summary}>
              추천 메뉴 {alternatives.length - 2}개 더 보기
            </summary>
            <List
              list={alternatives.slice(2)}
              today={today}
              mode="wish"
              pick="add"
              inBasket={inBasket}
              week={which}
              empty=""
            />
          </details>
        )}
        <Link href={`/recipes?week=${which}`} className={styles.more}>
          모아둔 레시피에서 고르기 →
        </Link>
        {!options.length && !data.basket.length && (
          <Link href="/add" className="ds-btn ds-btn-primary ds-btn-block">
            첫 레시피 추가하기
          </Link>
        )}
      </section>

      <Link
        href={`/shopping?week=${which}`}
        className={`ds-btn ds-btn-secondary ds-btn-block ${styles.add}`}
      >
        장보기 목록 보기 · 메뉴 {data.basket.length}개
      </Link>
      <details className={`ds-card ${styles.weekSummary}`} open={next || undefined}>
        <summary className={styles.summary}>
          {next ? "다음 주" : "이번 주"} 식단 · {data.basket.length}개{" "}
          <span className={styles.sub}>
            {dateRange(dates[0], addDays(dates[0], 6))}
          </span>
        </summary>
        <p className={styles.note}>날짜를 옮기거나 담은 메뉴를 뺄 수 있어요.</p>
        <WeekStrip plan={data.plan} dates={dates} today={today} />
        <Week
          plan={data.plan}
          have={data.have}
          dates={dates}
          today={today}
          week={which}
        />
      </details>
      <Link href="/weeks" className={styles.more}>
        지난 식단 보기 →
      </Link>
    </main>
  );
}
