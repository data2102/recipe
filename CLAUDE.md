# CLAUDE.md

작업을 시작하기 전에 **[`docs/claude-code-brief.md`](docs/claude-code-brief.md) 를 읽어라.**
개발 지시서다. 무엇을 어떤 순서로 만드는지가 여기 있다 (8장 작업 순서).
왜 그렇게 정했는지는 **[`docs/v1-spec.md`](docs/v1-spec.md)** 에 있다.
이유를 모르고 코드를 고치면 이미 검토해서 버린 선택지로 되돌아가게 된다.

[`README.md`](README.md) 의 "🤖 Claude Code에게" 절에 **반드시 지킬 것 7가지**가 있다.
그게 이 문서의 본문이다 — 여기서 다시 적지 않는다.

---

## 자주 쓰는 명령

```bash
python tools/build_dictionary_seed.py            # CSV -> db/seed_dictionary.sql
python tools/build_dictionary_seed.py --check    # 검증만 (파일 안 씀)
python tools/verify_seed.py                      # 스키마+시드를 SQLite 에 올려 확인
python tools/verify_pipeline.py                  # 파이프라인 한 바퀴 (API 키 불필요)

python tools/build_migrations.py                 # db/*.sql -> supabase/migrations/
python tools/build_migrations.py --check         # 어긋났는지만 확인
python tools/verify_migration.py                 # 마이그레이션을 진짜 PostgreSQL 에

cd web && npm run dev                            # 앱 (http://localhost:3000)
cd web && npm run lint && npm run build          # CI 가 보는 것
psql "$DATABASE_URL" -f db/seed_dev.sql          # 손으로 돌려볼 예시 데이터

python -m pipeline ingest 캡처.png               # 수집 → 파싱 → 정규화 → 저장
python -m pipeline show 1
python -m pipeline unmapped                      # 사전에 없어서 못 붙인 표기

pip install -r requirements.txt                  # accuracy_test.py 용
python tools/accuracy_test.py --compare          # 1패스 vs 2패스 (API 키 필요)
```

`tools/` 의 시드·마이그레이션·검증 스크립트는 표준 라이브러리만 쓴다.
의존성을 추가하지 마라 — API 키 없이 CI 에서 돌아가는 게 이것들의 조건이다
(PostgreSQL 은 `psql` 로 붙는다. psycopg 를 받지 않는다). 파이프라인 검증은
LLM 자리에 가짜 응답을 넣어 배관만 잰다 (파서 정확도는 accuracy_test.py 몫).

`verify_seed.py` 와 `verify_migration.py` 는 둘 다 필요하다. 앞은 SQLite 라
어디서나 돌아가고 schema.sql 의 치환 규칙을 검증하지만, `BIGSERIAL`·`FILTER`·
`LATERAL` 같은 PostgreSQL 문법은 거기서 안 걸린다. 뒤가 그 구멍을 메운다.

`pipeline/` 의 3층을 한 덩어리로 합치지 마라. 파서는 원문을 옮기기만 하고
표준화는 코드가 사전을 보고 한다. 합치면 사전이 좋아질 때마다 재파싱해야 한다.

---

## 건드릴 때 주의

| 파일 | 주의 |
|---|---|
| `db/seed_dictionary.sql` | **자동 생성물.** 직접 고치지 말고 CSV 를 고친 뒤 재생성한다. `verify_seed.py` 가 어긋남을 잡는다 |
| `data/ingredient-dictionary.csv` | **실측 기록.** 추론으로 행을 채우지 마라. 문서에 있다는 이유로 넣지도 마라 |
| `db/schema.sql` | PostgreSQL 기준. SQLite 치환 규칙이 머리말에 있고 `verify_seed.py` 가 그 규칙을 쓴다. 끝의 "핵심 쿼리 3개" 주석은 `verify_migration.py` 가 실제로 파싱시킨다 — 컬럼을 바꾸면 같이 고쳐라 |
| `supabase/migrations/*.sql` | **자동 생성물.** `db/*.sql` 을 고친 뒤 `build_migrations.py` 로 재생성한다. 단 실제 DB 에 한 번 올린 파일은 못 고친다 — `FROZEN` 에 넣고 델타를 새로 쓴다 |
| `web/app/yeobaek/*.css` | **복사본.** 여백 디자인 시스템 원본 저장소를 고치고 다시 복사한다 (`web/app/yeobaek/README.md`) |
| `web/lib/db.ts` | 서버 전용. Client Component 에서 import 하면 접속 문자열이 번들에 실린다 |
| `db/seed_dev.sql` | **예시 데이터.** 마이그레이션이 아니다. 실제 DB 에 넣지 마라 |

---

## 현재 상태

지시서 8장 작업 순서 기준.

- **1번 프로젝트 셋업 + DB 스키마 반영 — 완료.** `web/` (Next.js) +
  `supabase/migrations/`. `verify_migration.py` 가 진짜 PostgreSQL 에서 통과
- **2번 재료 사전 시드 — 완료.** 표기 47개 → 표준 40종 + 별칭 11개
- **3번 레시피 목록 3탭 + 만들었어요 — 완료.** `db/seed_dev.sql` 을 넣고
  세 탭·시트·날짜 선택이 도는 걸 브라우저로 확인했다
- **4번 캡처 → 2패스 파싱 → 확인 화면 → 저장 — 다음.** `pipeline/` + CLI 로
  한 바퀴는 돈다. 업로드 화면과 확인 화면이 없다. **이게 제품의 심장이다**
- **5번 미분류 확인 — 실제 레시피를 넣어야 한다.** 통과 기준은 미분류 10% 안쪽

### 앱 쪽 규칙

- **DB 는 생 SQL 로 직접 붙는다** (`web/lib/db.ts`). Supabase REST 를 안 쓰는
  이유는 그 파일 머리말에 있다 — 쪼개면 `schema.sql` 과 다른 로직이 두 벌 생긴다
- **브라우저는 DB 에 안 붙는다.** 조회는 Server Component, 변경은 Server Action
- **색을 하드코딩하지 마라.** 여백 토큰(`var(--...)`)만 쓴다.
  파랑(`--accent`)은 누를 수 있는 것에만 — "68일" 같은 정보는 텍스트 3단계로
- **탭 2 의 오래된 순 정렬을 뒤집지 마라.** 그 정렬이 곧 추천이다

### 이미 내린 결정 — 되돌리지 마라

**문서에 있는 별칭을 사전에 채우지 않는다.** `docs/v1-spec.md` 7장의 변형 표에는
있지만 CSV 에 없는 표기가 있다 (간마늘, 조선간장, 미림, 신김치, 묵은지).
맞추지 않기로 정했다 — 어떤 표기가 실제로 들어올지는 레시피를 넣어봐야 알고,
문서의 예시를 근거로 사전을 부풀리면 실측 기록이 추측으로 오염된다.

사전을 키우는 경로는 하나다: **레시피를 저장하다 `unmapped_term` 에 쌓인 걸
사람이 보고 CSV 에 넣는다.** 스펙 7장 "미분류 처리"가 그 설계다.
미분류가 장보기에 개별 항목으로 나가 중복 구매가 생기는 건 감수하는 오류다.

### 열려 있는 결정

**스택은 정해졌다** (지시서 7장 권장안 — Next.js + Supabase, 안드로이드 PWA).
남은 건 지시서 9장의 목록이다: 중복 레시피 병합 기준, 무료 한도·구독가,
요리 중 화면 UX, 검색·정렬 옵션, 사진 교체 흐름.

**정하라고 재촉하지 마라.** 지금 정하면 근거 없이 정하게 된다.
