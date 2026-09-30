/**
 * 키보드를 피하는 ScrollView — **글을 적는 화면은 전부 이걸 쓴다**
 *
 * 쓰는 사람이 폰에서 본 것: **"레시피추가시 텍스트에서 스크롤이안됨."**
 * 붙여넣기 칸은 `/add` 맨 아래에 있는데, 키보드가 그 위를 덮고 화면은
 * 안 밀려 올라가서 스크롤할 데가 없었다.
 *
 * 원인은 앱에 **키보드를 다루는 코드가 한 줄도 없었던 것**이다
 * (`KeyboardAvoidingView`·`automaticallyAdjustKeyboardInsets`·
 * `softwareKeyboardLayoutMode` 셋 다 없었다). 웹은 `<textarea>` 라
 * 브라우저가 알아서 해줘서 이 문제가 앱에만 있었다.
 *
 * **Expo SDK 54 부터 edge-to-edge 가 강제다** (끄는 설정 필드 자체가
 * 없어졌다). Expo 자기 문서가 이 조합을 두고 "may cause unexpected
 * keyboard behavior on Android … you will have to use
 * `KeyboardAvoidingView`" 라고 적어놨다.
 *
 * **`behavior` 는 `padding` 이다 — 안드로이드에서도.**
 * 흔히 안드로이드는 `height` 를 쓰라고들 하는데, 여기서는 `padding` 이
 * 안전한 쪽이다: RN 이 **자기 자리를 재서** 여백을 정하기 때문이다
 * (`Math.max(frame.y + frame.height - keyboardY, 0)`). 창이 이미 줄어든
 * 기기에서는 그 값이 0 이 되어 **두 번 밀지 않는다** — 안드로이드 버전이
 * 달라도 한 벌로 돈다. 재서 고른 값이지 관습이 아니다.
 *
 * **텍스트 칸에 `maxHeight` 를 걸지 마라.** 걸고 싶어지지만, 그러면 칸
 * 안에 스크롤이 생기고 그 드래그를 바깥 ScrollView 가 가로챈다 — 지금
 * 고치는 증상을 다른 모양으로 되돌리는 셈이다. 칸은 자라게 두고 **페이지가
 * 스크롤한다.**
 *
 * `components/` 에 둔다 — `app/` 에 두면 expo-router 가 경로로 만든다.
 */

import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
} from "react-native";

export default function Scroll({
  children,
  ...rest
}: ScrollViewProps & { children?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
      <ScrollView
        /*
          기본값 둘을 여기서 준다 — 화면마다 적으면 한 군데가 빠진다.
          · 저장 중에도 버튼이 한 번에 눌리게 (`handled`)
          · 키보드가 올라온 채로 **밀면 내려간다** — 가려진 것을 보려고
            미는 동작이 곧 치우는 동작이다
        */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
