/**
 * 식단 — **아직 안 옮겼다**
 *
 * 순서를 장보기 → 식단 → 메뉴 고르기로 잡았다. 장보기가 마트에서 여는
 * 화면이라 제일 아프고, 옮겨보면 나머지가 쉬운지 어려운지가 보인다.
 *
 * 서버 쪽은 이미 나 있다 (`GET /api/plan`, `POST /api/plan/date`·`/note`·
 * `/remove`). 여기에 화면만 붙이면 된다 — `lib/api.ts` 의 `plan` 이
 * 그 문들이고, 날짜 말(`dateSay`·`dateTiny`)은 웹과 같은 파일을 읽는다.
 *
 * 옮길 때 지킬 것 (웹 `app/Plan.tsx` 와 같은 규칙):
 *   - **주 탭을 만들지 마라.** 열나흘을 세로로 쭉 늘어놓는다
 *   - 추천을 여기 올리지 마라. 고르는 자리는 메뉴 고르기다
 *   - 지난 날은 **물어보되 자동으로 기록하지 마라**
 *   - 펼친 재료의 체크는 **구매 기록을 만들지 않는다** (읽기 전용이다)
 */

import { Text, View } from "react-native";
import { color, sp } from "../lib/tokens";

export default function Plan() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, padding: sp[4], gap: sp[2], justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: color.text }}>식단</Text>
      <Text style={{ fontSize: 14, color: color.textSecondary, lineHeight: 21 }}>
        아직 안 옮겼어요. 지금은 장보기만 앱에서 볼 수 있어요 — 식단은 웹에서 봐주세요.
      </Text>
    </View>
  );
}
