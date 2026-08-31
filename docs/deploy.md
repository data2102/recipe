# 올리는 법

무료 요금제 안에서 돈다. 쓰는 사람이 둘이라는 전제다.

| | | 드는 돈 |
|---|---|---|
| DB · 원본 보관 | Supabase 무료 | 0원 |
| 앱 | Vercel 무료(Hobby) | 0원 |
| 캡처 읽기 | Anthropic API | **여기만 종량제.** 레시피 1건에 12~24원 |

레시피를 100건 넣어도 2천원 안쪽이다. 안 넣으면 0원이다.

---

## 1. Supabase — DB 만들기 (10분)

1. [supabase.com](https://supabase.com) 에서 프로젝트를 만든다.
   **리전은 Northeast Asia (Seoul)** 로 잡는다 — 폰에서 쓰는 앱이라 가깝게.
2. DB 비밀번호는 만들 때 한 번만 보여준다. 그때 적어둔다.

### 마이그레이션 올리기

**둘 중 하나를 고른다.** CLI 쪽이 실수할 여지가 없다.

#### 방법 A — CLI (권장)

```bash
npx supabase login
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

`supabase/migrations/` 를 파일명 순서대로 알아서 올린다.
`<프로젝트 ref>` 는 대시보드 주소의 `.../project/<여기>` 부분이다.

#### 방법 B — 대시보드 SQL Editor

SQL Editor 는 **SQL 만** 실행한다. 파일 이름을 붙여넣으면
`syntax error at or near "supabase"` 가 난다 — **파일 안의 내용**을 넣어야 한다.

아래 세 개를 **하나씩, 순서대로** 연다 → 전체 선택(Ctrl+A) → 복사 →
SQL Editor 에 붙여넣고 Run → 다음 것으로.

1. [`20260831000000_init_schema.sql`](https://raw.githubusercontent.com/data2102/recipe/main/supabase/migrations/20260831000000_init_schema.sql) — 테이블 12개
2. [`20260831000001_seed_dictionary.sql`](https://raw.githubusercontent.com/data2102/recipe/main/supabase/migrations/20260831000001_seed_dictionary.sql) — 재료 사전 40종 + 별칭 11개
3. [`20260831000002_lock_down.sql`](https://raw.githubusercontent.com/data2102/recipe/main/supabase/migrations/20260831000002_lock_down.sql) — RLS 잠금

> 아직 main 에 머지 안 했으면 위 주소의 `/main/` 을 작업 브랜치 이름으로 바꾼다.
> 저장소를 받아뒀다면 `cat supabase/migrations/<파일>.sql` 로 열어 복사해도 된다.

**순서를 지켜라.** 2번은 1번이 만든 테이블에 넣고, 3번은 그 테이블들을 잠근다.

### 원본 보관함 만들기

Storage → **New bucket** → 이름 `originals`, **Private** (공개로 두지 마라).

### 접속 주소 챙기기

Connect 버튼 → **Transaction pooler** 주소를 복사한다 (포트 **6543**).

```
postgresql://postgres.<ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

**direct(5432) 를 쓰지 마라.** Vercel 은 함수 인스턴스를 여러 개 띄우는데
각자 접속을 잡아서 무료 요금제의 접속 수가 금방 바닥난다.

Settings → API 에서 **`service_role` 키**도 복사한다 (Storage 에 원본을 올릴 때 쓴다).

---

## 2. Anthropic API 키 (5분)

[console.anthropic.com](https://console.anthropic.com) → API Keys → 키를 만든다.
선불로 5달러쯤 충전해두면 레시피 수백 건은 넣는다.

**Usage limits 에 월 한도를 걸어둬라.** 실수로 새어 나가는 걸 막는다.

---

## 3. Vercel — 앱 올리기 (10분)

1. [vercel.com](https://vercel.com) 에서 이 저장소를 Import 한다
2. **Root Directory 를 `web` 으로 바꾼다** (기본값은 저장소 루트라 그냥 두면 실패한다)
3. Framework 는 Next.js 로 자동 인식된다. 나머지는 기본값

### 환경변수

Settings → Environment Variables 에 넣는다. **전부 Production·Preview 둘 다.**

| 이름 | 값 |
|---|---|
| `DATABASE_URL` | 위에서 복사한 **pooler(6543)** 주소 |
| `ANTHROPIC_API_KEY` | Anthropic 키 |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` 키 |

**`NEXT_PUBLIC_` 을 붙이지 마라.** 붙는 순간 브라우저 번들에 실린다.
전부 서버에서만 쓴다.

Deploy 를 누르면 `https://<이름>.vercel.app` 이 나온다.

---

## 4. 폰에 설치 (2분)

**설치해야 공유 시트에 뜬다.** 브라우저 탭으로 열어둔 상태로는 안 나온다.

1. 안드로이드 크롬으로 배포 주소를 연다
2. 메뉴(⋮) → **홈 화면에 추가**
3. 인스타·유튜브에서 공유 → 목록에 **오늘뭐먹지** 가 뜬다

와이프 폰에서도 똑같이 하면 된다. 로그인이 없어서 둘이 같은 데이터를 본다.

> iOS 는 Web Share Target 을 지원하지 않는다. 홈 화면에 추가는 되지만
> 공유 시트에는 안 뜬다 — 지시서대로 v1 타겟이 아니다.

---

## 5. 돌아가는지 확인

| 보는 것 | 어떻게 |
|---|---|
| DB 가 붙었나 | 첫 화면이 "아직 DB 를 안 붙였어요" 가 아니면 됐다 |
| 설치가 되나 | 크롬 메뉴에 "홈 화면에 추가" 가 뜨는가 |
| 공유가 되나 | 인스타에서 캡처 공유 → 앱이 목록에 뜨는가 |
| 파싱이 되나 | 캡처 1장 올려서 확인 화면까지 가는가 |

---

## 그다음 — 미뤄둔 5번

작업 순서 5번(미분류 확인)은 **실제 레시피를 넣어봐야** 판단이 된다.
캡처를 10~20건 넣고 Supabase SQL Editor 에서 본다.

```sql
SELECT raw_name, hit_count FROM unmapped_term
 WHERE resolved_ingredient_id IS NULL
 ORDER BY hit_count DESC;
```

전체 재료 대비 미분류가 **10% 안쪽이면 통과**다.
자주 나오는 표기를 `data/ingredient-dictionary.csv` 에 넣고 다시 만든다.

```bash
python tools/build_dictionary_seed.py
python tools/build_migrations.py     # FROZEN 에 넣었으면 델타를 새로 쓴다
```

**문서에 있다는 이유로 사전을 채우지 마라.** 실제로 들어온 표기만 넣는다
(CLAUDE.md "이미 내린 결정").

---

## 판정 기준

> **4주 뒤, 마트에서 실제로 열었는가.**

이거 하나만 본다. 만든 사람이 안 열면 아무도 안 연다.
