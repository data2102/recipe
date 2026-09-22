/**
 * 지금 도는 것이 **어느 코드인가**
 *
 * 두 번 겪었다: 고쳐서 머지하고 빌드까지 돌렸는데 폰에서 같은 증상이
 * 나왔다. 그때 답해야 하는 질문은 "무엇이 고장났나" 가 아니라
 * **"내 손에 있는 앱에 그 수정이 들어 있나"** 인데, 앱이 그 말을 못 했다.
 *
 * 갈라지는 자리가 둘이다:
 *   · EAS 는 **로컬 git HEAD** 로 빌드한다 — 안 당겨놓고 빌드하면
 *     옛 코드가 그대로 APK 가 된다
 *   · `expo-updates` 가 켜져 있어서 (`app.json` 의 `updates.url`),
 *     예전에 올린 OTA 묶음이 **새로 깐 앱 위에 덮일 수 있다.**
 *     `runtimeVersion` 이 `appVersion`(1.0.0) 고정이라 옛 update 가
 *     영영 들어맞는다
 *
 * 그래서 못 닿았을 때 한 조각을 같이 적는다. **지어내지 마라** —
 * expo-updates 가 말해주는 것만 옮긴다.
 */

import * as Updates from "expo-updates";

export function runningSay(): string {
  try {
    if (Updates.isEmbeddedLaunch) return "앱 그대로";
    const when = Updates.createdAt;
    return when
      ? `내려받은 묶음 ${when.toISOString().slice(0, 10)}`
      : "내려받은 묶음";
  } catch {
    // 개발 중에는 못 읽을 수 있다. 모르면 모른다고 둔다
    return "";
  }
}

/** 괄호 안에 덧붙일 꼬리. 모르면 아무것도 안 붙인다 */
export function runningTail(): string {
  const say = runningSay();
  return say ? ` · ${say}` : "";
}
