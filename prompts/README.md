# 프롬프트 — 파서의 본체

이 두 파일이 **파서다.** 재료를 뽑는 규칙이 코드가 아니라 여기 글에 있다.

| 파일 | 하는 일 |
|---|---|
| [`pass1.md`](pass1.md) | 재료 목록 섹션만 구조화 + 조리 단계는 글자만 옮김 |
| [`pass2.md`](pass2.md) | 1차 결과와 조리 단계를 대조해 **빠진 재료**를 찾음 |

## 왜 파일로 빼놨나

같은 프롬프트를 두 곳이 쓴다.

- `pipeline/parser.py` — CLI·정확도 측정용 (`tools/accuracy_test.py`)
- `web/lib/parse/` — 제품이 실제로 돌리는 것

두 벌로 두면 측정한 파서와 제품이 쓰는 파서가 달라진다. 그러면 정확도
숫자가 거짓말이 된다. 그래서 원본은 여기 하나뿐이고, TypeScript 쪽은
`tools/build_prompts.py` 가 만든 생성물(`web/lib/parse/prompts.ts`)을 쓴다.
CI 가 `--check` 로 어긋남을 잡는다.

## 자리표시자

`pass2.md` 안의 `<<KNOWN>>` · `<<STEPS>>` 는 실행할 때 값으로 바뀐다.
파이썬 `.format()` 이나 JS 템플릿 문법을 쓰지 않는 이유는 프롬프트 본문에
JSON 중괄호와 백틱이 들어 있어서다.

## 고칠 때

프롬프트를 고치면 **`pipeline/parser.py` 의 `PARSER_VERSION` 을 올려라.**
`source_asset.parser_version` 에 박히고, 나중에 재파싱 대상을 뽑는
기준이 된다 (원칙 ⑤ — 원본을 남기는 이유가 이것이다).

고친 뒤에는 정확도를 다시 재라. 프롬프트 한 줄이 재료 하나를 통째로
날린다 — 조리 단계를 요약하게 만들면 거기서만 나오는 재료가 사라진다.

```bash
python tools/build_prompts.py                    # -> web/lib/parse/prompts.ts
python tools/accuracy_test.py --compare          # 1패스 vs 2패스 (API 키 필요)
```
