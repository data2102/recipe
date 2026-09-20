/**
 * 앱 껍데기 — **화면은 셋이다: 식단 · 메뉴 고르기 · 장보기**
 *
 * 웹과 같은 축이다 (`web/app/TabBar.tsx`). 한 화면에 다 넣었더니 폰에서
 * 2,200px 짜리 한 장이 돼서, 마트에서 쓰는 장보기까지 여섯 번을 밀어야
 * 했다. 새 기능을 넣을 때 **어느 축의 일인지 먼저 정한다.**
 *
 * 순서도 웹과 같다. 마트에서 여는 장보기가 오른쪽 끝이라 엄지에 가깝다.
 */

import { Tabs, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, ScrollView, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Tap from "../components/Tap";
import { radius, sp, TOUCH, themed, useColors, type Colors } from "../lib/tokens";

/**
 * 아이콘 대신 글자를 쓴다.
 *
 * 웹 탭바가 그렇게 하고 있다 — 아이콘 세트를 하나 더 들이면 웹과 앱의
 * 생김새가 갈린다. 아이콘을 넣을 거면 **양쪽을 같이** 바꾼다.
 *
 * **아이콘 자리가 아니라 글자 자리에 넣는다.** 아이콘 칸은 좁아서
 * "메뉴 고르기" 가 세 줄로 접혔다 (실제로 그렇게 나왔다).
 * `numberOfLines={1}` 은 그래도 접히지 않게 하는 마지막 빗장이다.
 */
function label(text: string, focused: boolean, c: Colors) {
  return (
    <Text
      numberOfLines={1}
      style={{
        fontSize: 12,
        fontWeight: focused ? "700" : "500",
        color: focused ? c.accentStrong : c.textTertiary,
      }}
    >
      {text}
    </Text>
  );
}

/**
 * 앱이 터졌을 때 — **무엇이 터졌는지 화면에 적는다.**
 *
 * 이게 없으면 Expo Go 가 자기 파란 화면("Something went wrong")을 내는데,
 * 거기에는 **원인이 한 글자도 없다.** 실제로 그 화면 하나를 붙들고
 * 하루를 태웠다: 번들도 정상이고 버전도 맞는데 폰에서만 죽었고, 로그는
 * "View error log" 를 눌러야 나오는 자리에 숨어 있었다.
 *
 * 그래서 **오류 메시지를 우리 화면에 그대로 낸다.** 사용자에게도 이게
 * 맞다 — "뭔가 잘못됐어요" 보다 "무엇이" 가 있어야 다음 걸음이 생긴다
 * (원칙 ③). 스택은 접지 않고 그냥 아래에 둔다. 보기 싫은 것보다
 * 원인을 못 찾는 게 나쁘다.
 *
 * expo-router 가 route 파일의 `ErrorBoundary` **이름 붙은 export** 를
 * 찾아서 쓴다 (`views/Try.tsx`). `_layout.tsx` 에 두면 아래 화면 전부를
 * 받는다 — 화면마다 따로 두지 마라.
 *
 * **모듈이 읽히다 터지는 것까지는 못 잡는다.** 그건 React 가 그리기
 * 전이라 경계가 없다. 그때는 여전히 Expo Go 의 파란 화면이다.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { s } = useCrash();
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>앱이 멈췄어요</Text>
      <Text style={s.what}>{error?.message || String(error)}</Text>
      <Tap style={s.button} onPress={() => void retry()}>
        <Text style={s.buttonText}>다시 해볼게요</Text>
      </Tap>
      <Text style={s.label}>어디서 났는지</Text>
      <Text style={s.stack} selectable>
        {error?.stack || "(스택이 없어요)"}
      </Text>
      <Text style={s.label}>지금 설정</Text>
      <Text style={s.stack} selectable>
        {[
          `서버 주소: ${process.env.EXPO_PUBLIC_API_URL || "(안 적혀 있음)"}`,
          `토큰: ${process.env.EXPO_PUBLIC_API_TOKEN ? "있음" : "(안 적혀 있음)"}`,
          `플랫폼: ${Platform.OS} ${String(Platform.Version)}`,
        ].join("\n")}
      </Text>
    </ScrollView>
  );
}

const useCrash = themed((c) => ({
  wrap: { padding: sp[5], paddingTop: sp[12], gap: sp[3] },
  title: { fontSize: 24, fontWeight: "700" as const, color: c.text },
  what: { fontSize: 15, color: c.text },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: c.textTertiary,
    marginTop: sp[4],
  },
  stack: {
    fontSize: 11,
    color: c.textSecondary,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    padding: sp[3],
  },
  button: {
    minHeight: TOUCH,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: c.accentStrong,
    borderRadius: radius.md,
    marginTop: sp[2],
  },
  buttonText: { color: c.onAccent, fontWeight: "600" as const, fontSize: 15 },
}));

export default function Layout() {
  /*
   * 어두운 모드는 폰 설정을 따라간다 (lib/tokens.ts). 앱 안에 스위치는
   * 없다 — 웹도 같다 (`web/app/globals.css` 의 ⑥).
   */
  const c = useColors();

  return (
    <SafeAreaProvider>
      {/* 위 상태표시줄 글자색. `auto` 가 지금 바탕을 보고 고른다 */}
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
          },
          // 아이콘이 없으니 글자가 가운데 오게 그 칸을 비운다
          tabBarIconStyle: { display: "none" },
          tabBarItemStyle: { minHeight: TOUCH },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "식단",
            tabBarLabel: ({ focused }) => label("식단", focused, c),
          }}
        />
        <Tabs.Screen
          name="recipes"
          options={{
            title: "메뉴 고르기",
            tabBarLabel: ({ focused }) => label("메뉴 고르기", focused, c),
          }}
        />
        <Tabs.Screen
          name="shopping"
          options={{
            title: "장보기",
            tabBarLabel: ({ focused }) => label("장보기", focused, c),
          }}
        />

        {/*
          탭이 아닌 화면들. **탭바에 안 올린다** — 화면은 셋이라는 규칙은
          그대로다. 지난 주는 식단에서, 레시피 상세는 목록에서 들어간다.
          `href: null` 이 그 뜻이다 (경로는 살아 있고 칸만 없다).
        */}
        <Tabs.Screen name="weeks" options={{ href: null }} />
        <Tabs.Screen name="add" options={{ href: null }} />
        <Tabs.Screen name="recipe/[id]" options={{ href: null }} />
        <Tabs.Screen name="youtube" options={{ href: null }} />
      </Tabs>
    </SafeAreaProvider>
  );
}
