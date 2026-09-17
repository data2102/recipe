/**
 * 누르면 눌리는 `Pressable` — **기본 피드백을 채운다**
 *
 * RN 의 `Pressable` 은 눌러도 **아무 일도 안 한다** (`TouchableOpacity` 와
 * 다르다). 앱 전체에 53 곳이 있었는데 `android_ripple` 도 `pressed` 스타일도
 * 한 곳에 없었다 — 누를 때 반응이 없으면 눌린 건지 몰라서 한 번 더 누른다
 * (docs/ui-references.md 11장 A2). 웹도 같은 결함이었고 같이 고쳤다.
 *
 * **색이 아니라 크기로 준다.** 장보기는 칸(BUY/CHECK/HAVE)이 색으로 갈리는데
 * 누를 때 색이 바뀌면 "칸이 바뀌었나" 로 읽힌다. 살짝 눌리는 것은 어느 색
 * 위에서든 같은 뜻이다 — 웹의 `globals.css` ⑦ 과 같은 값을 쓴다.
 *
 * `big` 은 줄·카드처럼 넓은 것. 큰 면이 크게 줄면 출렁여 보여서 덜 눌린다.
 */

import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

export default function Tap({
  style,
  big = false,
  children,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** 줄·카드처럼 넓은 것 */
  big?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && !rest.disabled && { transform: [{ scale: big ? 0.995 : 0.97 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}
