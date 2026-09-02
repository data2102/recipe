"use client";

/**
 * 장보기를 요리별로 — 접었다 펴는 목록
 *
 * 합친 목록은 마트에서 훑기 좋지만 "이게 왜 필요한지" 가 안 보인다.
 * 김치삼겹살찜을 눌러 그 요리에 살 것만 보는 게 이 화면이다.
 *
 * **항목은 여전히 한 벌이다.** 대파가 세 요리에 들어가도 살 것은 대파
 * 하나고, 한 군데서 체크하면 세 군데가 다 체크된다 — 재료 이름(label)
 * 으로 합친 목록의 상태를 그대로 읽기 때문이다. 요리별로 따로 세면
 * 세 단을 사게 된다. 여러 요리에 걸친 재료에는 그렇다고 적어둔다.
 *
 * 여기 체크는 **진짜 체크다** — 구매 기록이 생긴다. 식단 화면에서
 * 펼치는 재료 목록은 읽기 전용이라 기록을 만들지 않는다 (app/Week.tsx).
 * 생김새가 비슷하니 헷갈리지 마라: 저기는 잠긴 칸, 여기는 누르는 칸이다.
 */

import { useOptimistic, useState, useTransition } from "react";
import { toggleItem } from "./actions";
import ShoppingFinish from "./ShoppingFinish";
import { DAYS } from "@/lib/week.types";
import type { RecipeGroup, ShoppingItem } from "@/lib/shopping.types";
import styles from "./ShoppingByRecipe.module.css";

export default function ShoppingByRecipe({
  groups,
  items,
}: {
  groups: RecipeGroup[];
  items: ShoppingItem[];
}) {
  const [open, setOpen] = useState<number | null>(null);
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
      await toggleItem(form);
    });
  }

  // 몇 개의 요리에 걸치는가. 둘 이상이면 한 번만 사면 된다고 알려준다.
  const inHowMany = new Map<string, number>();
  for (const g of groups) {
    for (const l of g.labels) inHowMany.set(l, (inHowMany.get(l) ?? 0) + 1);
  }

  return (
    /* PC 에서는 두 칸으로 벌어진다 (globals.css) */
    <div className="board board-tight">
      {groups.map((g) => {
        // 합친 목록의 순서를 그대로 쓴다 (칸 → 진열대 → 이름).
        const mine = shown.filter((i) => g.labels.includes(i.label));
        const left = mine.filter((i) => !i.checked && i.bucket !== "HAVE");
        const isOpen = open === g.recipe_id;

        return (
          <section key={g.recipe_id} className="ds-card">
            <button
              type="button"
              className={styles.head}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.recipe_id)}
            >
              <span className={styles.caret} aria-hidden="true">
                {isOpen ? "⌄" : "›"}
              </span>
              <span className={styles.title}>{g.title}</span>
              {g.day !== null && (
                <span className={styles.day}>{DAYS[g.day]}</span>
              )}
              <span className={styles.count}>
                {mine.length === 0
                  ? "재료 없어요"
                  : left.length === 0
                    ? "다 담았어요"
                    : `살 것 ${left.length}`}
              </span>
            </button>

            {isOpen && mine.length > 0 && (
              <ul className={styles.list}>
                {mine.map((item) => {
                  const shared = (inHowMany.get(item.label) ?? 1) > 1;
                  return (
                    <li key={item.label} className={styles.line}>
                      <label className="ds-check">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => onToggle(item)}
                        />
                        <span className="box" />
                        <span className={styles.name}>{item.label}</span>
                        {/*
                          근거만 보여준다. 판정은 사람이 한다 (원칙 ③).
                          산 날짜가 있으면 그게 먼저다 — 겹친다는 건
                          그다음이고, 줄을 따로 잡으면 목록이 시끄러워진다
                          (여기서는 대부분이 겹친다).
                        */}
                        <span className={styles.why}>
                          {item.reason ??
                            (shared
                              ? "다른 요리에도"
                              : item.bucket === "CHECK"
                                ? "있는지 봐주세요"
                                : "")}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {isOpen && mine.length === 0 && (
              <p className={styles.empty}>
                재료가 아직 안 붙어 있어요. 캡처로 채우면 여기 나와요.
              </p>
            )}
          </section>
        );
      })}

      <ShoppingFinish bought={shown.filter((i) => i.checked).length} />
    </div>
  );
}
