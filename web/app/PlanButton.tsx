"use client";

/**
 * 담기 — **누르면 날짜를 묻는다.**
 *
 * 예전에는 담기가 "이번 주 / 다음 주" 중 화면이 보고 있던 쪽으로 들어갔고,
 * 날짜는 식단에 가서 따로 정했다. 두 번 일이다 — 고를 때 이미 "목요일에
 * 이거" 라고 정해놓고 누르는 경우가 대부분인데, 그 말을 받아줄 데가 없어서
 * 나중에 식단에서 다시 골라야 했다.
 *
 * 그래서 담기 한 번에 날짜까지 받는다. 고르는 자리에는 **그날 이미 담긴
 * 메뉴와 적어둔 약속**을 같이 보여준다 — 비어 있는 날을 찾는 게 이 화면을
 * 여는 이유이기 때문이다.
 *
 * 날짜는 이번 주와 다음 주뿐이다 (lib/shopping.ts Which). 장보기가 주
 * 단위라 그 밖의 날짜는 담을 목록이 없다.
 *
 * "날짜 없이 담기" 를 남겨둔다 — 요일은 안 정해도 된다는 규칙은 그대로다.
 * 그때만 어느 주인지 물어본다. 날짜를 고르면 주는 날짜가 정한다.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { planOnDate, removeFromWeek } from "./actions";
import { dateFull, dateTiny } from "@/lib/say";
import {
  lastPlaced,
  type PickDay,
  type Placement,
  type Which,
} from "@/lib/plan.types";
import styles from "./PlanButton.module.css";

const WEEK_NAME: Record<Which, string> = { this: "이번 주", next: "다음 주" };

/**
 * 담긴 자리를 버튼에 적는다.
 *
 * **마지막 날짜를 적는다** — 한 주에 여러 날짜에 담을 수 있게 되면서
 * (2026-09-19) 자리가 여럿일 수 있는데, 카드 한 줄에 다 적으면 요리
 * 이름보다 길어진다. 쓰는 사람이 정한 것이다: "표시는 마지막 날짜만".
 *
 * 여러 날이면 개수를 같이 적는다 — 안 그러면 나머지가 사라진 것으로
 * 읽힌다 (그게 이 변경을 부른 증상이었다).
 */
export function placedLabel(placed: Placement[]): string {
  if (placed.length === 0) return "+ 담기";

  const last = lastPlaced(placed)!;

  const more = placed.length > 1 ? ` · ${placed.length}번` : "";
  if (last.date) return `✓ ${dateTiny(last.date)}${more}`;
  return `✓ ${WEEK_NAME[last.which]} · 날짜 미정${more}`;
}

export default function PlanButton({
  recipeId,
  title,
  days,
  today,
  placed,
  className = "ds-btn ds-btn-secondary",
  label,
  onChange,
}: {
  recipeId: number;
  title: string;
  days: PickDay[];
  today: string;
  placed: Placement[];
  className?: string;
  /** 버튼 글자를 직접 정할 때 (상세 화면처럼 한 줄짜리 버튼) */
  label?: string;
  /** 화면이 낙관적으로 먼저 그릴 때. 서버가 실패하면 되돌아온다 */
  onChange?: (next: Placement[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  /** 뒤로가기로 닫혔나 — 그때는 히스토리를 우리가 되돌리면 안 된다 */
  const popped = useRef(false);

  /*
    쓸어내려 닫기. 손가락이 시작한 자리와 지금 자리만 들고 있으면 된다.

    **제스처만 두지 않는다** — "닫기" 버튼도 스크림도 그대로다. 발견할 수
    없는 동작은 없는 동작이다 (docs/ui-references.md 5장).
  */
  const [drag, setDrag] = useState(0);
  const grabbed = useRef<number | null>(null);

  /** 이만큼 내리면 닫는다. 더 짧으면 스크롤하다 실수로 닫힌다 */
  const CLOSE_AT = 96;

  /*
    **안드로이드 뒤로가기로 판이 닫혀야 한다.**

    예전에는 아무것도 안 해서, 판을 열고 뒤로가기를 누르면 판이 닫히는 게
    아니라 **화면을 통째로 떠났다.** 설치해서 쓰는 앱이라 더 어긋나 보인다 —
    폰의 앱들은 다 이렇게 동작한다.

    열 때 히스토리를 한 칸 넣고, 뒤로가기(popstate)가 오면 닫는다. 스크림을
    누르거나 날짜를 골라서 닫힐 때는 우리가 그 칸을 도로 뺀다 — 안 그러면
    다음 뒤로가기가 아무 일도 안 하는 것처럼 보인다.

    뒤 화면 스크롤도 같이 잠근다. 안 그러면 판 위에서 손가락을 움직일 때
    뒤에 있는 열나흘 목록이 같이 밀린다.
  */
  useEffect(() => {
    if (!open) return;

    popped.current = false;
    window.history.pushState({ planSheet: true }, "");
    const back = () => {
      popped.current = true;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("popstate", back);
    document.addEventListener("keydown", esc);

    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", back);
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = bodyOverflow;
      if (!popped.current) window.history.back();
    };
  }, [open]);

  /**
   * 날짜를 누르면 **더한다. 이미 담긴 날을 누르면 뺀다** (2026-09-19).
   *
   * 예전에는 누르면 그 요리의 날짜가 그 날로 **옮겨갔다.** 한 주에 행이
   * 하나뿐이었기 때문인데, 9/17 에 담아둔 걸 9/21 로 바꾸면 9/17 이
   * 사라져서 "기록이 지워졌다" 로 읽혔다.
   *
   * 이제 누르는 것은 그 하루를 켜고 끄는 일이다. 옮기려면 새 날을 켜고
   * 옛 날을 끈다 — 두 번이지만 **무엇이 일어났는지가 보인다.**
   *
   * **판을 안 닫는다.** 여러 날을 고르러 연 자리라, 한 번 누를 때마다
   * 닫으면 두 번째 날짜를 고르려고 다시 열어야 한다.
   */
  function pick(date: string | null, which: Which) {
    setError("");
    const on = placed.some((p) => p.date === date && p.which === which);

    start(async () => {
      onChange?.(
        on
          ? placed.filter((p) => !(p.date === date && p.which === which))
          : [...placed, { date, which }],
      );
      const form = new FormData();
      form.set("id", String(recipeId));
      form.set("date", date ?? "");
      form.set("week", which);
      try {
        await (on ? removeFromWeek(form) : planOnDate(form));
      } catch {
        onChange?.(placed);
        setError(
          on
            ? "빼지 못했어요. 다시 눌러주세요."
            : "담지 못했어요. 다시 골라주세요.",
        );
      }
    });
  }

  /**
   * 식단에서 빼기 — 담긴 주에서 **통째로** 뺀다 (날짜를 안 보낸다).
   *
   * **주 단위로 한 번씩만 부른다.** 한 주에 여러 날짜에 담길 수 있게
   * 되면서 `placed` 가 자리마다 한 줄인데, 그대로 돌면 같은 주를 세 번
   * 지운다 — 뒤의 둘은 이미 없는 것을 지우는 왕복이다.
   */
  function clear() {
    setError("");
    start(async () => {
      onChange?.([]);
      try {
        for (const w of new Set(placed.map((p) => p.which))) {
          const form = new FormData();
          form.set("id", String(recipeId));
          form.set("week", w);
          await removeFromWeek(form);
        }
        setOpen(false);
      } catch {
        onChange?.(placed);
        setError("빼지 못했어요. 다시 눌러주세요.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {pending ? "저장 중…" : (label ?? placedLabel(placed))}
      </button>

      {open && (
        <div
          className={styles.scrim}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} 날짜 고르기`}
            onClick={(e) => e.stopPropagation()}
            style={drag ? { transform: `translateY(${drag}px)` } : undefined}
          >
            {/*
              손잡이. 쥐고 내리면 닫힌다 — 폰에서 판이 뜨면 손이 먼저
              여기로 간다. 손잡이에서만 끌 수 있게 한다: 목록 위에서도
              되면 날짜를 훑다가 판이 닫힌다.
            */}
            <div
              className={styles.grip}
              aria-hidden="true"
              onTouchStart={(e) => {
                grabbed.current = e.touches[0].clientY;
              }}
              onTouchMove={(e) => {
                if (grabbed.current === null) return;
                const moved = e.touches[0].clientY - grabbed.current;
                setDrag(moved > 0 ? moved : 0); // 위로는 안 끌린다
              }}
              onTouchEnd={() => {
                const moved = drag;
                grabbed.current = null;
                setDrag(0);
                if (moved > CLOSE_AT) setOpen(false);
              }}
            >
              <span className={styles.gripBar} />
            </div>

            <header className={styles.head}>
              <div>
                <p className={styles.dish}>{title}</p>
                <h2 className={styles.ask}>언제 먹을까요?</h2>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </header>

            {error && (
              <p className="ds-banner ds-banner-danger" role="alert">
                {error}
              </p>
            )}

            <div className={styles.scroll}>
              {(["this", "next"] as Which[]).map((w) => (
                <section key={w}>
                  <h3 className={styles.weekName}>{WEEK_NAME[w]}</h3>
                  <ul className={styles.days}>
                    {days
                      .filter((d) => d.which === w)
                      .map((d) => {
                        const mine = placed.some((p) => p.date === d.iso);
                        return (
                          <li key={d.iso}>
                            <button
                              type="button"
                              className={`${styles.day} ${mine ? styles.mine : ""} ${
                                d.iso < today ? styles.gone : ""
                              }`}
                              disabled={pending}
                              onClick={() => pick(d.iso, w)}
                            >
                              <span className={styles.when}>
                                {dateFull(d.iso)}
                              </span>
                              {d.iso === today && (
                                <span className={styles.badge}>오늘</span>
                              )}
                              <span className={styles.what}>
                                {/*
                                  적어둔 약속이 먼저다. 그날 뭘 담았는지보다
                                  "이날은 안 되는 날" 이 고르는 데 더 크다.
                                */}
                                {d.note ||
                                  (d.titles.length
                                    ? d.titles.join(" · ")
                                    : "비어 있어요")}
                              </span>
                              {mine && (
                                <span className={styles.tick}>
                                  담겨 있어요 · 누르면 빼요
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    <li>
                      <button
                        type="button"
                        className={`${styles.day} ${styles.someday} ${
                          placed.some((p) => p.date === null && p.which === w)
                            ? styles.mine
                            : ""
                        }`}
                        disabled={pending}
                        onClick={() => pick(null, w)}
                      >
                        <span className={styles.when}>날짜는 나중에</span>
                        <span className={styles.what}>
                          {placed.some((p) => p.date === null && p.which === w)
                            ? "담겨 있어요 · 누르면 빼요"
                            : `${WEEK_NAME[w]} 장보기에는 들어가요`}
                        </span>
                      </button>
                    </li>
                  </ul>
                </section>
              ))}
            </div>

            {placed.length > 0 && (
              <button
                type="button"
                className={styles.remove}
                disabled={pending}
                onClick={clear}
              >
                식단에서 빼기
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
