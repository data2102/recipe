"use client";

import Link from "next/link";
import { useState } from "react";
import { useTransition } from "react";
import { markCooked, removeFromWeek, setDayOfWeek } from "./actions";
import { dateFull, dateSay, dateTiny, dayIndex } from "@/lib/say";
import { DAYS, type Planned } from "@/lib/week.types";
import { atHome, type Have } from "@/lib/fridge.types";
import styles from "./Week.module.css";

export default function Week({
  plan,
  have,
  dates,
  today,
  week = "this",
}: {
  plan: Planned[];

  have: Have;

  dates: string[];

  today: string;

  week?: "this" | "next";
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (plan.length === 0) {
    return (
      <div className={`ds-empty ${styles.empty}`}>
        <p>추천 메뉴를 담으면 여기 모여요.</p>
      </div>
    );
  }

  const unset = plan.filter((p) => p.day === null);

  function move(recipeId: number, value: string) {
    setError(false);
    startTransition(async () => {
      const form = new FormData();
      form.set("id", String(recipeId));
      form.set("day", value);
      form.set("week", week);
      try {
        await setDayOfWeek(form);
      } catch {
        setError(true);
      }
    });
  }

  function Dish({ p }: { p: Planned }) {
    const isOpen = open === p.recipe_id;
    const need = p.items.filter(
      (i) => !atHome(have, i.ingredient_id, i.raw_name),
    );
    return (
      <li className={styles.dish}>
        <div className={styles.dishHead}>
          <button
            type="button"
            className={styles.name}
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : p.recipe_id)}
          >
            <span className={styles.caret} aria-hidden="true">
              {isOpen ? "⌄" : "›"}
            </span>
            <span className={styles.title}>{p.title}</span>
            <span className={styles.count}>
              {p.cooked
                ? "만들었어요"
                : p.items.length === 0
                  ? "재료 없어요"
                  : need.length === 0
                    ? "보유 확인했어요"
                    : `보유 확인 전 ${need.length}`}
            </span>
          </button>

          <div className={`ds-select ${styles.day}`}>
            <select
              disabled={pending}
              aria-label={`${p.title} 요일`}
              value={p.day === null ? "" : String(p.day)}
              onChange={(e) => move(p.recipe_id, e.target.value)}
            >
              <option value="">미정</option>
              {dates.map((iso) => (
                <option key={iso} value={dayIndex(iso)}>
                  {DAYS[dayIndex(iso)]} {dateTiny(iso)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {p.past && !p.cooked && p.day !== null && (
          <div className={styles.ask}>
            <p className={styles.askText}>
              {p.plannedOn ? dateFull(p.plannedOn) : `${DAYS[p.day]}요일`}이
              지났어요. 만들었어요?
            </p>
            <div className={styles.askRow}>
              <form action={markCooked}>
                <input type="hidden" name="id" value={p.recipe_id} />

                <input
                  type="hidden"
                  name="cookedOn"
                  value={p.plannedOn ?? ""}
                />
                <button type="submit" className="ds-btn ds-btn-secondary">
                  만들었어요
                </button>
              </form>
              <form action={setDayOfWeek}>
                <input type="hidden" name="id" value={p.recipe_id} />
                <input type="hidden" name="day" value="" />
                <input type="hidden" name="week" value={week} />
                <button type="submit" className="ds-btn ds-btn-secondary">
                  안 먹었어요
                </button>
              </form>
            </div>
          </div>
        )}

        {isOpen && (
          <>
            <Link href={`/recipe/${p.recipe_id}?week=${week}`}>
              만드는 법 보기 →
            </Link>
            <ul className={styles.items}>
              {p.items.map((it) => {
                const hasIt = atHome(have, it.ingredient_id, it.raw_name);
                return (
                  <li key={it.id}>
                    <label className={`ds-check ${styles.item}`}>
                      <span>{hasIt ? "집에 있음" : "확인 전"}</span>
                      <span className={hasIt ? styles.gotIt : styles.needIt}>
                        {it.raw_name}
                      </span>
                      {it.raw_qty && (
                        <span className={styles.qty}>{it.raw_qty}</span>
                      )}
                      {it.choice_group && (
                        <span className={styles.qty}>택1</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            {p.items.length === 0 && (
              <p className={styles.note}>
                재료가 아직 안 붙어 있어요. 캡처로 채우면 여기 나와요.
              </p>
            )}
            <form action={removeFromWeek} className={styles.drop}>
              <input type="hidden" name="id" value={p.recipe_id} />
              <input type="hidden" name="week" value={week} />
              <button type="submit" className={styles.unpick}>
                {week === "next" ? "다음 주에서 뺄게요" : "이번 주에서 뺄게요"}
              </button>
            </form>
          </>
        )}
      </li>
    );
  }

  return (
    <>
      {pending && <p role="status">날짜 저장 중…</p>}
      {error && (
        <p role="alert">날짜를 저장하지 못했어요. 다시 선택해주세요.</p>
      )}
      {dates.map((iso) => {
        const mine = plan.filter((p) => p.day === dayIndex(iso));
        if (mine.length === 0) return null;
        return (
          <div key={iso} className={styles.day7}>
            <h3 className={styles.dayName}>
              {dateSay(iso)} ({DAYS[dayIndex(iso)]})
              {iso === today && <span className={styles.blank}>오늘</span>}
            </h3>
            <ul className={styles.list}>
              {mine.map((p) => (
                <Dish key={p.recipe_id} p={p} />
              ))}
            </ul>
          </div>
        );
      })}

      {unset.length > 0 && (
        <div className={styles.day7}>
          <h3 className={styles.dayName}>
            요일 미정
            <span className={styles.blank}>{unset.length}개</span>
          </h3>
          <ul className={styles.list}>
            {unset.map((p) => (
              <Dish key={p.recipe_id} p={p} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
