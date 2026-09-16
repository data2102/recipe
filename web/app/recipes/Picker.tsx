"use client";

/**
 * 메뉴 고르기 — 모아둔 레시피에서 골라 **날짜에 담는다.**
 *
 * 고르는 방법이 셋이다: 검색, 정렬(등록순·이름순·오래된 순), 재료로 좁히기.
 * 정렬이 곧 추천이라는 규칙은 그대로다 (지시서 3장) — "만들어본 요리" 는
 * 오래된 순이 기본이고, 이름순은 찾을 때 쓰는 것이다.
 *
 * 담기는 한 번에 끝난다. "+ 담기" 를 누르면 날짜를 묻고 (app/PlanButton.tsx),
 * 고른 날짜로 바로 들어간다 — 예전처럼 식단에 가서 요일을 또 정하지 않는다.
 */

import Link from "next/link";
import { useMemo, useState, useOptimistic } from "react";
import type { RecipeCard } from "@/lib/recipes";
import type { PickDay, Placement } from "@/lib/plan.types";
import Fold from "../Fold";
import PlanButton from "../PlanButton";
import { sortRecipes, type RecipeOrder } from "@/lib/recipe-sort";
import { dateTiny } from "@/lib/say";
import styles from "./picker.module.css";

type Card = RecipeCard;

function imageFor(r: Card) {
  if (r.photoId) return `/photo/${r.photoId}`;
  try {
    const u = new URL(r.source_url || "");
    if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return null;
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : u.searchParams.get("v") ||
          u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
    return id && /^[\w-]{11}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}

/**
 * 표지 사진 — **없으면 안 그린다.**
 *
 * 예전에는 사진이 없을 때 그 자리에 *제목 + 재료*를 크게 그렸다.
 * 그런데 바로 아래 본문이 **같은 제목과 재료**를 또 쓴다 — 카드 하나에
 * 요리 이름이 두 번 나왔다 (docs/ui-references.md 9장).
 *
 * 빈 회색 네모로 바꾸지도 않는다. 우리 레시피는 대부분 사진이 없어서
 * **빈 네모가 줄줄이 늘어선다** — 그건 5장에서 안 가져오기로 한 것이다.
 * 사진이 있는 카드만 사진을 갖고, 없는 카드는 글자로 선다.
 */
function Cover({ recipe }: { recipe: Card }) {
  const [failed, setFailed] = useState(false);
  const src = imageFor(recipe);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

/** 카드 아래 한 줄 — 이 요리가 언제로 잡혀 있는지 */
function placedSay(placed: Placement[]): string {
  if (!placed.length) return "";
  const p = placed[0];
  if (p.date) return `${dateTiny(p.date)}에 먹기로 했어요`;
  return `${p.which === "next" ? "다음 주" : "이번 주"}에 담았어요 · 날짜 미정`;
}

export default function Picker({
  recipes,
  days,
  placed,
  today,
  initialTerm,
}: {
  recipes: Card[];
  days: PickDay[];
  placed: Record<number, Placement[]>;
  today: string;
  initialTerm: string;
}) {
  /*
    담은 자리는 서버가 준 것이 원본이고, 누른 직후만 화면이 앞질러 그린다.
    30초 걸리는 일이 아니라 바로 돌아오지만, 마트나 지하철에서 한 박자
    늦게 바뀌면 "안 눌렸나" 싶어서 한 번 더 누른다.
  */
  const [plan, applyPlan] = useOptimistic(
    placed,
    (
      state: Record<number, Placement[]>,
      change: { id: number; next: Placement[] },
    ) => ({ ...state, [change.id]: change.next }),
  );

  const [term, setTerm] = useState(initialTerm);
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<Record<string, RecipeOrder>>({});
  const order = orders[filter] ?? "default";
  const [ingredient, setIngredient] = useState("");
  const [review, setReview] = useState(false);

  const ingredients = useMemo(() => {
    const counts = new Map<string, number>();
    recipes.forEach((r) =>
      new Set(r.ingredients).forEach((n) =>
        counts.set(n, (counts.get(n) || 0) + 1),
      ),
    );
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [recipes]);

  const chosen = (id: number) => plan[id] ?? [];
  const pickedCount = Object.values(plan).filter((p) => p.length > 0).length;

  const visible = sortRecipes(
    recipes.filter(
      (r) =>
        (!review || chosen(r.id).length > 0) &&
        (filter === "all" ||
          (filter === "new" ? !r.last_cooked_on : !!r.last_cooked_on)) &&
        (!ingredient || r.ingredients.includes(ingredient)) &&
        `${r.title} ${r.ingredients.join(" ")}`
          .toLocaleLowerCase()
          .includes(term.trim().toLocaleLowerCase()),
    ),
    filter,
    order,
  );

  return (
    <main className={`shell ${styles.shell}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>고르면 날짜를 물어봐요</p>
          <h1>뭐 먹을까요?</h1>
        </div>
        <Link href="/add" className="ds-btn ds-btn-secondary">
          + 레시피
        </Link>
      </header>

      <div className={styles.tools}>
        <label className="ds-search">
          <span className={styles.sr}>요리명이나 재료 검색</span>
          <input
            className="ds-input"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="어떤 요리, 어떤 재료가 당기세요?"
          />
        </label>
        <div className={styles.filters} aria-label="조리 경험">
          {[
            ["all", "전체"],
            ["new", "안 만들어본 요리"],
            ["cooked", "만들어본 요리"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={`ds-chip ${filter === v ? "on" : ""}`}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        {/*
          **정렬도 칩이다.** 예전에는 `<select>` 였는데, 바로 윗줄이 이미
          칩(전체·안 만들어본·만들어본)이라 한 도구 상자 안에서 두 가지
          모양이 섞여 있었다. 폰에서 누르면 OS 기본 드롭다운이 떠서
          앱 안에 웹 폼 조각이 낀 것처럼 보이기도 했다.

          **폰 앱(`native/app/recipes.tsx`)이 이미 칩으로 내고 있었다** —
          웹만 남아서 둘이 갈려 있었다. 이제 같다.

          **오래된 순을 뒤집지 마라 — 그 정렬이 곧 추천이다.**
          이름순은 찾을 때 쓰는 것이고 기본이 아니다.
        */}
        <div className={styles.filters} aria-label="정렬">
          <span className={styles.toolLabel}>정렬</span>
          {(
            [
              [
                "default",
                filter === "cooked" ? "만든 일자순 · 오래된 순" : "최근 등록순",
              ],
              ["name", "이름순"],
            ] as [RecipeOrder, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={`ds-chip ${order === value ? "on" : ""}`}
              aria-pressed={order === value}
              onClick={() =>
                setOrders((previous) => ({ ...previous, [filter]: value }))
              }
            >
              {label}
            </button>
          ))}
        </div>
        {/*
          재료 칩은 **접어둔다.** 한 번 펼쳐놨다가 도구 상자가 403 → 463px
          로 늘어서 되돌렸다 — 여덟 개가 폰 폭에서 두세 줄을 먹고, 그만큼
          첫 카드가 아래로 밀렸다. 이 화면을 여는 이유는 **요리를 고르는
          것**이지 도구를 보는 게 아니다.

          접혀 있으면 있는 줄 모른다는 건 맞다. 그래서 몇 가지가 있는지,
          지금 뭘 골랐는지를 **접힌 줄에 적는다.** 삼각형은 없어졌다.

          그리고 검색창이 이미 재료까지 훑는다 — 칩은 자주 쓰는 여덟 개로
          가는 지름길이지 유일한 길이 아니다.
        */}
        {ingredients.length > 0 && (
          <Fold title="재료로 좁히기" hint={ingredient || `${ingredients.length}가지`}>
            <div className={styles.filters}>
              {ingredients.map((n) => (
                <button
                  key={n}
                  className={`ds-chip ${ingredient === n ? "on" : ""}`}
                  aria-pressed={ingredient === n}
                  onClick={() => setIngredient(ingredient === n ? "" : n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </Fold>
        )}
      </div>

      <div className={styles.results}>
        <h2>
          {review ? "담은 메뉴" : "내 레시피"} <span>{visible.length}</span>
        </h2>
        <button
          className="ds-chip"
          aria-pressed={review}
          onClick={() => {
            setReview(!review);
            setFilter("all");
            setTerm("");
            setIngredient("");
          }}
        >
          {review ? "전체 레시피 보기" : `담은 메뉴만 · ${pickedCount}`}
        </button>
      </div>

      <ul className={styles.grid}>
        {visible.map((r) => (
          <li
            key={r.id}
            className={`${styles.card} ${chosen(r.id).length ? styles.selected : ""}`}
          >
            {imageFor(r) && (
              <Link
                href={`/recipe/${r.id}`}
                className={styles.cover}
                aria-label={`${r.title} 레시피 보기`}
              >
                <Cover recipe={r} />
              </Link>
            )}
            <div className={styles.cardBody}>
              <Link href={`/recipe/${r.id}`} className={styles.title}>
                {r.title}
              </Link>
              <p>{r.ingredients.slice(0, 4).join(" · ") || "재료 추가 필요"}</p>
              {chosen(r.id).length > 0 && (
                <p className={styles.when}>{placedSay(chosen(r.id))}</p>
              )}
              <PlanButton
                recipeId={r.id}
                title={r.title}
                days={days}
                today={today}
                placed={chosen(r.id)}
                onChange={(next) => applyPlan({ id: r.id, next })}
              />
            </div>
          </li>
        ))}
      </ul>

      {!visible.length && (
        <section className="ds-empty">
          <h2>
            {recipes.length
              ? review && !pickedCount
                ? "아직 담은 메뉴가 없어요"
                : "조건에 맞는 요리가 없어요"
              : "먹고 싶은 요리를 모아보세요"}
          </h2>
          {recipes.length ? (
            <button
              className="ds-btn ds-btn-secondary"
              onClick={() => {
                setTerm("");
                setIngredient("");
                setFilter("all");
                setReview(false);
              }}
            >
              전체 레시피 보기
            </button>
          ) : (
            <Link href="/youtube" className="ds-btn ds-btn-primary">
              유튜브에서 레시피 찾기
            </Link>
          )}
        </section>
      )}

      {/*
        담은 결과. **"장보기로 →" 를 걷어냈다** — 탭바에 이미 있는 곳이라
        같은 목적지가 둘이었다. 남긴 "식단에서 날짜 보기" 는 탭바의 식단과
        가는 곳은 같지만 **하려는 일이 다르다**: 방금 담은 것의 날짜를
        보러 가는 길이다.
      */}
      {pickedCount > 0 && (
        <aside className={styles.basket} aria-label="담은 결과">
          <strong>{pickedCount}개 담았어요</strong>
          <Link href="/">식단에서 날짜 보기 →</Link>
        </aside>
      )}
    </main>
  );
}
