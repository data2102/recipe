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

  /*
   * **탭은 옆으로 미끄러진다** (docs/ui-references.md 11장 B1).
   *
   * 화면 셋이 왼쪽부터 식단·고르기·장보기 순서로 서 있다. 오른쪽 탭으로
   * 가면 왼쪽으로 밀리고, 왼쪽 탭으로 가면 오른쪽으로 밀린다 — 방향이
   * 어디로 가는지를 말해준다. 지금은 셋이 똑같이 순간이동해서 **어디서
   * 어디로 갔는지 화면이 말해주지 않는다.**
   *
   * 방향은 자동으로 안 정해진다. 우리가 탭 순서로 정해서 실어 보낸다.
   */
  const here = TABS.findIndex((t) => t.href === path);

  return (
    <nav className={styles.bar} aria-label="화면">
      {TABS.map((t, i) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={q && t.href === "/shopping" ? `${t.href}?${q}` : t.href}
            className={`${styles.tab} ${on ? styles.on : ""}`}
            aria-current={on ? "page" : undefined}
            transitionTypes={
              here < 0 || i === here
                ? undefined
                : [i > here ? "nav-forward" : "nav-back"]
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
