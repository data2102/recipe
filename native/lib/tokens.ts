/**
 * 여백 토큰을 네이티브로 — **베낀 것이다. 값을 여기서 바꾸지 마라.**
 *
 * 웹은 `app/yeobaek/tokens.css` 의 `var(--...)` 를 쓴다. RN 은 CSS 변수를
 * 못 읽어서 같은 값을 TS 로 한 번 더 적는다. 색을 화면에 하드코딩하지
 * 않는다는 규칙은 그대로다 — 다만 여기가 그 "한 군데" 가 된다.
 *
 * **원본이 바뀌면 여기도 바꾼다.** `web/app/yeobaek/*.css` 자체도 복사본이라
 * (원본은 별도 저장소) 사슬이 하나 더 길어진 셈이다. 그래서 값마다 어느
 * 줄에서 온 것인지 적어둔다 — 대조가 눈으로 되게.
 *
 * 어두운 모드는 아직 없다. 웹에도 없고 (미룬 목록에 있다), 둘을 같이
 * 켜야 어긋나지 않는다.
 */

export const color = {
  /** 누를 수 있는 것에만 쓴다. "68일" 같은 정보에는 쓰지 마라 */
  accent: "#3182f6",
  accentStrong: "#1d63c9", // 흰 글자를 얹는 배경
  accentBg: "#e8f3ff",
  accentPressed: "#2264c4",

  /** 오래된 것 — 배지가 아니라 글자색으로 (지시서 5장) */
  warm: "#c96f4c",
  warmBg: "#faece7",

  text: "#191f28",
  textSecondary: "#4e5968",
  /**
   * 웹은 `globals.css` 에서 이 값을 `#626c7a` 로 덮어쓴다 — 원본
   * `#8b95a1` 은 13px 캡션에서 대비가 3.04:1 이라 WCAG AA 에 못 미쳤다.
   * 덮어쓴 값을 그대로 쓴다.
   */
  textTertiary: "#626c7a",
  textDisabled: "#b0b8c1",

  bg: "#f2f4f6",
  surface: "#ffffff",
  surfaceSunken: "#f9fafb",

  border: "#eef1f4",
  borderStrong: "#d1d6db",
} as const;

export const sp = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * 손가락이 닿는 것은 44 이상. 안드로이드 권장은 48 인데, 장보기처럼
 * 줄이 촘촘한 화면에서는 48 로 띄우면 한 화면에 들어오는 줄이 줄어든다.
 * 웹과 같은 값을 쓴다.
 */
export const TOUCH = 44;
