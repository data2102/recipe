"use client";
import Link from "next/link";
import { useMemo, useState, useOptimistic, useTransition, useRef } from "react";
import type { RecipeCard } from "@/lib/recipes";
import { addToWeek, removeFromWeek } from "../actions";
import styles from "./picker.module.css";
type Card = RecipeCard;
import { sortRecipes, type RecipeOrder } from "@/lib/recipe-sort";
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
function Cover({ recipe }: { recipe: Card }) {
  const [failed, setFailed] = useState(false);
  const src = imageFor(recipe);
  return src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className={styles.noPhoto}>
      <span>
        {recipe.ingredients.slice(0, 2).join(" · ") || "내가 저장한 요리"}
      </span>
      <strong>{recipe.title}</strong>
    </div>
  );
}
export default function Picker({
  recipes,
  initialPicked,
  week,
  initialTerm,
}: {
  recipes: Card[];
  initialPicked: number[];
  week: "this" | "next";
  initialTerm: string;
}) {
  const [selected, updateSelected] = useOptimistic(
    new Set(initialPicked),
    (state, change: { id: number; removing: boolean }) => {
      const next = new Set(state);
      if (change.removing) next.delete(change.id);
      else next.add(change.id);
      return next;
    },
  );
  const [, startTransition] = useTransition();
  const pendingIds = useRef(new Set<number>());
  const [busy, setBusy] = useState(new Set<number>());
  const [term, setTerm] = useState(initialTerm);
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<Record<string, RecipeOrder>>({});
  const order = orders[filter] ?? "default";
  const [ingredient, setIngredient] = useState("");
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const visible = sortRecipes(
    recipes.filter(
      (r) =>
        (!review || selected.has(r.id)) &&
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
  async function toggle(r: Card) {
    if (pendingIds.current.has(r.id)) return;
    pendingIds.current.add(r.id);
    const removing = selected.has(r.id);
    setBusy((s) => new Set(s).add(r.id));
    setError("");
    const data = new FormData();
    data.set("id", String(r.id));
    data.set("week", week);
    startTransition(async () => {
      updateSelected({ id: r.id, removing });
      try {
        await (removing ? removeFromWeek : addToWeek)(data);
        setNotice(
          `${r.title}${removing ? " 식단에서 뺐어요" : " 식단에 담았어요"}`,
        );
      } catch {
        setError(`${r.title} 변경을 저장하지 못했어요. 다시 눌러주세요.`);
      } finally {
        pendingIds.current.delete(r.id);
        setBusy((s) => {
          const n = new Set(s);
          n.delete(r.id);
          return n;
        });
      }
    });
  }
  return (
    <main className={`shell ${styles.shell}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>메뉴부터 고르고, 날짜는 나중에</p>
          <h1>{week === "next" ? "다음 주" : "이번 주"} 뭐 먹을까요?</h1>
        </div>
        <Link href="/add" className="ds-btn ds-btn-secondary">
          + 레시피
        </Link>
      </header>
      <nav className={styles.weeks} aria-label="식단 기간">
        <Link
          href="/recipes?week=this"
          className={`ds-chip ${week === "this" ? "on" : ""}`}
        >
          이번 주
        </Link>
        <Link
          href="/recipes?week=next"
          className={`ds-chip ${week === "next" ? "on" : ""}`}
        >
          다음 주
        </Link>
        <Link href={`/?week=${week}#week-plan`}>요일 정하기 →</Link>
      </nav>
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
        <label className={styles.sort}>
          <span>정렬</span>
          <select
            className="ds-input"
            value={order}
            onChange={(e) =>
              setOrders((previous) => ({
                ...previous,
                [filter]: e.target.value as RecipeOrder,
              }))
            }
          >
            <option value="default">
              {filter === "cooked" ? "만든 일자순 · 오래된 순" : "최근 등록순"}
            </option>
            <option value="name">이름순</option>
          </select>
        </label>
        <details className={styles.ingredients}>
          <summary>
            재료로 좁혀보기{ingredient ? ` · ${ingredient}` : ""}
          </summary>
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
        </details>
      </div>
      <div className={styles.results}>
        <h2>
          {review ? "이번에 먹을 메뉴" : "내 레시피"}{" "}
          <span>{visible.length}</span>
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
          {review ? "전체 레시피 보기" : `담은 메뉴만 · ${selected.size}`}
        </button>
      </div>
      <p role="status" className={styles.sr}>
        {notice}
      </p>
      {error && (
        <p role="alert" className="ds-banner ds-banner-danger">
          {error}
        </p>
      )}
      <ul className={styles.grid}>
        {visible.map((r) => (
          <li
            key={r.id}
            className={`${styles.card} ${selected.has(r.id) ? styles.selected : ""}`}
          >
            <Link
              href={`/recipe/${r.id}?week=${week}`}
              className={styles.cover}
              aria-label={`${r.title} 레시피 보기`}
            >
              <Cover recipe={r} />
            </Link>
            <div className={styles.cardBody}>
              <Link
                href={`/recipe/${r.id}?week=${week}`}
                className={styles.title}
              >
                {r.title}
              </Link>
              <p>{r.ingredients.slice(0, 4).join(" · ") || "재료 추가 필요"}</p>
              <button
                className="ds-btn ds-btn-secondary"
                disabled={busy.has(r.id)}
                aria-pressed={selected.has(r.id)}
                aria-label={`${r.title} ${selected.has(r.id) ? "식단에서 빼기" : "식단에 담기"}`}
                onClick={() => toggle(r)}
              >
                {busy.has(r.id)
                  ? "저장 중…"
                  : selected.has(r.id)
                    ? "✓ 담음 · 빼기"
                    : "+ 담기"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!visible.length && (
        <section className="ds-empty">
          <h2>
            {recipes.length
              ? review && !selected.size
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
      <aside className={styles.basket} aria-label="식단 선택 결과">
        <button
          onClick={() => {
            setReview(true);
            setFilter("all");
            setTerm("");
            setIngredient("");
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        >
          <strong>{selected.size}개 담았어요</strong>
          <span>담은 메뉴 확인</span>
        </button>
        <Link href={`/shopping?week=${week}`} className="ds-btn ds-btn-primary">
          장보기로 →
        </Link>
      </aside>
    </main>
  );
}
