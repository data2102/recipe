"use client";

/**
 * 접었다 펴는 줄 — **`<details>` 대신**
 *
 * 앱 곳곳에서 `<details>`/`<summary>` 를 쓰고 있었다. 동작은 맞지만
 * 브라우저 기본 ▶ 삼각형이 붙어서, 설치해서 쓰는 폰 앱 안에 웹 문서
 * 한 조각이 섞여 있는 것처럼 보였다 (docs/ui-references.md 9장).
 *
 * 여백에는 이 모양이 없다 (`.ds-card`·`.ds-btn`·`.ds-chip`… 뿐이다).
 * 그래서 여기서 한 벌 만들고 여덟 군데가 같이 쓴다 — 모양을 화면마다
 * 다시 그리면 좋아져도 한 군데만 좋아진다. 생김새는 `globals.css` 의
 * `.ds-fold` 에 있고, 언젠가 여백으로 올릴 자리다
 * (`app/yeobaek/README.md` 의 "손볼 것").
 *
 * **`<details>` 로 되돌리지 마라.** 삼각형이 돌아온다.
 */

import { useState, type ReactNode } from "react";

export default function Fold({
  title,
  /** 제목 오른쪽에 적는 한 줄 — 접힌 채로도 알 수 있어야 한다 */
  hint,
  /** 처음부터 펴둘 것인가 */
  open: initial = false,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initial);

  return (
    <div className="ds-fold">
      <button
        type="button"
        className="head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {/*
          꺾쇠는 **글자 뒤**가 아니라 줄 끝에 둔다. 앞에 두면 제목이
          밀려서 줄마다 들쭉날쭉해 보인다.
        */}
        <span className="label">{title}</span>
        {hint && <span className="hint">{hint}</span>}
        <span className="chevron" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      {open && <div className="body">{children}</div>}
    </div>
  );
}
