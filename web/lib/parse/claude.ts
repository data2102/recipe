/**
 * [2층] LLM 호출 — 여기까지만 LLM 을 쓴다
 *
 * 호출을 `Ask` 하나로 격리한다. parse() 는 Anthropic 을 모른다.
 * 덕분에 API 키 없이 가짜 응답을 넣어 수집->파싱->저장 한 바퀴를 통째로
 * 테스트할 수 있다 (pipeline/parser.py 와 같은 구조다).
 */

import Anthropic from "@anthropic-ai/sdk";

export type Source =
  | { kind: "IMAGE"; mediaType: ImageMediaType; b64: string; bytes: number }
  | { kind: "TEXT"; text: string };

export type ImageMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

export const MEDIA_TYPES: Record<string, ImageMediaType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export type Usage = { input: number; output: number };

/**
 * 프롬프트 하나를 보내고 글자를 받는다.
 * `sources` 가 비면 이미지를 붙이지 않는다 — 2차 패스가 그 경우다.
 */
export type Ask = (
  prompt: string,
  sources: Source[],
  maxTokens: number,
) => Promise<{ text: string; usage: Usage }>;

// 파싱은 오래 걸린다. 기본 10분이면 충분하지만 명시해둔다.
const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 가짜 응답으로 돌리는 중인가.
 *
 * 개발에서만 켜진다. 운영에서 켜지면 진짜 캡처 대신 고정된 예시가
 * 저장되므로 NODE_ENV 로 못을 박아둔다.
 */
export function isFake(): boolean {
  return process.env.PARSER_FAKE === "1" && process.env.NODE_ENV !== "production";
}

/** 캡처를 읽을 준비가 됐는가. 화면이 이걸 보고 안내를 띄운다. */
export function hasKey(): boolean {
  return isFake() || Boolean(process.env.ANTHROPIC_API_KEY);
}

/** 지금 써야 할 Ask. 부르는 쪽은 어느 쪽인지 몰라도 된다. */
export async function currentAsk(): Promise<Ask> {
  if (isFake()) {
    const { fakeAsk } = await import("./fake");
    return fakeAsk();
  }
  return anthropicAsk();
}

/**
 * 실제로 Anthropic 에 보내는 Ask.
 *
 * 모델은 pipeline/parser.py 와 같은 값을 쓴다 (지시서 4장 원가 실측).
 * 바꾸려면 두 곳을 같이 바꾸고 정확도를 다시 재라.
 */
export function anthropicAsk(model = process.env.PARSER_MODEL || "claude-sonnet-5"): Ask {
  const client = new Anthropic({ timeout: TIMEOUT_MS });

  return async (prompt, sources, maxTokens) => {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const s of sources) {
      if (s.kind === "IMAGE") {
        content.push({
          type: "image",
          source: { type: "base64", media_type: s.mediaType, data: s.b64 },
        });
      } else {
        content.push({ type: "text", text: s.text });
      }
    }
    content.push({ type: "text", text: prompt });

    const r = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    });

    const text = r.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return {
      text,
      usage: { input: r.usage.input_tokens, output: r.usage.output_tokens },
    };
  };
}
