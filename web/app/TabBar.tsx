"use client";

/**
 * 아래 탭바 — 레시피 · 식단 · 장보기 (세 축)
 *
 * 위쪽 탭에서 아래로 내렸다. 폰은 한 손으로 쥐고, 엄지가 닿는 데는
 * 화면 아래다. 위에 있던 탭은 제일 먼 자리에 있었다.
 *
 * **냉장고 재료(`?have=`)를 들고 다닌다.** 칩은 장보기 화면에만 있지만
 * (거기가 답을 쓰는 자리다) 식단도 그 값을 읽어서 "다 있어요" 를 낸다.
 * 주소에만 사는 값이라 (지시서 6장) 화면을 옮길 때 같이 옮겨줘야 한다.
 *
 * 레시피 추가·상세처럼 "들어갔다 나오는" 화면에서는 숨는다. 거기서는
 * 하던 일을 끝내는 게 먼저고, 탭바가 있으면 빠져나가는 문이 두 개가 된다.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./TabBar.module.css";

const TABS = [
  { href: "/recipes", label: "레시피" },
  { href: "/", label: "식단" },
  { href: "/shopping", label: "장보기" },
] as const;

const HIDE_ON = ["/add", "/recipe", "/import", "/share"];

export default function TabBar() {
  const path = usePathname();
  const params = useSearchParams();
  if (HIDE_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const carry = new URLSearchParams();
  for (const key of ["have", "haveRaw"]) {
    const v = params.get(key);
    if (v) carry.set(key, v);
  }
  const q = carry.toString();

  return (
    <nav className={styles.bar} aria-label="화면">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={q ? `${t.href}?${q}` : t.href}
            className={`${styles.tab} ${on ? styles.on : ""}`}
            aria-current={on ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
