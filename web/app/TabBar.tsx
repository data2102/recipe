"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./TabBar.module.css";

const TABS = [
  { href: "/recipes", label: "레시피" },
  { href: "/", label: "오늘 · 식단" },
  { href: "/shopping", label: "장보기" },
] as const;

const HIDE_ON = ["/add", "/recipe", "/import", "/share"];

export default function TabBar() {
  const path = usePathname();
  const params = useSearchParams();
  if (HIDE_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const carry = new URLSearchParams();
  for (const key of ["week"]) {
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
