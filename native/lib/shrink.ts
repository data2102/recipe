/**
 * 폰 사진을 줄여서 보낸다 — **캡처도 만든 사진도 같은 값으로.**
 *
 * 폰 사진은 3~5MB 다. 그대로 올리면 마트 신호에서 올라가다 실패하고,
 * 서버 쪽에도 몸통 한도가 있다 (Vercel 4.5MB).
 *
 * 웹은 캔버스로 같은 일을 한다 (`web/lib/frames.ts`, 긴 변 1280 · JPEG 0.7).
 * 그 파일은 video + canvas 라 네이티브로 그대로 못 옮긴다 — 층 표의
 * "웹(다시 써야 한다)" 가 이것이다. **값은 맞춘다.**
 *
 * **긴 캡처는 줄이지 말고 잘라야 한다** (글자가 뭉개진다). 그건 아직
 * 안 옮겼다 — 보통 폰 캡처는 한 장이라 여기서는 줄이기만 한다.
 *
 * 두 화면이 쓴다 (`app/add.tsx` · `app/recipe/[id].tsx`). 베껴 두면
 * 한쪽만 고쳐져서 사진 크기가 화면마다 달라진다.
 */

import * as ImageManipulator from "expo-image-manipulator";

export const MAX_EDGE = 1280;

export async function shrink(
  uri: string,
  width: number,
  height: number,
): Promise<string> {
  const longest = Math.max(width, height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const out = await ImageManipulator.manipulateAsync(
    uri,
    scale < 1
      ? [
          {
            resize: {
              width: Math.round(width * scale),
              height: Math.round(height * scale),
            },
          },
        ]
      : [],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  return out.uri;
}
