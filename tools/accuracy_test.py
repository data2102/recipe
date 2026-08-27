#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
레시피 이미지 추출 정확도 테스트 v2

v1과 달라진 점
--------------
- 글자 판독률은 재지 않는다 (이미 문제없음이 확인됨)
- 2단계 파싱: 재료 섹션 추출 -> 조리 단계에서 누락 재료 역추출
- 1단계 방식과 자동 비교해서 2단계가 실제로 효과 있는지 측정
- 핵심 지표를 '숨은 재료 검출률'로 바꿈

사용법
------
    pip install anthropic
    export ANTHROPIC_API_KEY=sk-ant-...
    python accuracy_test.py            # 2단계 방식만
    python accuracy_test.py --compare  # 1단계 vs 2단계 비교

폴더 구조
--------
    ./accuracy_test.py
    ./truth.json
    ./images/*.png
"""

import argparse, base64, json, pathlib, re, sys, time
from collections import Counter

try:
    from anthropic import Anthropic
except ImportError:
    sys.exit("pip install anthropic 먼저 실행하세요")

MODEL = "claude-sonnet-5"     # 원가 비교하려면 claude-haiku-4-5-20251001
IMAGE_DIR = pathlib.Path("images")
TRUTH_FILE = pathlib.Path("truth.json")

# 채점용 별칭 사전. 표기가 달라서 틀렸다고 나오는 걸 막는 용도일 뿐,
# 제품에 들어갈 정규화 사전과는 별개다. 새 별칭이 보이면 여기에 추가한다.
ALIAS = {
    "고추가루": "고춧가루", "고추가룻": "고춧가루",
    "간마늘": "다진마늘", "다진 마늘": "다진마늘",
    "조선간장": "국간장", "토장": "된장",
    "미림": "맛술", "맛소금": "소금",
    "신김치": "김치", "묵은지": "김치",
    "대패삼겹살": "삼겹살", "대패삼겹": "삼겹살",
}

# ---- 프롬프트 -------------------------------------------------------

PASS1 = """레시피 이미지에서 **재료 목록 섹션만** 구조화한다.
조리 단계 본문은 지금 보지 마라. 재료/양념 섹션에 나열된 것만 옮긴다.

일반 상식으로 재료를 추측해서 추가하지 마라. 이미지에 적힌 것만 쓴다.
수량은 해석하지 말고 원문 표기 그대로 옮긴다 ("2T", "반스푼", "1/4포기", "갈갈").
"A OR B" 또는 "A(or B)" 처럼 택1로 적힌 것은 택1그룹으로 묶는다.

아래 JSON만 출력한다. 코드펜스나 설명은 붙이지 마라.
{
  "요리명": "문자열",
  "재료": [{"이름":"재료명","수량":"원문 그대로","구분":"재료|양념"}],
  "택1그룹": [["대패삼겹살","앞다리살"]]
}"""

PASS2 = """아래는 같은 레시피 이미지에서 이미 추출한 재료 목록이다.

<이미 추출된 재료>
{known}
</이미 추출된 재료>

이제 이미지의 **조리 단계 본문**을 처음부터 끝까지 다시 읽어라.
조리 과정에 등장하지만 위 목록에 **없는** 재료를 찾아내는 것이 유일한 임무다.

레시피 작성자가 재료 목록에 적는 걸 빠뜨리고 조리 설명에만 쓰는 경우가 흔하다.
예: 냄비 바닥에 까는 무, 팬에 두르는 기름, 중간에 붓는 물.

규칙:
- 위 목록에 이미 있는 재료는 표기가 달라도 다시 넣지 마라
- 조리도구, 불세기, 시간은 재료가 아니다
- 본문에 실제로 적혀 있는 것만 넣는다. 추측 금지
- 없으면 빈 배열을 반환한다

아래 JSON만 출력한다.
{{"누락재료": [{{"이름":"재료명","수량":"원문 또는 미상","근거":"몇 번 단계의 어떤 표현"}}]}}"""

SINGLE = """레시피 이미지에서 필요한 재료를 모두 뽑아 구조화한다.
일반 상식으로 추측해서 추가하지 마라. 수량은 원문 표기 그대로 옮긴다.

아래 JSON만 출력한다. 코드펜스나 설명은 붙이지 마라.
{
  "요리명": "문자열",
  "재료": [{"이름":"재료명","수량":"원문 그대로","구분":"재료|양념"}],
  "택1그룹": [["대패삼겹살","앞다리살"]]
}"""

# ---- 유틸 -----------------------------------------------------------

def norm(s):
    """채점 전용 정규화. 공백 제거 + 별칭 통합."""
    s = re.sub(r"\s+", "", str(s))
    return ALIAS.get(s, s)


def media_type(p):
    return {".png": "image/png", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".webp": "image/webp"}[p.suffix.lower()]


def ask(client, img_b64, mtype, prompt, max_tokens=2500):
    r = client.messages.create(
        model=MODEL, max_tokens=max_tokens,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64",
                                         "media_type": mtype, "data": img_b64}},
            {"type": "text", "text": prompt},
        ]}],
    )
    txt = "".join(b.text for b in r.content if b.type == "text").strip()
    txt = re.sub(r"^```(?:json)?|```$", "", txt, flags=re.M).strip()
    try:
        data = json.loads(txt)
    except json.JSONDecodeError:
        data = None
    return data, r.usage.input_tokens, r.usage.output_tokens


# ---- 추출 -----------------------------------------------------------

def extract_two_pass(client, path):
    b64 = base64.b64encode(path.read_bytes()).decode()
    mt = media_type(path)
    tin = tout = 0

    d1, i, o = ask(client, b64, mt, PASS1); tin += i; tout += o
    if d1 is None:
        return None, tin, tout

    known = ", ".join(x.get("이름", "") for x in d1.get("재료", []))
    d2, i, o = ask(client, b64, mt, PASS2.format(known=known), 1200); tin += i; tout += o

    items = [{"이름": x.get("이름"), "출처": "목록"} for x in d1.get("재료", [])]
    seen = {norm(x["이름"]) for x in items}
    for x in (d2 or {}).get("누락재료", []):
        if norm(x.get("이름", "")) not in seen:
            items.append({"이름": x.get("이름"), "출처": "본문", "근거": x.get("근거", "")})

    return {"요리명": d1.get("요리명"), "재료": items,
            "택1그룹": d1.get("택1그룹", [])}, tin, tout


def extract_single(client, path):
    b64 = base64.b64encode(path.read_bytes()).decode()
    d, i, o = ask(client, b64, media_type(path), SINGLE)
    if d is None:
        return None, i, o
    return {"요리명": d.get("요리명"),
            "재료": [{"이름": x.get("이름"), "출처": "목록"} for x in d.get("재료", [])],
            "택1그룹": d.get("택1그룹", [])}, i, o


# ---- 채점 -----------------------------------------------------------

def score(truth, results):
    m = dict(recipes=0, perfect=0, want=0, got=0,
             hidden_want=0, hidden_got=0, halluc=0, sel_want=0, sel_got=0)
    missing_all, halluc_all, detail = Counter(), Counter(), []

    for fname, t in truth.items():
        r = results.get(fname)
        if r is None:
            continue
        m["recipes"] += 1

        want = {norm(x["이름"]): x.get("출처", "목록") for x in t["재료"]}
        got = {norm(x["이름"]) for x in r["재료"]}

        missing, extra = set(want) - got, got - set(want)
        m["want"] += len(want)
        m["got"] += len(want) - len(missing)
        m["halluc"] += len(extra)
        missing_all.update(missing); halluc_all.update(extra)

        hidden = {k for k, src in want.items() if src == "본문"}
        m["hidden_want"] += len(hidden)
        m["hidden_got"] += len(hidden & got)

        got_groups = [{norm(y) for y in g} for g in r.get("택1그룹", [])]
        for grp in t.get("택1그룹", []):
            m["sel_want"] += 1
            if {norm(x) for x in grp} in got_groups:
                m["sel_got"] += 1

        if not missing and not extra:
            m["perfect"] += 1
        detail.append((fname, sorted(missing), sorted(extra), sorted(hidden - got)))

    return m, missing_all, halluc_all, detail


def report(label, m, missing_all, halluc_all, detail, tin, tout):
    print("\n" + "=" * 62)
    print(f"[{label}]  모델 {MODEL}")
    print("=" * 62)
    for fname, miss, extra, hid in detail:
        print(("OK  " if not miss and not extra else "!!  ") + fname)
        if miss:  print(f"      누락: {', '.join(miss)}")
        if extra: print(f"      환각: {', '.join(extra)}")
        if hid:   print(f"      ** 조리단계에 숨은 재료를 놓침: {', '.join(hid)}")

    if not m["recipes"]:
        print("채점할 결과가 없습니다."); return 0

    rec = m["got"] / m["want"] if m["want"] else 0
    hid = m["hidden_got"] / m["hidden_want"] if m["hidden_want"] else None
    sel = m["sel_got"] / m["sel_want"] if m["sel_want"] else None

    print("-" * 62)
    print(f"레시피 {m['recipes']}건 / 완전성공 {m['perfect']}건 ({m['perfect']/m['recipes']:.0%})")
    print("(1) 숨은 재료 검출률 : " +
          (f"{m['hidden_got']}/{m['hidden_want']} = {hid:.0%}   <-- 핵심 지표"
           if hid is not None else "정답지에 출처='본문' 항목이 없음"))
    print(f"(2) 환각 (없는 재료) : {m['halluc']}건")
    print(f"(3) 전체 재료 재현율 : {m['got']}/{m['want']} = {rec:.0%}")
    print("(4) 택1 인식률       : " +
          (f"{m['sel_got']}/{m['sel_want']} = {sel:.0%}" if sel is not None else "해당 없음"))
    print(f"토큰: 입력 {tin:,} / 출력 {tout:,}")
    if missing_all:
        print(f"자주 누락: {', '.join(k for k, _ in missing_all.most_common(8))}")
    if halluc_all:
        print(f"자주 환각: {', '.join(k for k, _ in halluc_all.most_common(8))}")

    print("-" * 62)
    if hid is None:
        print("판정 불가: 정답지에 숨은 재료를 표시해야 한다.")
    elif hid >= 0.9 and m["halluc"] == 0:
        print("판정: 진행. 이미지 자동 추출을 제품 전제로 삼아도 된다.")
    elif hid >= 0.7:
        print("판정: 보류. 놓친 재료의 패턴을 보고 2단계 프롬프트를 보강할 것.")
    else:
        print("판정: 재설계. 자동 추출을 확정으로 쓰지 말고,")
        print("      사용자가 재료 목록을 확인하는 화면을 필수로 넣을 것.")
    if m["halluc"]:
        print("경고: 환각은 누락보다 나쁘다. 안 사도 될 걸 사게 만들면 바로 신뢰를 잃는다.")
    return hid or 0


# ---- 실행 -----------------------------------------------------------

def run(client, truth, mode):
    fn = extract_two_pass if mode == "two" else extract_single
    results, tin, tout = {}, 0, 0
    for fname in truth:
        p = IMAGE_DIR / fname
        if not p.exists():
            print(f"[건너뜀] {fname} 없음"); continue
        r, i, o = fn(client, p)
        tin += i; tout += o
        if r is None:
            print(f"[실패] {fname} JSON 파싱 불가"); continue
        results[fname] = r
        time.sleep(0.4)
    return results, tin, tout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", action="store_true",
                    help="1단계 방식과 2단계 방식을 둘 다 돌려 비교")
    args = ap.parse_args()

    if not TRUTH_FILE.exists():
        sys.exit("truth.json 이 없습니다.")
    truth = json.loads(TRUTH_FILE.read_text(encoding="utf-8"))
    client = Anthropic()

    modes = ([("1단계 (기준선)", "single"), ("2단계 (본안)", "two")]
             if args.compare else [("2단계", "two")])

    summary = []
    for label, mode in modes:
        res, tin, tout = run(client, truth, mode)
        m, miss, hal, det = score(truth, res)
        h = report(label, m, miss, hal, det, tin, tout)
        summary.append((label, h, m["halluc"], tin + tout))

    if len(summary) > 1:
        print("\n" + "=" * 62)
        print("비교 - 2단계 파싱이 값어치를 하는가")
        print("=" * 62)
        for label, h, hal, tk in summary:
            print(f"{label:<16} 숨은재료 {h:>5.0%}   환각 {hal}건   토큰 {tk:,}")
        gain = summary[1][1] - summary[0][1]
        ratio = summary[1][3] / summary[0][3] if summary[0][3] else 0
        print(f"\n검출률 {gain:+.0%}p 개선에 토큰 {ratio:.1f}배 소모.")
        print("개선폭이 10%p 미만이면 1단계로 가고 비용을 아끼는 게 낫다.")


if __name__ == "__main__":
    main()
