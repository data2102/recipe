"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { excludeItem, toggleItem } from "./actions";
import ShoppingFinish from "./ShoppingFinish";
import {
  BUCKET_TITLE,
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
  const [shown, update] = useOptimistic(
    items,
    (state: ShoppingItem[], change: { label: string; checked: boolean }) =>
      state.map((i) =>
        i.label === change.label ? { ...i, checked: change.checked } : i,
      ),
  );

  function mutate(item: ShoppingItem, exclude?: boolean) {
    setError(false);
    start(async () => {
      const form = new FormData();
      form.set("label", item.label);
      form.set("week", week);
      try {
        if (exclude === undefined) {
          update({ label: item.label, checked: !item.checked });
          form.set("checked", item.checked ? "0" : "1");
          await toggleItem(form);
        } else {
          form.set("excluded", exclude ? "1" : "0");
          await excludeItem(form);
        }
      } catch {
        setError(true);
      }
    });
  }

  const left = remaining(shown);
  const checked = shown.filter((i) => i.checked).length;
  const confirmed = shown.length - left;

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
    return (
      <li key={item.label} className={styles.line}>
        <div className={styles.itemHead}>
          {item.bucket === "HAVE" && !item.checked ? (
            <span className={styles.name}>
              <span>{item.label}</span>
              <span className={styles.quantityInline}>{quantity}</span>
            </span>
          ) : (
            <label className="ds-check">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={pending || closed}
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
              disabled={pending || closed}
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
              {shown.filter((i) => g.labels.includes(i.label)).map(row)}
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
            return (
              rows.length > 0 && (
                <section key={bucket} className={styles.group}>
                  <h2 className={styles.bucket}>
                    {BUCKET_TITLE[bucket]} · {rows.length}
                  </h2>
                  <ul className={styles.list}>{rows.map(row)}</ul>
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
          {shown.some((i) => i.checked) && (
            <details className="ds-card">
              <summary className={styles.summary}>
                구매했어요 · {shown.filter((i) => i.checked).length}개
              </summary>
              <ul className={styles.list}>
                {shown.filter((i) => i.checked).map(row)}
              </ul>
            </details>
          )}
        </>
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
