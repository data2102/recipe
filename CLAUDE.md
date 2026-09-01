# CLAUDE.md

작업을 시작하기 전에 **[`docs/claude-code-brief.md`](docs/claude-code-brief.md) 를 읽어라.**
개발 지시서다. 무엇을 어떤 순서로 만드는지가 여기 있다 (8장 작업 순서).
왜 그렇게 정했는지는 **[`docs/v1-spec.md`](docs/v1-spec.md)** 에 있다.
올리는 절차는 **[`docs/deploy.md`](docs/deploy.md)** 에 있다.
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

python tools/build_prompts.py                    # prompts/*.md -> web/lib/parse/prompts.ts
python tools/build_migrations.py                 # db/*.sql -> supabase/migrations/
python tools/build_migrations.py --check         # 어긋났는지만 확인
python tools/verify_migration.py                 # 마이그레이션을 진짜 PostgreSQL 에

cd web && npm run dev                            # 앱 (http://localhost:3000)
cd web && PARSER_FAKE=1 npm run dev              # LLM 없이 /add 화면만 돌려보기
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
| `supabase/migrations/*.sql` | **올린 것은 얼린다** (`build_migrations.py` 의 FROZEN 에 이름+해시). 스키마를 바꾸려면 `db/schema.sql` 을 고치고 **델타 파일을 손으로 새로 쓴다.** 얼린 파일은 원본과 대조하지 않는다 — 갈라짐은 `verify_migration.py` 가 두 DB 를 만들어 컬럼으로 잰다 |
| `web/app/yeobaek/*.css` | **복사본.** 여백 디자인 시스템 원본 저장소를 고치고 다시 복사한다 (`web/app/yeobaek/README.md`) |
| `web/lib/db.ts` | 서버 전용. Client Component 에서 import 하면 접속 문자열이 번들에 실린다 |
| `db/seed_dev.sql` | **예시 데이터.** 마이그레이션이 아니다. 실제 DB 에 넣지 마라 |
| `prompts/*.md` | **파서의 본체.** 고치면 `PARSER_VERSION` 을 올리고 정확도를 다시 재라 |
| `web/lib/parse/prompts.ts` | **자동 생성물.** `prompts/` 를 고친 뒤 `build_prompts.py` 로 재생성 |
| `web/lib/parse/normalize.ts` | `pipeline/normalize.py` 와 **같은 규칙이다.** 한쪽만 고치지 마라 |

---

## 현재 상태

지시서 8장 작업 순서 기준.

- **1~3번 완료.** 프로젝트 셋업 + 마이그레이션, 재료 사전 시드,
  레시피 목록 3탭 + 만들었어요(날짜 선택)
- **4번 캡처 → 2패스 파싱 → 확인 화면 → 저장 — 완료.** `/add` 에서
  캡처 1장이 레시피가 되는 걸 브라우저로 확인했다 (가짜 응답으로 배관 검증).
  **실제 캡처로는 아직 안 재봤다** — API 키가 있어야 한다
- **5번 미분류 확인 — 미뤘다.** 실제 레시피를 넣어봐야 안다.
  통과 기준은 미분류 10% 안쪽 (`SELECT * FROM unmapped_term ORDER BY hit_count DESC`).
  지시서는 절반을 넘으면 6번으로 넘어가지 말라고 하는데, 아직 안 재봤다 —
  사용자가 알고 미룬 것이다
- **6번 이번 주 담기 + 장보기 3단 분류 — 완료.** 탭 3 에서 담고, 담은
  요리의 재료가 합쳐져 BUY/CHECK/HAVE 로 갈린다. 체크하면 구매 기록이 생긴다
- **9번 PWA + Web Share Target — 완료.** 설치하면 공유 시트에 뜬다.
  `/share` 가 받아서 원본만 먼저 보관하고 `/add` 로 넘긴다
- **7번 링크 파싱 + 캡처 폴백 — 완료.** robots.txt 를 보고 읽는다.
  못 읽으면 캡처로 안내하고, 제목만 건지면 "이름만 저장" 을 낸다
- **8번 냉장고 재료 가중치 — 완료.** 칩은 주소(`?have=`)에만 산다.
  필터가 아니라 가중치라 하나도 안 맞아도 목록이 안 빈다

**지시서 8장 9단계를 다 돌았다.** 남은 건 실제로 써보는 것이다 —
판정 기준은 "4주 뒤 마트에서 실제로 열었는가" 하나다.

### 앱 쪽 규칙

- **DB 는 생 SQL 로 직접 붙는다** (`web/lib/db.ts`). Supabase REST 를 안 쓰는
  이유는 그 파일 머리말에 있다 — 쪼개면 `schema.sql` 과 다른 로직이 두 벌 생긴다
- **브라우저는 DB 에 안 붙는다.** 조회는 Server Component, 변경은 Server Action
- **색을 하드코딩하지 마라.** 여백 토큰(`var(--...)`)만 쓴다.
  파랑(`--accent`)은 누를 수 있는 것에만 — "68일" 같은 정보는 텍스트 3단계로
- **모양은 `.ds-*` 를 먼저 찾아 쓴다.** 카드·버튼·폼·탭·칩·체크박스·배지·배너는
  전부 여백에 있다 (`web/app/yeobaek/README.md`). CSS 모듈에는 배치만 남긴다 —
  같은 모양을 모듈에서 다시 그리면 디자인 시스템이 좋아져도 앱은 안 바뀐다.
  시스템 기본값을 덮어쓸 일이 있으면 `globals.css` 아래쪽 한 군데에 모은다
- **탭 2 의 오래된 순 정렬을 뒤집지 마라.** 그 정렬이 곧 추천이다
- **요일은 안 정해도 된다.** 담기(`shopping_list_recipe`)와 요일
  (`day_of_week`)은 다른 행동이다. 요일을 필수로 만들면 담기가 무거워진다
- **식단에서 펼친 재료의 체크는 구매 기록을 만들지 않는다.** 집에 있다는
  건 오늘 샀다는 뜻이 아니다. 없는 날짜를 지어내면 다음 주에 "3일 전에
  샀어요" 라는 거짓말이 나온다. 구매 기록은 마트에서 장보기 체크로만 생긴다
- **같은 초안을 두 번 저장하지 않는다.** `save()` 가 `source_asset.recipe_id`
  를 `FOR UPDATE` 로 잡고 이미 붙어 있으면 그 id 를 돌려준다. 화면에서 버튼을
  막는 것만으로는 못 막는다 — 폰이 잠기면 서버는 저장을 끝냈는데 응답만
  사라지고, 사용자 눈에는 실패라 다시 누른다 (실제로 두 건이 생겼다)
- **오래 걸리는 일은 시작할 때 화면을 바꾼다.** `<form action={...}>` 안에서
  `setState` 를 하면 React 가 뒤따르는 트랜지션과 묶어버려서 **끝날 때까지
  화면이 안 바뀐다.** `onSubmit` 으로 받아 긴급 갱신으로 그린다
  (`app/add/Add.tsx`). 30초 동안 아무 반응이 없으면 사용자는 또 누른다
- **레시피 저장은 왕복 8번이다.** 재료마다 INSERT 를 보내면 15개짜리가 왕복
  30번이고, 함수와 DB 가 먼 대륙에 있으면 그것만으로 몇 초다. 배열로 한 번에
  넣는다 (`lib/parse/store.ts`). 함수 지역은 `web/vercel.json` 에서 DB 옆으로
- **원본은 파싱보다 먼저 보관한다.** 파싱이 실패해도 `source_asset` 에 남아야
  재파싱할 수 있다 (원칙 ⑤). `app/add/actions.ts` 의 순서를 바꾸지 마라
- **확인 화면에서 물어보는 문장에 물음표를 달지 마라.** 아래에 넣을지 말지를
  고르는 버튼이 붙어서, 질문이면 "아니요"가 재료를 통째로 뺀다 (원칙 ②)
- **쓰는 사람은 둘이다.** 무료 요금제 안에서 돈다 — 서버리스에서는 Supabase
  Transaction pooler(6543)로 붙고 인스턴스당 접속은 1개다
- **장보기 SQL 은 `db/schema.sql` 의 "핵심 쿼리 3개" 중 (3)번과 같은 것이다**
  (`web/lib/shopping.ts`). 한쪽만 고치면 갈라진다 — `verify_migration.py` 가
  스키마 쪽을 실제로 파싱시키니 거기서 안 걸리는 차이가 생긴다
- **이미 체크한 장보기 항목의 칸은 바꾸지 마라.** 체크하면 구매 기록이 생겨서
  다시 재면 HAVE 로 옮겨가는데, 마트에서 칸이 바뀌면 어디까지 샀는지 놓친다
- **`/share` 에서 파싱하지 마라.** 원본만 보관하고 `/add` 로 넘긴다. 파싱은
  30초쯤 걸려서, 공유를 누른 사람을 빈 화면 앞에 세우면 다시 안 쓴다
- **`public/sw.js` 로 화면을 캐시하지 마라.** 설치 가능 조건을 채우려고 둔
  파일이다. 목록·장보기는 서버가 그때그때 그린다 — 캐시하면 어제 걸 본다
- **링크를 읽기 전에 robots.txt 를 본다** (`web/lib/parse/link.ts`).
  막힌 곳은 안 읽고 캡처로 안내한다. 이 가드를 우회하지 마라 (지시서 4장)
- **냉장고 재료를 DB 에 저장하지 마라.** 주소에만 실린다 (`?have=` 는 사전에
  붙은 id, `?haveRaw=` 는 레시피에 적힌 표기). 상시 재고를 만들면 갱신을 안
  해서 어긋나고, 어긋나는 순간 추천이 쓸모없어진다
- **칩은 이번 주에 담은 요리 기준이다.** 추천 목록까지 넣으면 아직 먹기로
  정하지도 않은 요리의 재료까지 나와서 수십 개가 된다. 담은 것 기준이면
  장보기 범위와 같아진다 — 칩이 묻는 건 "살 것 중에 뭐가 집에 있나" 다
- **칩은 사전이 아니라 레시피 기준이다.** 사전은 40종인데 레시피 표기는 훨씬
  많다. 사전에 붙은 것만 칩으로 내면 대부분을 "집에 있어요" 라고 말할 수가
  없어서 전부 사야 할 것으로 남는다. 이름도 레시피에 적힌 그대로 쓴다
  (원칙 ①) — '진간장' 으로 붙었어도 내 레시피가 '간장' 이면 칩은 '간장' 이다
- **`pg` 는 BIGINT 를 문자열로 준다.** `lib/db.ts` 에서 숫자로 바꿔 받는다 —
  안 그러면 `{ id: number }` 라고 적어둔 타입이 전부 거짓말이 된다

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
