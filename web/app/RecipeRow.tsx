"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { addToWeek, dropRecipe, markCooked } from "./actions";
import ActionButton from "./ActionButton";
import styles from "./RecipeRow.module.css";

const LONG_PRESS_MS = 450;

export type Props = {
  id: number;
  title: string;
  meta: string;

  warm?: boolean;
  sourceUrl: string | null;
  today: string;

  pick?: "add" | "in";

  week?: "this" | "next";
};

export default function RecipeRow({
  id,
  title,
  meta,
  warm,
  sourceUrl,
  today,
  pick,
  week = "this",
}: Props) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const [dropping, setDropping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  function close() {
    setOpen(false);
    setPicking(false);
    setDropping(false);
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
        <Link href={`/recipe/${id}?week=${week}`} className={styles.rowButton}>
          <span className={styles.texts}>
            <span className={styles.title}>{title}</span>
            <span className={`${styles.meta} ${warm ? styles.warm : ""}`}>
              {meta}
            </span>
          </span>

          {!pick && (
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          )}
        </Link>
        <button
          type="button"
          className={styles.moreAction}
          aria-label={`${title} 더보기`}
          onClick={() => setOpen(true)}
        >
          ⋯
        </button>

        {pick === "in" && (
          <span className={styles.inBasket}>
            <span className={`ds-badge ${styles.quietBadge}`}>담아뒀어요</span>
          </span>
        )}

        {pick === "add" && (
          <ActionButton
            action={addToWeek}
            fields={{ id, week }}
            label="담기"
            className={styles.pick}
          />
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

            {dropping ? (
              <div className={styles.actions}>
                <p className={styles.sheetSub}>
                  이 레시피를 지울게요. 재료·만드는 법·만든 기록까지 같이
                  사라지고 되돌릴 수 없어요.
                </p>
                <form action={dropRecipe}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="ds-btn ds-btn-primary ds-btn-block"
                  >
                    지울게요
                  </button>
                </form>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-block"
                  onClick={() => setDropping(false)}
                >
                  돌아가기
                </button>
              </div>
            ) : picking ? (
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
                  <button
                    type="submit"
                    className="ds-btn ds-btn-primary ds-btn-block"
                  >
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

                <Link
                  href={`/recipe/${id}`}
                  className="ds-btn ds-btn-secondary ds-btn-block"
                >
                  만드는 법 보기
                </Link>

                {sourceUrl ? (
                  <a
                    className="ds-btn ds-btn-secondary ds-btn-block"
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    원본 열기
                  </a>
                ) : null}

                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-block"
                  onClick={() => setDropping(true)}
                >
                  레시피 삭제
                </button>
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
