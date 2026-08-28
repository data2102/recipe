# -*- coding: utf-8 -*-
"""[2층] 파싱 — LLM 은 여기까지만 쓴다.

파서는 **원문을 옮기기만** 한다. 표준화는 3층(normalize.py)이 사전을 보고
코드로 한다. 이렇게 나눠야 사전이 좋아질 때 재파싱 없이 재매핑만 하면 된다.
(docs/v1-spec.md 6장)

2패스
----
1차  재료 목록 섹션에서만 재료를 뽑는다. 조리 단계는 **글자만 그대로 옮긴다**
     — 거기서 재료를 뽑지는 않는다.
2차  1차 결과와 1차가 옮겨온 조리 단계 텍스트를 주고,
     "이 목록에 없는 재료를 조리 단계에서 찾아라" 만 시킨다.

**2차에는 이미지를 다시 보내지 않는다.** 1차 응답의 조리 단계 텍스트만
넘긴다. 원가 증가가 2.2배 -> 1.2배로 줄어든다 (스펙 6장).
tools/accuracy_test.py 는 이미지를 다시 보내는 옛 방식이라 여기와 다르다 —
그쪽은 측정용, 이쪽이 제품용이다.

LLM 호출은 `ask` 하나로 격리했다. 덕분에 API 키 없이 가짜 ask 를 넣어
수집->파싱->저장 한 바퀴를 통째로 테스트할 수 있다 (tools/verify_pipeline.py).
"""

import base64
import json
import pathlib
import re

# 프롬프트를 고치면 여기를 올린다. source_asset.parser_version 에 박히고,
# 나중에 재파싱 대상을 뽑는 기준이 된다 (스펙 5장).
PARSER_VERSION = "p2-2026-08"

DEFAULT_MODEL = "claude-sonnet-5"

MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
}


class ParseError(Exception):
    """파싱 실패. raw_text 가 있으면 원본은 그래도 저장한다 (원칙 ⑤)."""

    def __init__(self, message, raw_text=None):
        super().__init__(message)
        self.raw_text = raw_text


# ---- 프롬프트 -------------------------------------------------------

PASS1 = """레시피에서 **재료 목록 섹션**을 구조화하고, 조리 단계는 글자만 옮긴다.

재료로 뽑을 것은 재료/양념 섹션에 나열된 것뿐이다.
조리 단계 본문에서 재료를 찾아내려 하지 마라 — 그건 다음 단계에서 한다.

일반 상식으로 재료를 추측해서 추가하지 마라. 적혀 있는 것만 쓴다.
수량은 해석하지 말고 원문 표기 그대로 옮긴다 ("2T", "반스푼", "1/4포기", "갈갈").
재료 이름도 고치지 마라. "고추가루"라고 적혀 있으면 "고추가루"로 옮긴다.
"A OR B" 또는 "A(or B)" 처럼 택1로 적힌 것은 택1그룹으로 묶는다.

조리단계는 **본문을 그대로** 옮긴다. 요약하거나 다시 쓰지 마라.
다음 단계에서 이 텍스트만 보고 빠진 재료를 찾기 때문에, 여기서 문장을
줄이면 재료가 통째로 사라진다.

아래 JSON만 출력한다. 코드펜스나 설명은 붙이지 마라.
{
  "요리명": "문자열",
  "재료": [{"이름":"재료명","수량":"원문 그대로","구분":"재료|양념"}],
  "택1그룹": [["대패삼겹살","앞다리살"]],
  "조리단계": ["1번 단계 본문", "2번 단계 본문"]
}"""

PASS2 = """아래는 한 레시피에서 이미 뽑아낸 재료 목록과, 그 레시피의 조리 단계다.

<이미 뽑은 재료>
{known}
</이미 뽑은 재료>

<조리 단계>
{steps}
</조리 단계>

조리 단계를 처음부터 끝까지 읽고, 위 목록에 **없는** 재료를 찾아내는 것이
유일한 임무다. 새로 만드는 게 아니라 대조하는 작업이다.

레시피 작성자가 재료 목록에 적는 걸 빠뜨리고 조리 설명에만 쓰는 경우가 흔하다.
예: 냄비 바닥에 까는 무, 팬에 두르는 기름, 중간에 붓는 물.

규칙:
- 위 목록에 이미 있는 재료는 표기가 달라도 다시 넣지 마라
- 조리도구, 불세기, 시간, 그릇은 재료가 아니다
- 조리 단계에 실제로 적혀 있는 것만 넣는다. 추측 금지
- 근거에는 몇 번째 단계의 어떤 표현인지 적는다
- 없으면 빈 배열을 반환한다

아래 JSON만 출력한다. 코드펜스나 설명은 붙이지 마라.
{{"누락재료": [{{"이름":"재료명","수량":"원문 또는 미상","근거":"4번 단계 - 냄비에 무 먼저 깔아주고"}}]}}"""


# ---- 입력 -----------------------------------------------------------

def image_source(path):
    """이미지 파일 -> ask 에 넘길 입력."""
    p = pathlib.Path(path)
    mt = MEDIA_TYPES.get(p.suffix.lower())
    if mt is None:
        raise ParseError(f"지원하지 않는 이미지 형식: {p.suffix}")
    return {"kind": "IMAGE", "path": str(p),
            "b64": base64.b64encode(p.read_bytes()).decode(), "media_type": mt}


def text_source(text):
    """붙여넣기 원문 -> ask 에 넘길 입력."""
    if not text.strip():
        raise ParseError("빈 텍스트")
    return {"kind": "TEXT", "text": text}


# ---- 파싱 -----------------------------------------------------------

def _strip_fence(txt):
    return re.sub(r"^```(?:json)?|```$", "", txt, flags=re.M).strip()


def _ask_json(ask, source, prompt, max_tokens, attach_image):
    """JSON 이 깨지면 한 번만 다시 시도한다 (스펙 6장 "실패 처리")."""
    last = None
    for _ in range(2):
        raw, usage = ask(prompt, source if attach_image else None, max_tokens)
        last = raw
        try:
            return json.loads(_strip_fence(raw)), usage, raw
        except (json.JSONDecodeError, TypeError):
            continue
    raise ParseError("JSON 파싱 실패 (재시도 1회 포함)", raw_text=last)


def parse(source, ask):
    """수집한 원본 하나 -> 원문 표기 그대로의 구조화 결과.

    표준화는 하지 않는다. ingredient_id 를 붙이는 건 normalize.py 의 일이다.
    """
    d1, usage1, raw1 = _ask_json(ask, source, PASS1, 4000, attach_image=True)

    items = []
    for x in d1.get("재료") or []:
        name = (x.get("이름") or "").strip()
        if not name:
            continue
        items.append({
            "raw_name": name,
            "raw_qty": (x.get("수량") or "").strip() or None,
            "section": (x.get("구분") or "").strip() or None,
            "origin": "LIST",
            "evidence": None,
        })

    steps = [s.strip() for s in (d1.get("조리단계") or []) if str(s).strip()]

    # 2차 — 이미지 없이 조리 단계 텍스트만 넘긴다.
    usage2 = (0, 0)
    if steps and items:
        known = ", ".join(i["raw_name"] for i in items)
        prompt = PASS2.format(known=known,
                              steps="\n".join(f"{n}. {s}"
                                              for n, s in enumerate(steps, 1)))
        try:
            d2, usage2, _ = _ask_json(ask, source, prompt, 2000,
                                      attach_image=False)
        except ParseError:
            # 2차가 깨져도 1차 결과는 살린다. 숨은 재료를 놓칠 뿐이다.
            d2 = {}
        seen = {_key(i["raw_name"]) for i in items}
        for x in d2.get("누락재료") or []:
            name = (x.get("이름") or "").strip()
            if not name or _key(name) in seen:
                continue
            seen.add(_key(name))
            items.append({
                "raw_name": name,
                "raw_qty": (x.get("수량") or "").strip() or None,
                "section": None,
                "origin": "BODY",
                "evidence": (x.get("근거") or "").strip() or None,
            })

    # 재료가 하나도 없으면 실패다. 파서에게 "이게 레시피냐"를 묻지 않는다.
    if not items:
        raise ParseError("재료를 하나도 못 찾았다", raw_text=raw1)

    return {
        "title": (d1.get("요리명") or "").strip() or "제목 없음",
        "items": items,
        "choice_groups": [[str(n).strip() for n in g if str(n).strip()]
                          for g in (d1.get("택1그룹") or []) if g],
        "steps": steps,
        "raw_text": raw1,
        "parser_version": PARSER_VERSION,
        "usage": (usage1[0] + usage2[0], usage1[1] + usage2[1]),
    }


def _key(s):
    return re.sub(r"\s+", "", s)


# ---- 실제 LLM 전송 --------------------------------------------------

def make_anthropic_ask(model=DEFAULT_MODEL, client=None):
    """Anthropic API 로 보내는 ask 를 만든다.

    parse() 는 이 함수를 몰라도 된다. 그래서 API 키 없이 테스트가 된다.
    """
    if client is None:
        try:
            from anthropic import Anthropic
        except ImportError:                      # pragma: no cover
            raise ParseError(
                "anthropic 패키지가 없다. pip install -r requirements.txt")
        client = Anthropic()

    def ask(prompt, source, max_tokens):
        content = []
        if source is not None and source["kind"] == "IMAGE":
            content.append({"type": "image", "source": {
                "type": "base64",
                "media_type": source["media_type"],
                "data": source["b64"],
            }})
        elif source is not None and source["kind"] == "TEXT":
            content.append({"type": "text", "text": source["text"]})
        content.append({"type": "text", "text": prompt})

        r = client.messages.create(
            model=model, max_tokens=max_tokens,
            messages=[{"role": "user", "content": content}],
        )
        txt = "".join(b.text for b in r.content if b.type == "text").strip()
        return txt, (r.usage.input_tokens, r.usage.output_tokens)

    return ask
