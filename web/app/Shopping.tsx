"use client";

/**
 * 장보기 목록 — 마트에서 여는 화면 (지시서 3장)
 *
 * 판정하지 않고 근거를 보여준다 (원칙 ③).
 *   사야 해요        산 적이 없거나 유통기한이 지났다
 *   있는지 봐주세요  "6일 전에 샀어요" — 판정은 사용자가 한다
 *   집에 있을 거예요 최근에 샀다
 *
 * 체크하면 구매 기록이 생긴다. 새 입력을 요구하지 않고 이미 하는 행동에
 * 얹는 것이라, 이 데이터는 틀릴 수가 없다.
 */

import { useOptimistic, useTransition } from "react";
import { toggleItem } from "./actions";
import ShoppingFinish from "./ShoppingFinish";
import { BUCKET_TITLE, type Bucket, type ShoppingItem } from "@/lib/shopping.types";
import styles from "./Shopping.module.css";

const ORDER: Bucket[] = ["BUY", "CHECK", "HAVE"];

export default function Shopping({
  items,
  week = "this",
}: {
  items: ShoppingItem[];
  /** 어느 주의 장인가. 체크가 그 주 목록에 걸린다 (app/shopping/page.tsx) */
  week?: "this" | "next";
}) {
  const [, startTransition] = useTransition();
  // 마트에서 누르는 것이라 응답을 기다리게 하면 안 된다.
  const [shown, setShown] = useOptimistic(
    items,
    (state: ShoppingItem[], changed: { label: string; checked: boolean }) =>
      state.map((it) =>
        it.label === changed.label ? { ...it, checked: changed.checked } : it,
      ),
  );

  function onToggle(item: ShoppingItem) {
    const checked = !item.checked;
    startTransition(async () => {
      setShown({ label: item.label, checked });
      const form = new FormData();
      form.set("label", item.label);
      form.set("checked", checked ? "1" : "0");
      form.set("week", week);
      await toggleItem(form);
    });
  }

  const bought = shown.filter((i) => i.checked).length;

  return (
    /* PC 에서는 두 칸으로 벌어진다 (globals.css) */
    <div className="board board-tight">
      {ORDER.map((bucket) => {
        const picked = shown.filter((i) => i.bucket === bucket);
        if (picked.length === 0) return null;
        return (
          <div key={bucket} className={styles.group}>
            <h3 className={styles.bucket}>
              {BUCKET_TITLE[bucket]}
              <span className={styles.count}>{picked.length}</span>
            </h3>
            <ul className={styles.list}>
              {picked.map((item) => (
                /*
                 * 여백의 .ds-check 를 쓴다 — 보이는 네모는 .box 가 그리고
                 * 진짜 <input> 이 안에 숨어 있어서 키보드·스크린리더가 그대로
                 * 동작한다 (components.css Phase 1). 줄 전체가 라벨이라
                 * 마트에서 아무 데나 눌러도 체크된다.
                 */
                <li key={item.label} className={styles.line}>
                  <label className="ds-check">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => onToggle(item)}
                    />
                    <span className="box" />
                    <span className={styles.name}>{item.label}</span>
                    {/* 근거만 보여준다. "없음" 이라고 단정하지 않는다 */}
                    {item.reason && (
                      <span className={styles.reason}>{item.reason}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <ShoppingFinish bought={bought} />
    </div>
  );
}
