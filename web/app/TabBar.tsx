"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./TabBar.module.css";

const TABS = [
  { href: "/", label: "식단" },
  { href: "/recipes", label: "메뉴 고르기" },
  { href: "/shopping", label: "장보기" },
] as const;

const HIDE_ON = ["/add", "/recipe", "/import", "/share"];

export default function TabBar() {
  const path = usePathname();
  const params = useSearchParams();
  if (HIDE_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  /*
   * **주는 장보기만 들고 다닌다.**
   *
   * 예전에는 탭바가 `?week=` 를 세 화면에 다 물려줬다. 식단과 고르기가
   * 주 단위로 갈려 있었기 때문인데, 이제 둘 다 날짜로 본다 (열나흘을
   * 쭉 늘어놓고, 담을 때 날짜를 고른다). 주가 남아 있는 건 장보기뿐이다 —
   * 장은 주에 한 번 보니까.
   */
  const week = params.get("week");
  const q = week === "next" ? "week=next" : "";

  return (
    <nav className={styles.bar} aria-label="화면">
      {TABS.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={q && t.href === "/shopping" ? `${t.href}?${q}` : t.href}
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
