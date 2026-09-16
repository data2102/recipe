/**
 * 메뉴 고르기 — **아직 안 옮겼다**
 *
 * 서버 쪽은 나 있다 (`GET /api/recipes`). 목록을 통째로 주고 **정렬·검색은
 * 폰에서 한다** — 그 코드(`lib/recipe-sort.ts`)는 순수 층이라 웹과 같은
 * 파일을 그대로 읽는다 (`lib/pure.ts` 의 `sortRecipes`).
 *
 * 옮길 때 지킬 것 (웹 `app/recipes/` 와 같은 규칙):
 *   - **오래된 순 정렬을 뒤집지 마라.** 그 정렬이 곧 추천이다.
 *     이름순은 찾을 때 쓰는 것이고 기본이 아니다
 *   - 담을 때 **날짜를 묻되 필수는 아니다.** 고르는 창에는 그날 이미
 *     담긴 메뉴와 적어둔 약속을 같이 낸다 — 빈 날을 찾으려고 여는 창이다
 */

import { Text, View } from "react-native";
import { color, sp } from "../lib/tokens";

export default function Recipes() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, padding: sp[4], gap: sp[2], justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: color.text }}>메뉴 고르기</Text>
      <Text style={{ fontSize: 14, color: color.textSecondary, lineHeight: 21 }}>
        아직 안 옮겼어요. 장보기 다음으로 식단, 그 다음이 여기예요.
      </Text>
    </View>
  );
}
