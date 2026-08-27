# CLAUDE.md

작업을 시작하기 전에 **[`docs/v1-spec.md`](docs/v1-spec.md)를 먼저 읽어라.**
설계 결정과 그 이유가 전부 거기 있다. 이유를 모르고 코드를 고치면
이미 검토해서 버린 선택지로 되돌아가게 된다.

[`README.md`](README.md) 의 "🤖 Claude Code에게" 절에 **반드시 지킬 것 7가지**가 있다.
그게 이 문서의 본문이다 — 여기서 다시 적지 않는다.

---

## 자주 쓰는 명령

```bash
python tools/build_dictionary_seed.py            # CSV -> db/seed_dictionary.sql
python tools/build_dictionary_seed.py --check    # 검증만 (파일 안 씀)
python tools/verify_seed.py                      # 스키마+시드를 실제 DB 에 올려 확인

pip install -r requirements.txt                  # accuracy_test.py 용
python tools/accuracy_test.py --compare          # 1패스 vs 2패스 (API 키 필요)
```

시드 도구 두 개는 표준 라이브러리만 쓴다. 의존성을 추가하지 마라 —
API 키 없이 CI 에서 돌아가는 게 이 도구들의 조건이다.

---

## 건드릴 때 주의

| 파일 | 주의 |
|---|---|
| `db/seed_dictionary.sql` | **자동 생성물.** 직접 고치지 말고 CSV 를 고친 뒤 재생성한다. `verify_seed.py` 가 어긋남을 잡는다 |
| `data/ingredient-dictionary.csv` | **실측 기록.** 추론으로 행을 채우지 마라. 문서에 있다는 이유로 넣지도 마라 |
| `db/schema.sql` | PostgreSQL 기준. SQLite 치환 규칙이 머리말에 있고 `verify_seed.py` 가 그 규칙을 쓴다 |

---

## 현재 상태

개발 순서(README) 기준.

- **1번 사전 시드 — 완료.** 표기 47개 → 표준 40종 + 별칭 11개
- **2번 수집→파싱→저장 — 대기.** 스택 미정 (스펙 13장). 정해야 착수 가능

### 열려 있는 결정 두 개

착수 전에 사람이 정해야 하는 것들이다. 임의로 채우지 마라.

1. **문서와 사전의 불일치 7건.** README 7장과 `accuracy_test.py` 의 ALIAS 에는
   있는데 CSV 에는 없는 표기 — 간마늘, 조선간장, 미림, 신김치, 묵은지,
   대패삼겹살, 대패삼겹. `verify_seed.py` 가 매번 보고한다.
   CSV 에 넣든 문서에서 빼든 한쪽으로 맞춰야 한다.
   이 여파로 `truth.example.json` 기준 미분류율이 12% 라 3번 통과 기준(10%)을 넘는다.
2. **스택.** 안드로이드 우선, PC 웹은 v1 제외까지만 정해져 있다.
