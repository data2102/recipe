/**
 * 여백 토큰을 네이티브로 — **베낀 것이다. 값을 여기서 바꾸지 마라.**
 *
 * 웹은 `web/app/globals.css` 의 `light-dark(밝은 값, 어두운 값)` 을 쓴다.
 * RN 은 CSS 변수를 못 읽어서 같은 값을 TS 로 한 번 더 적는다. 색을 화면에
 * 하드코딩하지 않는다는 규칙은 그대로다 — 다만 여기가 그 "한 군데" 가 된다.
 *
 * **원본이 바뀌면 여기도 바꾼다.** `web/app/yeobaek/*.css` 자체도 복사본이라
 * (원본은 별도 저장소) 사슬이 하나 더 길어진 셈이다. 베낀 것은 갈라지고,
 * **한쪽만 고친 게 눈에 안 띈다** — 그래서 `tools/verify_tokens.py` 가 웹의
 * 값과 여기 값을 하나씩 대조한다. 어긋나면 CI 가 막는다.
 *
 * ---
 *
 * **어두운 모드는 폰 설정을 따라간다. 앱 안에 스위치는 없다.**
 * 웹도 같다 (`globals.css` 의 ⑥). 밝게/어둡게는 폰이 이미 정해주는 것이고,
 * 설정이 하나 늘면 "어느 쪽이 지금인가" 를 두 군데서 봐야 한다.
 *
 * 어두운 값은 **여백의 다크 팔레트를 그대로 쓰지 않는다.** 그쪽 액센트는
 * 형광 시안인데 모니터링 대시보드용이라 이 앱에 안 맞는다
 * (docs/ui-references.md 8장 C). 무채색 면·글자는 그대로 가져오고
 * 파랑 계열만 우리 값으로 바꿨다. 웹과 **같은 값**이다 — 한쪽만 고치지 마라.
 */

import { StyleSheet, useColorScheme } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

const light = {
  /** 누를 수 있는 것에만 쓴다. "68일" 같은 정보에는 쓰지 마라 */
  accent: "#3182f6",
  accentStrong: "#1d63c9", // 글자를 얹는 배경 / 연한 면 위의 글자
  accentBg: "#e8f3ff",
  accentPressed: "#2264c4",
  /** accent · accentStrong 위에 얹는 글자. 밝을 땐 흰색, 어두울 땐 검정 */
  onAccent: "#ffffff",

  /** 오래된 것 — 배지가 아니라 글자색으로 (지시서 5장) */
  warm: "#c96f4c",
  warmBg: "#faece7",

  text: "#191f28",
  textSecondary: "#4e5968",
  /**
   * 여백 원본은 13px 캡션에서 대비가 3.04:1 이라 WCAG AA 에 못 미쳤다.
   * 웹도 `globals.css` 에서 같은 값으로 덮어쓴다.
   */
  textTertiary: "#626c7a",
  textDisabled: "#b0b8c1",

  bg: "#f2f4f6",
  surface: "#ffffff",
  surfaceSunken: "#f9fafb",

  border: "#eef1f4",
  borderStrong: "#d1d6db",

  /** 담기 판 뒤에 까는 막. 웹에는 짝이 되는 토큰이 없다 (모듈이 직접 적는다) */
  scrim: "rgba(15,17,23,0.45)",
} as const;

export type Colors = { [K in keyof typeof light]: string };

/**
 * 어두운 쪽. 대비는 재서 넣었다 (실제 짝으로):
 * 본문 14.0:1 · 보조 10.4:1 · 캡션 5.4:1 · 링크 7.9:1 · 파란 버튼 8.1:1 ·
 * 켠 칩 7.2:1 — 전부 AA(4.5:1) 위다.
 */
const dark: Colors = {
  accent: "#5a9cff",
  accentStrong: "#7cb2ff",
  accentBg: "#16233a",
  accentPressed: "#3f88f0",
  onAccent: "#0b1a2e",

  warm: "#e39e7f",
  warmBg: "#33231b",

  text: "#e6e8ee",
  textSecondary: "#c5c9d3",
  textTertiary: "#8a90a2",
  textDisabled: "#565b68",

  bg: "#0f1117",
  surface: "#181b24",
  surfaceSunken: "#12141b",

  /*
   * 여백의 다크 경계선은 카드 위에서 1.07:1 이라 사실상 안 보인다.
   * 밝은 쪽 짝만큼은 보이게 올렸다 — "집에 있어요" 처럼 **테두리 하나로
   * 버튼인 줄 아는** 자리가 있다 (docs/ui-references.md 9장).
   */
  border: "#2a2e3a",
  borderStrong: "#454c5b",

  scrim: "rgba(0,0,0,0.6)",
};

type Sheet = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * 화면의 스타일을 밝은 판·어두운 판 **두 벌로 미리 만들어 둔다.**
 *
 *     const useTheme = themed((c) => ({ title: { color: c.text } }));
 *     export default function Screen() {
 *       const { s, c } = useTheme();
 *
 * `StyleSheet.create` 를 그릴 때마다 부르면 안 되고, 모듈 바깥에 한 벌만
 * 두면 색이 켜질 때 한 번 정해져서 폰 설정을 바꿔도 안 따라온다.
 * 두 벌을 미리 만들고 **고르기만** 한다.
 *
 * `c` 를 같이 돌려주는 이유: `<ActivityIndicator color={...}>` 처럼
 * 스타일이 아니라 값으로 받는 자리가 있다.
 */
export function themed<T extends Sheet>(make: (c: Colors) => T) {
  const sheets = {
    light: StyleSheet.create(make(light)),
    dark: StyleSheet.create(make(dark)),
  };
  return function useTheme(): { s: T; c: Colors } {
    const night = useColorScheme() === "dark";
    return { s: night ? sheets.dark : sheets.light, c: night ? dark : light };
  };
}

/** 스타일 없이 색만 필요할 때 (탭바처럼 `StyleSheet` 를 안 쓰는 자리) */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

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
