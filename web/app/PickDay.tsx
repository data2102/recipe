"use client";

/**
 * 요일에 담기 — 끌어다 놓기 (+ 눌러서 고르기)
 *
 * 추천 목록은 화면 위쪽이고 요일 7칸은 한참 아래다. 폰에서 그 사이를
 * 끌고 가려면 스크롤하면서 드래그해야 하는데, 그건 손가락 하나로 못 한다.
 * **그래서 요일 쪽을 손가락에게 불러온다** — 담기를 누르는 순간 화면 아래에
 * 요일 막대가 뜨고, 거기로 끌어다 놓는다.
 *
 * 같은 막대를 눌러서도 고를 수 있다. 끌기는 발견하기 어려운 동작이라
 * (아무 표시도 없다) 그것만으로 두면 아무도 못 쓴다. 끌어도 되고 눌러도
 * 되는 한 벌이다.
 *
 * 탭 1·2 처럼 이 provider 밖에서 쓰는 RecipeRow 는 `usePickDay()` 가
 * null 을 받아 예전처럼 그냥 담기로 동작한다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useTransition,
} from "react";
import { addToWeekOn } from "./actions";
import { DAYS } from "@/lib/week.types";
import styles from "./PickDay.module.css";

/** 이만큼 움직여야 끌기로 본다. 그 전에는 그냥 누른 것이다 */
const DRAG_SLOP = 8;

type Ctx = {
  /** 담기 버튼에서 부른다. 요일 막대를 띄우고 끌기를 따라간다 */
  start: (recipeId: number, title: string, e: React.PointerEvent) => void;
};

const PickDayContext = createContext<Ctx | null>(null);

export function usePickDay(): Ctx | null {
  return useContext(PickDayContext);
}

type Picking = { recipeId: number; title: string } | null;

export default function PickDayProvider({
  children,
  week = "this",
}: {
  children: React.ReactNode;
  /** 어느 주에 담는가. 식단 화면이 보고 있는 주를 넘긴다 */
  week?: "this" | "next";
}) {
  const [picking, setPicking] = useState<Picking>(null);
  const [over, setOver] = useState<number | "none" | null>(null);
  const [, startTransition] = useTransition();
  const dragging = useRef(false);

  const commit = useCallback(
    (recipeId: number, day: number | null) => {
      setPicking(null);
      setOver(null);
      startTransition(() => {
        const form = new FormData();
        form.set("id", String(recipeId));
        form.set("day", day === null ? "" : String(day));
        // 화면이 보고 있는 주에 담는다 (이번 주 / 다음 주)
        form.set("week", week);
        void addToWeekOn(form);
      });
    },
    [week],
  );

  /** 손가락 아래에 어느 요일이 있나. 끌기 중에만 쓴다 */
  function dayUnder(x: number, y: number): number | "none" | null {
    const el = document.elementFromPoint(x, y);
    const slot = el?.closest("[data-day]");
    if (!slot) return null;
    const v = slot.getAttribute("data-day");
    return v === "none" ? "none" : Number(v);
  }

  const start = useCallback(
    (recipeId: number, title: string, e: React.PointerEvent) => {
      const from = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as HTMLElement;
      dragging.current = false;
      setPicking({ recipeId, title });

      // 포인터를 붙잡아 둔다. 손가락이 버튼 밖으로 나가도 계속 따라온다.
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* 마우스가 아닌 입력에서 실패할 수 있다. 그래도 눌러서 고르면 된다 */
      }

      const move = (ev: PointerEvent) => {
        const far =
          Math.abs(ev.clientX - from.x) + Math.abs(ev.clientY - from.y);
        if (!dragging.current && far < DRAG_SLOP) return;
        dragging.current = true;
        ev.preventDefault();
        setOver(dayUnder(ev.clientX, ev.clientY));
      };

      const up = (ev: PointerEvent) => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);

        /*
         * 터치는 pointerup 뒤에 click 을 한 번 더 쏜다. 그런데 막대는
         * 이미 화면 아래에 떠 있어서, 손가락이 있던 자리가 막대 위면
         * 그 click 이 엉뚱한 요일을 누르거나 "그만둘래요" 를 누른다.
         * (실제로 눌러서 고르는 길이 통째로 안 먹었다)
         *
         * 이 제스처가 만든 click 딱 하나만 삼킨다.
         */
        const swallow = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(
          () => document.removeEventListener("click", swallow, true),
          400,
        );

        if (!dragging.current) return; // 그냥 눌렀다 -> 막대를 열어둔다
        const hit = dayUnder(ev.clientX, ev.clientY);
        setOver(null);
        if (hit === null) {
          setPicking(null); // 요일 밖에 놓았다 -> 없던 일로
          return;
        }
        commit(recipeId, hit === "none" ? null : hit);
      };

      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [commit],
  );

  return (
    <PickDayContext.Provider value={{ start }}>
      {children}

      {picking && (
        <div className={styles.bar} role="dialog" aria-label="요일 고르기">
          <div className={styles.what}>
            <span className={styles.title}>{picking.title}</span>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setPicking(null)}
            >
              그만둘래요
            </button>
          </div>
          <p className={styles.lead}>무슨 요일에 먹을까요?</p>
          <div className={styles.days}>
            {DAYS.map((label, d) => (
              <button
                key={label}
                type="button"
                data-day={d}
                className={`ds-chip ${styles.slot} ${over === d ? styles.over : ""}`}
                onClick={() => commit(picking.recipeId, d)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              data-day="none"
              className={`ds-chip ${styles.slot} ${
                over === "none" ? styles.over : ""
              }`}
              onClick={() => commit(picking.recipeId, null)}
            >
              미정
            </button>
          </div>
        </div>
      )}
    </PickDayContext.Provider>
  );
}
