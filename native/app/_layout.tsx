/**
 * 앱 껍데기 — **화면은 셋이다: 식단 · 메뉴 고르기 · 장보기**
 *
 * 웹과 같은 축이다 (`web/app/TabBar.tsx`). 한 화면에 다 넣었더니 폰에서
 * 2,200px 짜리 한 장이 돼서, 마트에서 쓰는 장보기까지 여섯 번을 밀어야
 * 했다. 새 기능을 넣을 때 **어느 축의 일인지 먼저 정한다.**
 *
 * 순서도 웹과 같다. 마트에서 여는 장보기가 오른쪽 끝이라 엄지에 가깝다.
 */

import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { color, TOUCH } from "../lib/tokens";

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
function label(text: string, focused: boolean) {
  return (
    <Text
      numberOfLines={1}
      style={{
        fontSize: 12,
        fontWeight: focused ? "700" : "500",
        color: focused ? color.accentStrong : color.textTertiary,
      }}
    >
      {text}
    </Text>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: color.surface,
            borderTopColor: color.border,
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
            tabBarLabel: ({ focused }) => label("식단", focused),
          }}
        />
        <Tabs.Screen
          name="recipes"
          options={{
            title: "메뉴 고르기",
            tabBarLabel: ({ focused }) => label("메뉴 고르기", focused),
          }}
        />
        <Tabs.Screen
          name="shopping"
          options={{
            title: "장보기",
            tabBarLabel: ({ focused }) => label("장보기", focused),
          }}
        />

        {/*
          탭이 아닌 화면들. **탭바에 안 올린다** — 화면은 셋이라는 규칙은
          그대로다. 지난 주는 식단에서, 레시피 상세는 목록에서 들어간다.
          `href: null` 이 그 뜻이다 (경로는 살아 있고 칸만 없다).
        */}
        <Tabs.Screen name="weeks" options={{ href: null }} />
        <Tabs.Screen name="recipe/[id]" options={{ href: null }} />
      </Tabs>
    </SafeAreaProvider>
  );
}
