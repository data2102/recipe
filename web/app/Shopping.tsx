"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { excludeItem, toggleItem } from "./actions";
import ShoppingFinish from "./ShoppingFinish";
import {
  BUCKET_TITLE,
  NO_AISLE,
  remaining,
  type RecipeGroup,
  type ShoppingItem,
} from "@/lib/shopping.types";
import styles from "./Shopping.module.css";

/** One state model and the same controls in both shopping views. */
export default function Shopping({
  items,
  groups = [],
  week = "this",
  byRecipe = false,
  closed = false,
}: {
  items: ShoppingItem[];
  groups?: RecipeGroup[];
  week?: "this" | "next";
  byRecipe?: boolean;
  closed?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  /*
   * 체크한 것은 **서버가 따라올 때까지** 체크된 채로 둔다.
   *
   * 예전에는 useOptimistic 이었다. 그건 서버 액션이 끝나는 순간 원래
   * 값으로 되돌아가고, 화면이 새로 그려져야 다시 체크로 바뀐다. 마트에서
   * 신호가 나쁘면 그 사이가 벌어져서 **체크가 도로 풀린 것처럼 보였다** —
   * 실제로 DB 에는 들어가 있는데 다시 켜야 "구매했어요" 로 내려가 있었다.
   * 그래서 소원(wish)을 들고 있다가 서버가 같은 값을 보내면 그때 놓는다.
   */
  const [wish, setWish] = useState<Record<string, boolean>>({});
  const settled = Object.keys(wish).filter((label) =>
    items.some((i) => i.label === label && i.checked === wish[label]),
  );
  if (settled.length) {
    const next = { ...wish };
    for (const label of settled) delete next[label];
    setWish(next);
  }

  /** 지금 서버에 보내는 중인 항목. 그 줄만 잠근다 */
  const [busy, setBusy] = useState<string | null>(null);

  /*
   * 방금 담은 것 — 되돌릴 틈.
   *
   * 체크하면 맨 아래로 내려간다. 맞는 동작이지만 **잘못 눌렀을 때 어디로
   * 갔는지 놓친다** — 목록이 길고 마트에서는 한 손이다. 할 일 앱들이
   * 완료한 항목을 잠깐 남겨두는 것과 같은 이유로, 몇 초 동안 "취소" 를
   * 손 닿는 곳에 둔다 (docs/ui-references.md 1장).
   */
  const [undo, setUndo] = useState<string | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const shown: ShoppingItem[] = items.map((i) =>
    i.label in wish ? { ...i, checked: wish[i.label] } : i,
  );

  function mutate(item: ShoppingItem, exclude?: boolean) {
    setError(false);
    setBusy(item.label);
    start(async () => {
      const form = new FormData();
      form.set("label", item.label);
      form.set("week", week);
      try {
        if (exclude === undefined) {
          const want = !item.checked;
          setWish((w) => ({ ...w, [item.label]: want }));
          form.set("checked", want ? "1" : "0");
          // 담은 것만 되돌릴 틈을 준다. 푸는 건 이미 되돌리는 일이다
          setUndo(want ? item.label : null);
          await toggleItem(form);
        } else {
          form.set("excluded", exclude ? "1" : "0");
          await excludeItem(form);
        }
      } catch {
        setWish((w) => {
          const next = { ...w };
          delete next[item.label];
          return next;
        });
        setError(true);
      } finally {
        setBusy(null);
      }
    });
  }

  const left = remaining(shown);
  const checked = shown.filter((i) => i.checked).length;
  const confirmed = shown.length - left;

  /** 체크한 것은 아래로. 마트에서 산 것이 위에 남아 있으면 계속 눈에 밟힌다 */
  const boughtLast = (list: ShoppingItem[]) => [
    ...list.filter((i) => !i.checked),
    ...list.filter((i) => i.checked),
  ];

  /*
   * 매대로 묶는다 — **칸과 다른 축이다.** 칸(사야 해요/있는지 봐주세요)은
   * "살지 말지" 를 가르고, 매대는 "어디로 갈지" 다. 목록은 이미 매대순으로
   * 와 있어서 (lib/shopping.ts) 붙어 있는 것끼리 묶기만 하면 된다.
   *
   * **한 매대뿐이면 제목을 안 붙인다.** 항목이 셋인데 머리말이 하나 더
   * 붙으면 그게 더 시끄럽다.
   */
  function byAisle(list: ShoppingItem[]) {
    const out: { aisle: string; items: ShoppingItem[] }[] = [];
    for (const item of list) {
      const name = item.aisle ?? NO_AISLE;
      const last = out[out.length - 1];
      if (last && last.aisle === name) last.items.push(item);
      else out.push({ aisle: name, items: [item] });
    }
    return out.length > 1 ? out : null;
  }

  function row(item: ShoppingItem) {
    const uses = groups.filter((g) => g.labels.includes(item.label));
    const quantity =
      uses
        .flatMap((g) =>
          g.quantities
            .filter((q) => q.label === item.label)
            .map((q) => q.qty || "수량 확인 필요"),
        )
        .join(" + ") || "수량 확인 필요";
    /*
      같은 이름이 두 줄로 나올 수 있다 — 사전에 붙은 '대파' 와 못 붙인
      '대파' 는 다른 행이다 (lib/shopping.ts NEED_SQL). 이름만 key 로
      쓰면 React 가 두 줄을 같은 것으로 보고 엉뚱한 줄을 다시 그린다.
    */
    const locked = pending && busy === item.label;
    return (
      <li key={`${item.ingredient_id ?? "?"}:${item.label}`} className={styles.line}>
        <div className={styles.itemHead}>
          {item.bucket === "HAVE" && !item.checked ? (
            <span className={styles.name}>
              <span>{item.label}</span>
              <span className={styles.quantityInline}>{quantity}</span>
            </span>
          ) : (
            <label className="ds-check">
              {/*
                **이 줄만 잠근다.** 예전에는 저장 중이면 목록 전체가
                잠겼다 — 마트에서 연달아 집으면 그 사이의 탭이 통째로
                버려져서 "눌렀는데 안 됐다" 가 됐다.
              */}
              <input
                type="checkbox"
                checked={item.checked}
                disabled={locked || closed}
                onChange={() => mutate(item)}
              />
              <span className="box" />
              <span className={styles.name}>
                <span>{item.label}</span>
                <span className={styles.quantityInline}>{quantity}</span>
              </span>
            </label>
          )}
          {!item.checked && (
            <button
              type="button"
              className={styles.exclude}
              disabled={locked || closed}
              onClick={() => mutate(item, item.bucket !== "HAVE")}
            >
              {item.bucket === "HAVE" ? "다시 살 것에 넣기" : "집에 있어요"}
            </button>
          )}
        </div>
        {item.reason && <p className={styles.reason}>{item.reason}</p>}
        <details className={styles.uses}>
          <summary>사용할 요리 {uses.length}개</summary>
          {uses.map((g) => (
            <div key={g.recipe_id}>
              <Link href={`/recipe/${g.recipe_id}?week=${week}`}>
                {g.title}
              </Link>
              {" · "}
              {g.quantities
                .filter((q) => q.label === item.label)
                .map((q) => q.qty || "수량 확인 필요")
                .join(" + ")}
            </div>
          ))}
        </details>
      </li>
    );
  }

  return (
    <div>
      <section
        className={`ds-card ${styles.progressCard}`}
        aria-label="장보기 진행"
      >
        <div className={styles.progressHead} role="status" aria-live="polite">
          <strong>{left ? `살 것 ${left}개` : "필요한 재료 준비 끝"}</strong>
          <span>
            구매 {checked}개 · 집에 있음{" "}
            {shown.filter((i) => i.bucket === "HAVE" && !i.checked).length}개
          </span>
        </div>
        <div
          className="ds-progress"
          role="progressbar"
          aria-label="재료 준비"
          aria-valuemin={0}
          aria-valuemax={shown.length || 1}
          aria-valuenow={confirmed}
        >
          <div
            className="bar"
            style={{
              width: `${shown.length ? (confirmed / shown.length) * 100 : 0}%`,
            }}
          />
        </div>
      </section>
      {error && (
        <p className="ds-banner ds-banner-danger" role="alert">
          변경하지 못했어요. 연결을 확인하고 다시 눌러주세요.
        </p>
      )}
      <details className={styles.help}>
        <summary>수량 표시 기준</summary>
        <p className={styles.note}>
          레시피에 저장된 수량이며, 서로 다른 단위는 그대로 표시해요.
        </p>
      </details>
      {byRecipe ? (
        groups.map((g) => (
          <details key={g.recipe_id} className="ds-card">
            <summary className={styles.summary}>
              {g.title} · 남은 항목{" "}
              {remaining(shown.filter((i) => g.labels.includes(i.label)))}개
            </summary>
            <ul className={styles.list}>
              {boughtLast(shown.filter((i) => g.labels.includes(i.label))).map(
                row,
              )}
            </ul>
            {!g.labels.length && (
              <p>
                재료가 아직 없어요.{" "}
                <Link href={`/recipe/${g.recipe_id}?week=${week}`}>
                  레시피 확인하기
                </Link>
              </p>
            )}
          </details>
        ))
      ) : (
        <>
          {(["BUY", "CHECK"] as const).map((bucket) => {
            const rows = shown.filter((i) => i.bucket === bucket && !i.checked);
            const aisles = byAisle(rows);
            return (
              rows.length > 0 && (
                <section key={bucket} className={styles.group}>
                  <h2 className={styles.bucket}>
                    {BUCKET_TITLE[bucket]} · {rows.length}
                  </h2>
                  {aisles ? (
                    aisles.map((a) => (
                      <div key={a.aisle}>
                        <h3 className={styles.aisle}>{a.aisle}</h3>
                        <ul className={styles.list}>{a.items.map(row)}</ul>
                      </div>
                    ))
                  ) : (
                    <ul className={styles.list}>{rows.map(row)}</ul>
                  )}
                </section>
              )
            );
          })}
          {shown.some((i) => i.bucket === "HAVE" && !i.checked) && (
            <details className="ds-card">
              <summary className={styles.summary}>
                집에 있어요 ·{" "}
                {shown.filter((i) => i.bucket === "HAVE" && !i.checked).length}
                개
              </summary>
              <ul className={styles.list}>
                {shown
                  .filter((i) => i.bucket === "HAVE" && !i.checked)
                  .map(row)}
              </ul>
            </details>
          )}
          {/*
            **체크한 것은 접지 않는다.** 접어두면 누른 것이 사라져 보여서
            "안 눌렸나" 하고 한 번 더 누르게 된다. 맨 아래로 내려보내되
            거기 있다는 건 보이게 둔다.
          */}
          {shown.some((i) => i.checked) && (
            <section className={styles.group}>
              <h2 className={styles.bucket}>
                구매했어요 · {shown.filter((i) => i.checked).length}
              </h2>
              <ul className={styles.list}>
                {shown.filter((i) => i.checked).map(row)}
              </ul>
            </section>
          )}
        </>
      )}
      {/*
        방금 담은 것을 되돌릴 틈. 손 닿는 아래쪽에 몇 초만 뜬다 —
        **제스처가 아니라 누르는 버튼이다** (발견할 수 없는 동작은 없는 동작).
      */}
      {undo && (
        <div className="ds-toast-wrap">
          <div className="ds-toast" role="status">
            <span className="dot" />
            <span className={styles.toastText}>{undo} 담았어요</span>
            <button
              type="button"
              className={styles.undo}
              onClick={() => {
                const back = shown.find((i) => i.label === undo);
                setUndo(null);
                if (back) mutate(back);
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {!closed && (
        <ShoppingFinish
          bought={shown.filter((i) => i.checked).length}
          week={week}
          remaining={remaining(shown)}
          total={shown.length}
        />
      )}
    </div>
  );
}
