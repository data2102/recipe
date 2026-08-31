# 레시피 · 장보기 앱

> 요리를 아는 사람이 자기 레시피를 모아두고, 장보기 전에 메뉴를 정해 장보기 목록을 뽑는 도구.

**상태**: v1 설계 완료, 개발 착수 단계
**디자인 시스템**: [여백(Yeobaek)](https://github.com/data2102/design-system) — 라이트 기본
**화면 시안**: Figma `레시피·장보기 앱 v1 — 화면 흐름`

---

## 🤖 Claude Code에게

**[`docs/claude-code-brief.md`](docs/claude-code-brief.md) 를 먼저 읽어라.** 개발 지시서다 —
화면 3탭, 레시피 정리 파이프라인, 작업 순서 9단계가 여기 있다.
배경과 결정 이유가 궁금하면 [`docs/v1-spec.md`](docs/v1-spec.md) 를 본다.
이유를 모르고 코드를 고치면 이미 검토해서 버린 선택지로 되돌아가게 된다.

### 반드시 지킬 것 (어기면 제품이 망가진다)

1. **원문을 덮어쓰지 않는다.** `recipe_ingredient.raw_name`은 사용자가 보는 값이다. 표준화 결과는 `ingredient_id`에만 넣는다.
2. **모르는 재료를 추측하지 않는다.** 사전에 없으면 `ingredient_id = NULL`로 두고 `unmapped_term`에 쌓는다. LLM에게 "알아서 표준화해"라고 시키면 국간장과 진간장을 뭉갠다.
3. **판정하지 말고 근거를 보여준다.** "없음" 대신 "6일 전에 샀어요". 확신이 없으면 `CHECK` 버킷으로 보낸다.
4. **원본(이미지·텍스트)을 절대 지우지 않는다.** `source_asset`에 `parser_version`과 함께 남긴다. 파서가 좋아지면 전부 재파싱한다.
5. **새 입력을 요구하는 기능을 넣지 않는다.** 기존 행동(장보기 체크, 요리 완료, 영수증)에 얹는다.
6. **크롤링하지 않는다.** 네이버 검색 결과, 인스타 저장함, 유튜브 영상 다운로드, 커머스 주문내역 전부 금지. 외부 검색은 **링크만 열고** 결과는 공유 인텐트로 받는다.
7. **커머스 연동을 넣지 않는다.** 중립성이 이 제품의 유일한 차별점이다.

### 새 기능 판단 기준

> 기존 입력을 재활용하는가, 새 입력을 요구하는가?

재활용이면 검토하고, 새 입력을 요구하면 뺀다. 판단이 애매하면 `docs/v1-spec.md` 3장의 "빼는 것" 표를 보라 — 이미 검토해서 버린 것일 가능성이 높다.

---

## 저장소 구성

| 경로 | 내용 |
|---|---|
| [`docs/claude-code-brief.md`](docs/claude-code-brief.md) | **개발 지시서.** 화면 3탭, 레시피 정리 파이프라인, 작업 순서 9단계 |
| [`docs/deploy.md`](docs/deploy.md) | **올리는 법.** Supabase + Vercel + 폰에 설치까지 |
| [`docs/v1-spec.md`](docs/v1-spec.md) | **배경 문서.** 제품 정의, 원칙, 범위, 화면 6장, 파싱 파이프라인, 추천/장보기 로직 |
| [`prototype/오늘뭐먹지.html`](prototype/오늘뭐먹지.html) | 동작하는 화면 프로토타입. UI 톤·간격 참고용 |
| [`db/schema.sql`](db/schema.sql) | 데이터 모델 DDL + 핵심 쿼리 3개 (PostgreSQL 기준, SQLite 치환법 주석) |
| [`data/ingredient-dictionary.csv`](data/ingredient-dictionary.csv) | 재료 정규화 사전 시드 (표기 47개 → 표준 40종) |
| [`data/unit-notation.csv`](data/unit-notation.csv) | 수량·단위 표기 실측 정리 |
| [`data/사전조사.xlsx`](data/사전조사.xlsx) | 위 두 CSV의 원본 + AI 원가 모델 (수식 포함) |
| [`pipeline/`](pipeline/) | **수집 → 파싱 → 정규화 → 저장.** 3층이 각각 모듈이다 |
| [`tools/verify_pipeline.py`](tools/verify_pipeline.py) | 파이프라인 한 바퀴 검증 (API 키 불필요) |
| [`db/seed_dictionary.sql`](db/seed_dictionary.sql) | **자동 생성.** 위 CSV → `ingredient` · `ingredient_alias` 시드 |
| [`tools/build_dictionary_seed.py`](tools/build_dictionary_seed.py) | 사전 CSV → 시드 SQL 생성 (`--check` 검증만, `--sqlite` 방언) |
| [`tools/verify_seed.py`](tools/verify_seed.py) | 스키마 + 시드를 실제 DB에 올려보는 검증 |
| [`web/`](web/) | **앱.** Next.js (App Router) + Supabase. 화면은 작업 순서 3번부터 |
| [`supabase/migrations/`](supabase/migrations/) | **자동 생성.** `db/*.sql` → 마이그레이션 |
| [`db/policy.sql`](db/policy.sql) | 접근 잠금. RLS 를 켜고 정책은 두지 않는다 |
| [`db/seed_dev.sql`](db/seed_dev.sql) | 손으로 돌려볼 예시 데이터. **마이그레이션 아님** |
| [`prompts/`](prompts/) | **파서의 본체.** 1패스·2패스 프롬프트. 파이썬과 앱이 같이 쓴다 |
| [`tools/build_prompts.py`](tools/build_prompts.py) | `prompts/*.md` → `web/lib/parse/prompts.ts` (`--check` 검증만) |
| [`tools/build_migrations.py`](tools/build_migrations.py) | `db/*.sql` → 마이그레이션 생성 (`--check` 검증만) |
| [`tools/verify_migration.py`](tools/verify_migration.py) | 마이그레이션을 **진짜 PostgreSQL** 에 올려보는 검증 |
| [`tools/accuracy_test.py`](tools/accuracy_test.py) | 이미지 파싱 정확도 측정. 1패스 vs 2패스 비교 (`--compare`) |
| [`tools/truth.example.json`](tools/truth.example.json) | 정확도 테스트 정답지 양식 |

---

## 핵심 설계 요약

전체는 스펙 문서에 있고, 여기서는 코드에 바로 영향을 주는 것만.

### 3층 파이프라인 — 한 덩어리로 만들지 말 것

```
[1] 수집    이미지 / 링크 / 붙여넣기 / 직접입력
              ↓ 원본 보관 (source_asset)
[2] 파싱    LLM → 원문 표기 그대로의 구조화 데이터
              ↓ 여기까지 LLM, 아래는 코드
[3] 정규화  표준 ID 매핑 · 택1 처리 · 확신도 판정
```

파서는 옮기기만 하고, 표준화는 코드가 사전을 보고 한다.
이렇게 나눠야 사전이 좋아질 때 **재파싱 없이 재매핑만** 하면 된다.

### 2패스 파싱

- **1차** 재료 섹션만 (조리 단계는 보지 말라고 명시)
- **2차** 1차 결과를 넣고 "이 목록에 없는 재료를 조리 단계에서 찾아라"

레시피 작성자가 재료 목록에 안 적고 조리 설명에만 쓰는 재료가 실측 5건 중 2건에서 나왔다 (고등어조림의 **무**, 제육볶음의 **올리브유**). 재료 섹션만 파싱하면 마트에서 무를 안 사고 집에 와서 요리를 못 한다.

**2차에는 이미지를 다시 보내지 않는다.** 1차 응답에 조리 단계 텍스트를 같이 받아 그것만 넘긴다. 원가 증가가 2.2배 → 1.2배.

### 재료 표기 규칙

```
표준명(원문)     →  다진마늘(간마늘), 고춧가루(고추가루)
원문 == 표준명   →  괄호 숨김
```

탭하면 사용자가 직접 수정할 수 있어야 한다.

**대체 불가 주의**: 진간장 ≠ 국간장, 후추 ≠ 통후추. 뭉개면 안 된다.

### 재고를 추적하지 않는다

`purchase` 테이블은 재고가 아니라 **구매 이벤트 로그**다. 장보기에서 체크하면 자동으로 쌓이므로 별도 입력이 없고, "언제 샀는지"는 틀릴 수가 없는 데이터다.

```
BUY    구매 이력 없음 OR 경과일 > 유통기한
CHECK  경과일 > 유통기한/2        → "6일 전에 샀어요"
HAVE   그 외
```

### 레시피 상태

```
WISH  해보고 싶다 (저장 시점의 기본값)  → 장보기 후보
GOOD  만들어봤고 괜찮았다               → 추천 풀
BAD   별로였다                          → 숨김
```

저장 시점은 "맛있었다"가 아니라 "해보고 싶다"다. 평가는 별점이 아니라 **"또 만들래요?" 예/아니오**.

---

## 개발 순서

원본은 [`docs/claude-code-brief.md`](docs/claude-code-brief.md) 8장이다.
여기엔 어디까지 왔는지만 적는다.

| # | 작업 | 완료 판단 | 상태 |
|---|---|---|---|
| 1 | 프로젝트 셋업 + DB 스키마 반영 | 마이그레이션 통과 | **완료** |
| 2 | 재료 사전 시드 투입 | CSV 47개 표기 반영 | **완료** |
| 3 | 레시피 목록 3탭 + 만들었어요(날짜 선택) | 데이터를 손으로 넣어 돌아감 | **완료** |
| 4 | 캡처 업로드 → 2패스 파싱 → 확인 화면 → 저장 | **캡처 1장이 레시피가 된다** | **완료** |
| 5 | 미분류 확인 | `unmapped_term` 10% 안쪽 | **미룸.** 실제 레시피를 넣어봐야 안다 |
| 6 | 이번 주 담기 + 장보기 목록 3단 분류 | 담은 요리의 재료가 합산됨 | **완료** |
| 7 | 링크 파싱 + 캡처 폴백 | 링크 실패 시 안내가 뜬다 | **완료** |
| 8 | 냉장고 재료 가중치 | | **완료** |
| 9 | PWA + Web Share Target | 인스타 공유 시트에 앱이 뜬다 | **완료** |

**3번까지가 최소 동작 앱이다.** 4번이 이 제품의 심장이고 나머지는 그 위에 얹는다.
로그인·결제·온보딩·설정은 전부 나중이다.

5번은 **실제 레시피를 넣어봐야** 판단이 되는 단계라 뒤로 미뤘다.
지시서는 미분류가 절반을 넘으면 6번으로 넘어가지 말라고 하는데, 아직
재보지 않았으니 그 조건은 열려 있다. 캡처를 10~20건 넣은 뒤 확인한다.

```sql
SELECT raw_name, hit_count FROM unmapped_term
 WHERE resolved_ingredient_id IS NULL ORDER BY hit_count DESC;
```

자주 나오는 표기를 `data/ingredient-dictionary.csv` 에 넣고
`build_dictionary_seed.py` → `build_migrations.py` 를 다시 돌린다.

### 스택

지시서 7장 권장안 그대로다.

- **Next.js (App Router) + Supabase.** 안드로이드 PWA 가 Web Share Target 을
  지원해서, 네이티브 앱 없이 인스타 공유 시트에 뜬다. 이게 핵심 유입 경로다
- **로그인은 v1 에 없다.** 단일 사용자 전제. 필요해지면 `user_id` 를 나중에 붙인다
- **DB 는 생 SQL 로 직접 붙는다.** Supabase 는 호스팅된 Postgres 로 쓰고 REST 는
  안 쓴다 — `schema.sql` 의 장보기 3단 분류가 CTE + LATERAL 이라 REST 로는
  표현이 안 되고, 쪼개서 앱에서 합치면 같은 로직이 두 벌 생긴다
- 다만 "로그인이 없다"가 "아무나 쓴다"는 아니다. 열려 있는 REST 문은 닫아둔다 —
  모든 테이블에 RLS 를 켜고 정책은 두지 않는다 (`db/policy.sql`).
  브라우저는 DB 에 붙지 않는다

### 무료로 굴리기

올리는 절차는 [`docs/deploy.md`](docs/deploy.md) 에 있다.

**쓰는 사람은 둘이다.** 그 전제로 무료 요금제 안에서 돈다.

| | |
|---|---|
| 앱 | Vercel 무료 (Next.js) |
| DB | Supabase 무료 (PostgreSQL) |
| 원본 보관 | Supabase Storage 무료 |
| 캡처 읽기 | Anthropic API — **여기만 종량제.** 레시피 1건에 12~24원 |

한 가지만 주의하면 된다. **서버리스에서는 Transaction pooler(6543) 로 붙어라.**
Supabase 대시보드 > Connect 에서 가져온다. direct(5432) 로 붙으면 함수 인스턴스마다
접속을 잡아서 무료 요금제의 접속 수가 금방 바닥난다. 인스턴스당 접속은 1개로
막아뒀다 (`web/lib/db.ts`).

### 링크는 읽어보고, 안 되면 캡처로 넘긴다 (작업 순서 7번)

**폴백이 절반이다.** 링크가 항상 성공한다고 가정하지 않는다.

| 넣은 것 | 되는 일 |
|---|---|
| 일반 블로그 | robots.txt 를 확인하고, 허용이면 본문을 읽어 파싱한다 |
| robots 가 막은 주소 | 안 읽는다. "캡처를 올려주세요" |
| 로그인 벽 (401·403) | 우회하지 않는다. "캡처를 올려주세요" |
| 네이버 블로그 | 시도하고, 본문이 안 나오면 캡처로 안내 |
| 유튜브 | 제목만 가져온다. 자막을 긁지 않는다 |
| 인스타 | **아예 시도하지 않는다.** 처음부터 캡처로 안내 |

제목이라도 건지면 **"이름만 저장할게요"** 를 같이 낸다. 재료 없이 이름과
링크만 있는 레시피도 정상이다 — 탭 1 이 "재료는 링크에서 확인해요" 로
보여준다. 유튜브·인스타는 그게 정상 경로다.

읽을 때 붙이는 User-Agent 는 `OneulMwoMeokji/1.0 (...)` 다. 누가 읽는지
밝혀야 사이트 주인이 막을 수 있다. **아스키만 쓴다** — 헤더 값에 한글이
들어가면 `fetch` 가 통째로 던진다.

### 집에 있는 재료는 필터가 아니라 가중치 (작업 순서 8번)

탭 3 위쪽 칩을 눌러두면 그게 들어간 요리가 위로 올라온다.

- **저장하지 않는다.** 주소(`?have=`)에만 실려 있다가 화면을 떠나면 사라진다.
  상시 재고 DB 를 만들면 갱신을 안 해서 2주 만에 실제 냉장고와 어긋난다
- **하나도 안 맞아도 목록이 비지 않는다.** `LEFT JOIN` + `ORDER BY` 라서
  그렇다 (`db/schema.sql` 핵심 쿼리 (2)번). 그게 "대충 눌러도 되는" 이유다
- 수량은 묻지 않는다. 있냐 없냐만
- 칩은 새 입력이 아니다 — 최근에 산 것과 내 레시피에 자주 나오는 것에서 뽑는다

### 공유 시트에 띄우려면 (작업 순서 9번)

**설치해야 뜬다.** 브라우저 탭으로 열어둔 상태로는 공유 시트에 안 나온다.

1. HTTPS 로 배포한다 (Vercel 이면 그냥 된다). localhost 도 되지만 폰에서 못 연다
2. 안드로이드 크롬으로 열고 → 메뉴 → **홈 화면에 추가**
3. 인스타·유튜브에서 공유 → 목록에 "오늘뭐먹지" 가 뜬다

받은 건 `/share` 가 처리한다. **원본을 먼저 보관하고 `/add` 로 넘긴다** —
파싱은 30초쯤 걸려서, 공유를 누른 사람을 그 앞에 세워두지 않는다.

| 공유한 것 | 되는 일 |
|---|---|
| 캡처 (1~3장) | 원본을 보관하고 "이걸로 정리해줄게요" 로 이어진다 |
| 링크 | 원본 링크 칸에 채워진다. 인스타면 캡처를 올리라고 안내한다 |
| 글 | 붙여넣기 칸에 채워진다 |

iOS 는 Web Share Target 을 지원하지 않는다. v1 타겟이 아니다.

`public/sw.js` 는 **아무것도 캐시하지 않는다.** 설치 가능으로 인정받으려면
fetch 를 듣는 워커가 있어야 해서 둔 것이다. 화면은 전부 서버에서 그때그때
그린다 — 캐시해두면 마트에서 어제 목록을 본다.

### 앱으로 가는 길

모바일 웹으로 먼저 써보고, 쓸 만하면 앱으로 간다. 그때를 위해 지금 지키는 것:

- **화면과 로직을 섞지 않는다.** 조회·저장은 `web/lib/` 에 있고 화면은 그걸 부른다
- **파싱 규칙은 프롬프트 파일에 있다** (`prompts/`). 클라이언트를 바꿔도 안 따라온다
- 앱을 만들 때는 이 Next.js 를 **서버로 두고** 네이티브를 클라이언트로 붙이는 게 싸다.
  로직을 두 번 쓰지 않아도 되고, API 키가 기기에 안 들어간다

**지금 React Native 를 준비하느라 구조를 비틀지 않는다.** 4주 뒤 마트에서
실제로 열었는지가 먼저다 — 안 열면 앱을 만들 이유가 없다.

### 앱 돌리는 법

```bash
cd web
npm install
cp .env.example .env.local      # DATABASE_URL · ANTHROPIC_API_KEY 채우기
npm run dev                     # http://localhost:3000
```

캡처를 읽는 화면(`/add`)만 따로 만져볼 때는 API 키 없이도 된다.

```bash
PARSER_FAKE=1 npm run dev       # LLM 대신 고정된 예시 응답
```

배관만 재는 용도다. 파서 정확도와는 아무 상관이 없고, 운영에서는 무시된다.

키를 안 채워도 뜬다 — "아직 DB 를 안 붙였어요"라고 말해주는 게 그 화면의 일이다.

손으로 넣어볼 예시 데이터가 있다. **마이그레이션이 아니다** — 실제 DB 에 넣지 마라.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed_dev.sql
```

레시피 6건(만든 것 4 + 안 만든 것 2)이 들어간다. 탭 2 의 오래된 순 정렬과
60일 넘은 것의 warm 색이 보이도록 날짜를 오늘 기준 상대값으로 잡아뒀다.

### 마이그레이션 돌리는 법

```bash
python tools/build_migrations.py          # db/*.sql -> supabase/migrations/
python tools/build_migrations.py --check  # 어긋났는지만 확인

# 진짜 PostgreSQL 에 올려보고 확인 (작업 순서 1번의 완료 판단)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
  python tools/verify_migration.py

# 실제 DB 에 올리기
supabase db push
# CLI 없이:
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

`supabase/migrations/*.sql` 은 **생성물이다.** 직접 고치지 말고 `db/` 쪽을
고친 뒤 다시 생성한다. 스키마를 두 벌로 손보면 갈라진다.
단, **실제 DB 에 한 번 올린 뒤부터는** 그 파일이 과거라서 못 고친다 —
그때는 `build_migrations.py` 의 `FROZEN` 에 넣고 델타 파일을 새로 쓴다.

검증이 보는 것: 파일이 순서대로 올라가는가 · 테이블 12개가 다 생겼는가 ·
시드가 CSV 만큼 들어갔는가 · 두 번 올려도 안전한가 ·
`schema.sql` 이 주석에 적어둔 **핵심 쿼리 3개가 실제 스키마와 맞는가** ·
미분류를 `NULL` 로 남길 수 있는가 · 모든 테이블이 RLS 로 잠겼는가.

### 사전 시드 돌리는 법

```bash
python tools/build_dictionary_seed.py     # CSV -> db/seed_dictionary.sql
python tools/verify_seed.py               # 스키마+시드를 실제로 올려보고 확인
```

`build_dictionary_seed.py` 는 CSV를 두 갈래로 나눠 넣는다.
표기 원문이 표준명과 같으면 `ingredient`, 다르면 `ingredient_alias` 로 간다.

두 가지는 **자동으로 채우지 않는다.**

- `대체가능군` 중 상위어(삼겹살→돼지고기)만 `parent_id` 로 올린다.
  설탕↔올리고당 같은 대체군은 v1 스키마에 넣을 곳이 없어 리포트로만 뽑는다.
- `간장`·`액젓`처럼 종류가 불명한 표기는 `kind='AMBIGUOUS'` 로 남긴다.
  매핑 코드가 이걸 보고 **확정이 아니라 '확인 필요'로 보내야 한다.**
  말없이 진간장으로 확정하면 국간장 있는 집이 진간장을 사러 간다.

`shelf_life_days` · `aisle` 은 CSV에 없어서 카테고리 단위 대략치를 깔았고,
일부러 짧게 잡았다 — 있는데 없다고 하는 쪽이 회복 가능한 오류다(원칙 ②).
실사용하며 `UPDATE` 로 조정한다.

### 파이프라인 돌리는 법

화면은 아직 없다. CLI 로 한 바퀴가 돈다.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
python -m pipeline ingest 캡처.png                  # 수집 → 파싱 → 정규화 → 저장
python -m pipeline ingest --text "$(cat 레시피.txt)"
python -m pipeline show 1                           # 저장된 레시피
python -m pipeline unmapped                         # 사전에 없어서 못 붙인 표기

python tools/verify_pipeline.py                     # 한 바퀴 검증 (API 키 불필요)
```

로컬 DB 는 `.local/recipe.db` (SQLite), 원본 이미지는 `.local/originals/` 에
쌓인다. 둘 다 커밋하지 않는다. 스키마는 `db/schema.sql` 하나만 관리하고
SQLite 치환은 실행 시점에 한다 — 스키마가 두 벌이 되면 갈라진다.

**3층을 한 덩어리로 만들지 마라.** 파서(`parser.py`)는 원문을 옮기기만 하고,
표준화(`normalize.py`)는 사전을 보는 코드가 한다. 이렇게 나눠야 사전이
좋아질 때 재파싱 없이 재매핑만 하면 된다.

저장 결과는 화면 ③ 의 3분류로 나온다.

```
[확정]      양파, 고춧가루(고추가루), 다진 마늘
[확인 필요] 간장     '간장' 은 종류가 불명하다. '진간장' 인가요?
            무       1번 단계 - 냄비에 무 먼저 깔아주고
[미분류]    묵은지, 고등어
```

미분류는 `unmapped_term` 에 쌓인다. **사전은 이 목록을 보고 키운다** —
문서에 적힌 별칭을 미리 채워넣지 않는다.

**4주 뒤 판정 기준: 마트에서 실제로 열었는가.** 이거 하나만 본다.

---

## 화면

| # | 화면 | 핵심 |
|---|---|---|
| ① | 홈 — 오늘 뭐 먹지 | 입력 0으로 추천. 빈 화면이 없어야 함 |
| ② | 재료 넣기 (선택) | 필터가 아니라 **가중치**. 0건이 안 나옴 |
| ③ | 레시피 저장 확인 | 확정 / 확인필요 / 미분류 3분류 |
| ④ | 장보기 준비 | 메뉴 3~4개 고르기 |
| ⑤ | 장보기 목록 | **마트에서 여는 메인 화면.** 3단 분류 |
| ⑥ | 집에 있는 재료 | 전부 선택. 하단이 "나중에 할게요" |

아직 안 그린 화면: **레시피 상세**(요리 완료 버튼이 여기 있어야 ①이 작동), 레시피 목록·검색, 온보딩.

---

## 스택

미정. 안드로이드 우선. PC 웹은 v1에서 제외.
