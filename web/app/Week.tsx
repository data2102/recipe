"use client";

/**
 * 이번 주 식단 — 요일별로 뭘 먹을지 (지시서 3장 탭 3의 "담은 것" 자리)
 *
 * 요리를 누르면 그 요리에 필요한 재료가 아래로 펼쳐진다. 집에 있다고
 * 눌러둔 재료는 체크된 채로 나온다 — 마트에서 두 번 사지 않으려고.
 *
 * **여기 체크는 구매 기록을 만들지 않는다.** 장보기 목록의 체크와 다르다.
 * 이건 "집에 있다고 하셨죠" 를 다시 보여주는 것뿐이고, 구매 기록은 마트에서
 * 실제로 담을 때 장보기에서 생긴다 (원칙 ③ — 틀릴 수가 없는 데이터).
 *
 * 요일은 안 정해도 된다. 담기는 한 번 누르는 일로 남겨두고, 요일은 정하고
 * 싶은 사람만 정한다.
 */

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
  /** 집에 있다고 눌러둔 재료. 주소에서 온다 (lib/fridge.types.ts) */
  have: Have;
  /**
   * 그 주의 날짜 일곱 개 (`YYYY-MM-DD`). **날짜 순서다** — 목록이 수요일에
   * 열렸으면 수요일부터다. 요일만 적으면 며칠 건지 알 수 없어서 같이 낸다.
   */
  dates: string[];
  /** 오늘 (한국 기준). 이 주에 없으면 아무 날도 표시되지 않는다 */
  today: string;
  /** 어느 주를 보고 있는가. 요일 옮기기·빼기가 이 주에 걸린다 */
  week?: "this" | "next";
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  if (plan.length === 0) {
    return (
      <div className={`ds-empty ${styles.empty}`}>
        <p>아래에서 담으면 여기 모여요.</p>
      </div>
    );
  }

  /*
    날짜 순으로 나눈다. 안 정한 것은 맨 아래 따로.

    저장은 여전히 요일(`day_of_week`)이다 — 날짜는 주의 시작일에서
    계산한 것뿐이라 화면에만 산다 (lib/shopping.ts weekStart).
  */
  const unset = plan.filter((p) => p.day === null);

  function move(recipeId: number, value: string) {
    const day = value === "" ? null : Number(value);
    startTransition(() => {
      const form = new FormData();
      form.set("id", String(recipeId));
      form.set("day", value);
      form.set("week", week);
      void setDayOfWeek(form);
    });
    void day;
  }

  function Dish({ p }: { p: Planned }) {
    const isOpen = open === p.recipe_id;
    const need = p.items.filter((i) => !atHome(have, i.ingredient_id, i.raw_name));
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
                    ? "다 있어요"
                    : `살 것 ${need.length}`}
            </span>
          </button>

          {/* 요일 옮기기. 네이티브 select 가 폰에서 제일 쓸 만하다 */}
          <div className={`ds-select ${styles.day}`}>
            <select
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

        {/*
          지난 요일인데 그날 만든 기록이 없으면 물어본다.
          **자동으로 체크하지 않는다** — 약속이 생겨 건너뛴 날이 흔하고,
          안 만든 걸 만들었다고 적으면 추천이 통째로 틀어진다
          (30일 규칙과 탭 2 정렬이 last_cooked_on 을 본다).

          "안 먹었어요" 는 요일만 미정으로 되돌린다. 이번 주에서 빼지는
          않는다 — 못 먹었을 뿐 먹기로 한 건 그대로다. 아예 뺄 거면
          펼쳐서 "이번 주에서 뺄게요" 가 따로 있다.
        */}
        {p.past && !p.cooked && p.day !== null && (
          <div className={styles.ask}>
            <p className={styles.askText}>
              {p.plannedOn ? dateFull(p.plannedOn) : `${DAYS[p.day]}요일`}이
              지났어요. 만들었어요?
            </p>
            <div className={styles.askRow}>
              <form action={markCooked}>
                <input type="hidden" name="id" value={p.recipe_id} />
                {/* 오늘이 아니라 **그날로** 적는다 */}
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
            <ul className={styles.items}>
              {p.items.map((it) => {
                const hasIt = atHome(have, it.ingredient_id, it.raw_name);
                return (
                  <li key={it.id}>
                    <label className={`ds-check ${styles.item}`}>
                      {/*
                        읽기 전용이다. 집에 있는지는 위쪽 칩에서 정한다 —
                        여기서 또 고르게 하면 두 군데가 어긋난다.
                      */}
                      <input type="checkbox" checked={hasIt} readOnly disabled />
                      <span className="box" />
                      <span className={hasIt ? styles.gotIt : styles.needIt}>
                        {it.raw_name}
                      </span>
                      {it.raw_qty && <span className={styles.qty}>{it.raw_qty}</span>}
                      {it.choice_group && <span className={styles.qty}>택1</span>}
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
