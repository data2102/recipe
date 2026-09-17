/**
 * 화면이 옆으로 미끄러진다 — **탭 전환에 방향을 준다**
 *
 * 예전에는 탭 셋이 똑같이 순간이동했다. 어디서 어디로 갔는지 화면이
 * 말해주지 않아서, 누른 게 먹었는지도 한 박자 뒤에야 알았다
 * (docs/ui-references.md 11장 B1).
 *
 * 방향은 탭바가 정해서 실어 보낸다 (`TabBar.tsx` 의 `transitionTypes`).
 * 오른쪽 탭으로 가면 `nav-forward`, 왼쪽이면 `nav-back` 이다.
 *
 * **`default: "none"` 이 중요하다.** 이게 없으면 방향이 안 실린 이동
 * (브라우저 뒤로 가기, `router.refresh()`, 서버 액션 뒤의 다시 그리기)
 * 에도 화면이 미끄러진다 — 체크 한 번에 화면이 통째로 움직이면
 * 마트에서 쓸 수가 없다.
 *
 * **layout 이 아니라 page 마다 감싼다.** layout 은 이동해도 안 사라져서
 * enter·exit 가 아예 안 돈다 (Next 문서 "Put the wrapper in each
 * page.tsx, not the layout").
 *
 * 브라우저가 View Transitions 를 모르면 **아무 일도 안 일어난다** —
 * 화면은 그대로 돌아간다. 움직임을 싫어하는 사람에게도 안 움직인다
 * (`globals.css` 의 ⑨).
 */

import { ViewTransition } from "react";

const BOTH = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
} as const;

export default function Slide({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={BOTH} exit={BOTH} default="none">
      {children}
    </ViewTransition>
  );
}
