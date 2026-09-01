"use client";

/**
 * 레시피 한 줄 (지시서 3장)
 *
 * 행을 탭하면 `만들었어요` `레시피 열기` `별로였어요` 가 나온다.
 * `만들었어요` 는 **한 번에 끝나야 한다** — 탭하면 오늘로 바로 기록된다.
 * 길게 누르면 날짜를 고른다 (그날 체크 못 하고 다음날 하는 경우가 흔하고,
 * 초기 데이터를 채울 때 "두 달 전쯤" 이 필요하다).
 */

import { useRef, useState } from "react";
import { addToWeek, markBad, markCooked } from "./actions";
import { usePickDay } from "./PickDay";
import styles from "./RecipeRow.module.css";

const LONG_PRESS_MS = 450;

export type Props = {
  id: number;
  title: string;
  meta: string;
  /** 60일 넘게 안 만든 것. 배지 대신 글자색만 바꾼다 (지시서 5장) */
  warm?: boolean;
  sourceUrl: string | null;
  today: string;
  /**
   * 이번 주 담기 버튼. 탭 3 에서만 붙는다 (지시서 3장).
   * "in" 은 이미 담은 것 — 또 누를 게 없으니 버튼으로 두지 않는다.
   *
   * 빼기는 여기 없다. 담은 뒤에는 이번 주 식단에서 뺀다 (app/Week.tsx) —
   * 추천 목록과 식단 두 군데에 빼기가 있으면 어디서 뺀 건지 헷갈린다.
   */
  pick?: "add" | "in";
};

export default function RecipeRow({
  id,
  title,
  meta,
  warm,
  sourceUrl,
  today,
  pick,
}: Props) {
  const picker = usePickDay();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function close() {
    setOpen(false);
    setPicking(false);
  }

  function pressStart() {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setPicking(true);
    }, LONG_PRESS_MS);
  }

  function pressEnd() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <li className={styles.row}>
      <div className={styles.rowWrap}>
        <button
          type="button"
          className={styles.rowButton}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          {/* 좌측 아이콘칩 — 여백의 리스트 행 규칙 (design-system.md 6장).
              아이콘 세트를 섞지 않으려고 요리 이름 첫 글자를 쓴다 */}
          <span className={styles.icon} aria-hidden="true">
            {Array.from(title)[0] ?? "?"}
          </span>
          <span className={styles.texts}>
            <span className={styles.title}>{title}</span>
            <span className={`${styles.meta} ${warm ? styles.warm : ""}`}>
              {meta}
            </span>
          </span>
          {/* 오른쪽에 다른 버튼이 없을 때만. 탭하면 열린다는 표시다 */}
          {!pick && (
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          )}
        </button>

        {pick === "in" && (
          <span className={styles.inBasket}>
            <span className={`ds-badge ${styles.quietBadge}`}>담아뒀어요</span>
          </span>
        )}

        {/*
          담기는 누르면 요일 막대가 뜨고, 그대로 끌어서 요일에 놓아도 된다
          (app/PickDay.tsx). 탭 1·2 처럼 막대가 없는 화면에서는 predefined
          동작대로 그냥 담긴다 — 그래서 provider 가 없으면 form 으로 돌아간다.
        */}
        {pick === "add" && picker && (
          <button
            type="button"
            className={`${styles.pick} ${styles.grab}`}
            onPointerDown={(e) => picker.start(id, title, e)}
          >
            담기
          </button>
        )}

        {pick === "add" && !picker && (
          <form action={addToWeek}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className={styles.pick}>
              담기
            </button>
          </form>
        )}
      </div>

      {open && (
        <div className={styles.sheetBg} onClick={close}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.sheetTitle}>{title}</h2>
            <p className={styles.sheetSub}>{meta}</p>

            {picking ? (
              <form action={markCooked} className={styles.pickForm}>
                <input type="hidden" name="id" value={id} />
                <div className="ds-field">
                  <label className="ds-label" htmlFor={`d${id}`}>
                    언제 만들었어요?
                  </label>
                  <input
                    id={`d${id}`}
                    className="ds-input"
                    type="date"
                    name="cookedOn"
                    defaultValue={today}
                    max={today}
                  />
                  <span className="ds-help">
                    정확하지 않아도 돼요. 순서만 맞으면 됩니다.
                  </span>
                </div>
                <div className={styles.actions}>
                  <button type="submit" className="ds-btn ds-btn-primary ds-btn-block">
                    이 날로 기록
                  </button>
                  <button
                    type="button"
                    className="ds-btn ds-btn-secondary ds-btn-block"
                    onClick={() => setPicking(false)}
                  >
                    돌아가기
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.actions}>
                <form action={markCooked}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="ds-btn ds-btn-primary ds-btn-block"
                    onPointerDown={pressStart}
                    onPointerUp={pressEnd}
                    onPointerLeave={pressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => {
                      // 길게 눌러 날짜 선택으로 갔으면 오늘로 기록하지 않는다
                      if (longPressed.current) e.preventDefault();
                    }}
                  >
                    만들었어요
                  </button>
                </form>

                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-block"
                  onClick={() => setPicking(true)}
                >
                  다른 날에 만들었어요
                </button>

                {sourceUrl ? (
                  <a
                    className="ds-btn ds-btn-secondary ds-btn-block"
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    레시피 열기
                  </a>
                ) : (
                  <span className={`ds-btn ds-btn-secondary ds-btn-block ${styles.disabled}`}>링크가 없어요</span>
                )}

                <form action={markBad}>
                  <input type="hidden" name="id" value={id} />
                  <button type="submit" className="ds-btn ds-btn-secondary ds-btn-block">
                    별로였어요
                  </button>
                </form>
              </div>
            )}

            <button type="button" className={styles.close} onClick={close}>
              닫기
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
