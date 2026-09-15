"use client";

/**
 * 식단 — **날짜를 쭉 늘어놓는다.**
 *
 * 예전 이 자리에는 추천이 있었다 (오늘의 제안 · 다른 메뉴도 있어요).
 * 담을 메뉴를 고르는 일과 "무슨 요일에 뭘 먹기로 했더라" 를 보는 일이
 * 한 화면에 겹쳐 있어서, 정작 자주 하는 뒤쪽 일이 추천 아래로 밀렸다.
 * 고르는 건 메뉴 고르기 탭이 한다. 여기는 **정해진 걸 보는 자리**다.
 *
 * 이번 주와 다음 주를 가르지 않는다. 사람이 묻는 건 "이번 주에 뭐
 * 담았지" 가 아니라 "수요일에 뭐 먹지" 인데, 주를 먼저 고르게 하면
 * 그 답을 보려고 탭을 오간다 (lib/week.ts horizon).
 *
 * 빈 날을 감추지 않는다. 안 정한 날이 보여야 정할 수 있고, 약속이
 * 있는 날은 **안 정해도 되는 날**이라고 적어둘 수 있다.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { markCooked, planOnDate, removeFromWeek, setDayNote } from "./actions";
import { dateFull, dateSay, dayIndex } from "@/lib/say";
import { DAYS, type Planned } from "@/lib/week.types";
import { NOTE_MAX } from "@/lib/notes.types";
import { atHome, type Have } from "@/lib/fridge.types";
import styles from "./Plan.module.css";

type Which = "this" | "next";

/** 담긴 요리 한 건 — 어느 주 목록에서 왔는지까지 (옮길 때 저쪽에서 뗀다) */
export type PlanDish = Planned & { which: Which };

export type PlanDay = {
  iso: string;
  which: Which;
  /** 그날 적어둔 말. 없으면 빈 문자열 */
  note: string;
  dishes: PlanDish[];
};

export default function Plan({
  days,
  loose,
  have,
  today,
}: {
  /** 이번 주 월요일부터 다음 주 일요일까지 열나흘 */
  days: PlanDay[];
  /** 날짜를 안 정하고 담아둔 것 */
  loose: PlanDish[];
  /** 주별 "집에 있어요" — 펼친 재료에 표시만 한다 (구매 기록은 안 생긴다) */
  have: Record<Which, Have>;
  /** 오늘 (한국 기준) */
  today: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const options = days.map((d) => d.iso);

  function move(dish: PlanDish, date: string) {
    setError("");
    start(async () => {
      const form = new FormData();
      form.set("id", String(dish.recipe_id));
      form.set("date", date);
      form.set("from", dish.which);
      form.set("week", dish.which);
      try {
        await planOnDate(form);
      } catch {
        setError("날짜를 저장하지 못했어요. 다시 골라주세요.");
      }
    });
  }

  function saveNote(date: string, note: string) {
    setError("");
    start(async () => {
      const form = new FormData();
      form.set("date", date);
      form.set("note", note);
      try {
        await setDayNote(form);
        setEditing(null);
      } catch {
        setError("메모를 저장하지 못했어요. 다시 눌러주세요.");
      }
    });
  }

  function Dish({ p }: { p: PlanDish }) {
    const isOpen = open === p.recipe_id;
    const need = p.items.filter(
      (i) => !atHome(have[p.which], i.ingredient_id, i.raw_name),
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

          <div className={`ds-select ${styles.when}`}>
            <select
              disabled={pending}
              aria-label={`${p.title} 날짜`}
              value={p.plannedOn ?? ""}
              onChange={(e) => move(p, e.target.value)}
            >
              <option value="">미정</option>
              {options.map((iso) => (
                <option key={iso} value={iso}>
                  {dateFull(iso)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/*
          지난 날은 **물어보되 자동으로 기록하지 않는다.** 약속이 생겨
          건너뛴 날이 흔한데 자동으로 체크하면 안 만든 게 만든 것으로
          남고, last_cooked_on 하나가 추천과 정렬을 통째로 틀어놓는다.
        */}
        {p.past && !p.cooked && p.plannedOn && (
          <div className={styles.ask}>
            <p className={styles.askText}>
              {dateFull(p.plannedOn)}이 지났어요. 만들었어요?
            </p>
            <div className={styles.askRow}>
              <form action={markCooked}>
                <input type="hidden" name="id" value={p.recipe_id} />
                <input type="hidden" name="cookedOn" value={p.plannedOn} />
                <button type="submit" className="ds-btn ds-btn-secondary">
                  만들었어요
                </button>
              </form>
              <form action={planOnDate}>
                <input type="hidden" name="id" value={p.recipe_id} />
                <input type="hidden" name="date" value="" />
                <input type="hidden" name="week" value={p.which} />
                <button type="submit" className="ds-btn ds-btn-secondary">
                  안 먹었어요
                </button>
              </form>
            </div>
          </div>
        )}

        {isOpen && (
          <>
            <Link
              className={styles.read}
              href={`/recipe/${p.recipe_id}?week=${p.which}`}
            >
              만드는 법 보기 →
            </Link>
            <ul className={styles.items}>
              {p.items.map((it) => {
                const hasIt = atHome(have[p.which], it.ingredient_id, it.raw_name);
                return (
                  <li key={it.id}>
                    <span className={`ds-check ${styles.item}`}>
                      <span className={styles.mark}>
                        {hasIt ? "집에 있음" : "확인 전"}
                      </span>
                      <span className={hasIt ? styles.gotIt : styles.needIt}>
                        {it.raw_name}
                      </span>
                      {it.raw_qty && (
                        <span className={styles.qty}>{it.raw_qty}</span>
                      )}
                      {it.choice_group && (
                        <span className={styles.qty}>택1</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {p.items.length === 0 && (
              <p className={styles.hint}>
                재료가 아직 안 붙어 있어요. 캡처로 채우면 여기 나와요.
              </p>
            )}
            <form action={removeFromWeek} className={styles.drop}>
              <input type="hidden" name="id" value={p.recipe_id} />
              <input type="hidden" name="week" value={p.which} />
              <button type="submit" className={styles.unpick}>
                식단에서 뺄게요
              </button>
            </form>
          </>
        )}
      </li>
    );
  }

  /** 적어둔 말, 또는 적는 칸. 없고 안 적는 중이면 아무것도 안 그린다 */
  function Note({ day }: { day: PlanDay }) {
    if (editing === day.iso) {
      return (
        <form
          className={styles.noteForm}
          action={(data: FormData) =>
            saveNote(day.iso, String(data.get("note") ?? ""))
          }
        >
          <input
            className="ds-input"
            name="note"
            defaultValue={day.note}
            maxLength={NOTE_MAX}
            autoFocus
            placeholder="저녁 약속, 외식, 야근…"
            aria-label={`${dateFull(day.iso)} 메모`}
          />
          <button type="submit" className="ds-btn ds-btn-secondary">
            저장
          </button>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setEditing(null)}
          >
            그만두기
          </button>
        </form>
      );
    }
    if (day.note) {
      return (
        <p className={styles.note}>
          <span className={styles.noteText}>{day.note}</span>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setEditing(day.iso)}
          >
            고치기
          </button>
        </p>
      );
    }
    return null;
  }

  return (
    <>
      <p role="status" aria-live="polite" className={styles.sr}>
        {pending ? "저장 중…" : ""}
      </p>
      {error && (
        <p className="ds-banner ds-banner-danger" role="alert">
          {error}
        </p>
      )}

      {days.map((day, i) => (
        <div key={day.iso}>
          {i === 7 && <h2 className={styles.weekMark}>다음 주</h2>}
          <section
            className={`${styles.day} ${day.iso === today ? styles.todayDay : ""} ${
              day.iso < today ? styles.pastDay : ""
            }`}
          >
            {/*
              빈 날은 한 줄이다. 열나흘마다 "아직 안 정했어요" 를 적으면
              화면의 절반이 그 말이 된다 — 안 정한 건 비어 있는 것으로 보인다.
              메모 버튼도 날짜 줄 오른쪽에 붙여서 줄을 안 늘린다.
            */}
            <div className={styles.dayHead}>
              <h3 className={styles.dayName}>
                <span className={styles.date}>{dateSay(day.iso)}</span>
                <span className={styles.weekday}>
                  ({DAYS[dayIndex(day.iso)]})
                </span>
                {day.iso === today && <span className={styles.badge}>오늘</span>}
              </h3>
              {!day.note && editing !== day.iso && day.iso >= today && (
                <button
                  type="button"
                  className={styles.addNote}
                  onClick={() => setEditing(day.iso)}
                >
                  + 메모
                </button>
              )}
            </div>

            <Note day={day} />

            {day.dishes.length > 0 && (
              <ul className={styles.list}>
                {day.dishes.map((p) => (
                  <Dish key={`${p.which}-${p.recipe_id}`} p={p} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ))}

      {loose.length > 0 && (
        <section className={styles.day}>
          <h3 className={styles.dayName}>
            <span className={styles.date}>날짜 미정</span>
            <span className={styles.weekday}>{loose.length}개</span>
          </h3>
          <p className={styles.blank}>
            날짜를 고르면 위로 올라가요. 안 정해도 장보기에는 들어가요.
          </p>
          <ul className={styles.list}>
            {loose.map((p) => (
              <Dish key={`${p.which}-${p.recipe_id}`} p={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
