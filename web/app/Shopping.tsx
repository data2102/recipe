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

  function row(item: ShoppingItem) {
    const uses = groups.filter((g) => g.labels.includes(item.label));
    return (
      <li key={item.label} className={styles.line}>
        <div className={styles.itemHead}>
          {item.bucket === "HAVE" && !item.checked ? (
            <span className={styles.name}>{item.label}</span>
          ) : (
            <label className="ds-check">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={pending || closed}
                onChange={() => mutate(item)}
              />
              <span className="box" />
              <span className={styles.name}>{item.label}</span>
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
        <div className={styles.uses}>
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
        </div>
      </li>
    );
  }

  return (
    <div>
      <p role="status" className={styles.note}>
        남은 항목 {remaining(shown)}개 · 구매{" "}
        {shown.filter((i) => i.checked).length}개
      </p>
      {error && (
        <p role="alert">변경하지 못했어요. 연결을 확인하고 다시 눌러주세요.</p>
      )}
      <p className={styles.note}>
        수량은 저장된 레시피 기준이에요. 서로 다른 단위는 그대로 표시해요.
      </p>
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
            <details className="ds-card" open>
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
