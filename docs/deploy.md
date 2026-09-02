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

Supabase 가 "Potential issue detected — 이 쿼리가 RLS 없이 테이블을 만든다"고
물으면 **Run and enable RLS** 를 고른다. 3번이 어차피 하는 일이라 결과는 같고,
그 사이에 테이블이 잠깐 열려 있는 것만 없앤다. 테이블 주인은 RLS 를 통과하므로
2번 시드도 그대로 들어간다.

### 올린 뒤 — 얼린다

한 번 올라간 마이그레이션은 **이미 적용된 과거라 못 고친다.**
`tools/build_migrations.py` 의 `FROZEN` 에 세 파일이 들어가 있다.

여기서부터 스키마를 바꾸려면:

1. `db/schema.sql` 을 고친다 (여전히 '현재 상태'의 원본이다)
2. `supabase/migrations/` 에 **델타 파일을 손으로 새로 쓴다**
   (`20260901000000_add_xxx.sql` 처럼 뒤 번호로)
3. 그 델타를 Supabase 에 올린다

`build_migrations.py --check` 는 계속 돈다. `db/schema.sql` 을 고쳤는데 델타를
안 썼으면 CI 가 "얼린 마이그레이션이 원본과 어긋난다"로 막는다.

### 원본 보관함 만들기

Storage → **New bucket** → 이름 `originals`, **Private** (공개로 두지 마라).

### 접속 주소 챙기기

> **Connect 창의 Next.js 안내는 따라 하지 마라.**
> Supabase 는 기본으로 "supabase-js 를 깔고 `NEXT_PUBLIC_SUPABASE_URL` 과
> publishable 키를 넣어라"라고 안내한다. 그건 **브라우저에서 REST 를 쓰는**
> 방식이고 이 앱은 그걸 안 쓴다 (`web/lib/db.ts` 머리말 참조).
> 그대로 따라가면 DB 에 닿는 길이 두 개가 되고, `NEXT_PUBLIC_` 키는
> 브라우저 번들로 나간다.

값은 셋이다.

**1. `DATABASE_URL`** — Connect 창에서 프레임워크 탭 말고 **Transaction pooler**
연결 문자열을 고른다 (Settings → Database → Connection string 에도 있다).

```
postgresql://postgres.<ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

**포트가 6543 인지 본다.** direct(5432) 로 붙으면 Vercel 이 함수 인스턴스를
여러 개 띄우면서 각자 접속을 잡아 무료 요금제의 접속 수가 금방 바닥난다.
`<비밀번호>` 는 프로젝트를 만들 때 받은 DB 비밀번호다.

**2. `SUPABASE_URL`** — `https://<ref>.supabase.co`.
Connect 창이 보여주는 `NEXT_PUBLIC_SUPABASE_URL` 과 **값은 같다.**
접두사만 떼고 쓴다 — 이건 서버에서만 쓰는 값이다.

**3. `SUPABASE_SERVICE_ROLE_KEY`** — Settings → API 의 **secret key**
(`sb_secret_...`). 예전 이름은 `service_role` 이다.
같은 화면의 **publishable 키(`sb_publishable_...`)가 아니다** — 그건 공개용이라
RLS 에 막혀서 Storage 에 원본을 못 올린다.

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

### 환경변수를 고칠 때

**저장만 하면 안 바뀐다.** Vercel 은 배포할 때 환경변수를 함수에 박는다.
값을 고쳐도 **이미 떠 있는 배포는 옛날 값을 그대로 쓴다.** 고친 뒤 재배포해야
반영된다.

1. 프로젝트 → **Settings → Environment Variables**
2. 고칠 줄 오른쪽 **⋯ → Edit**. 값은 가려져 있어서 눈으로 확인은 못 하고
   덮어쓰기만 된다 — 뭐가 들었는지 모르겠으면 지우고 새로 만든다
3. **Environments 에 Production 과 Preview 가 둘 다 켜져 있는지** 본다
4. Save
5. **Deployments → 맨 위 배포 → ⋯ → Redeploy**
   (Build Cache 는 켜둬도 된다. 환경변수는 캐시와 상관없다)

붙여넣을 때 **따옴표로 감싸지 마라.** `"sb_secret_..."` 로 넣으면 따옴표까지
값이 된다. 앞뒤 공백·줄바꿈도 그대로 값에 들어간다.

### 안 될 때

화면에 나오는 말이 곧 원인이다. 오류에는 서버가 받은 이유를 그대로 붙여 낸다.

| 화면에 뜨는 말 | 뜻 | 할 것 |
|---|---|---|
| `원본을 못 올렸어요 (400) … Bucket not found` | 보관함이 없다 | Storage → New bucket → `originals`, **Private** |
| `원본을 못 올렸어요 (403) … Invalid Compact JWS` | 키가 JWT 로 안 읽힌다 | 앱이 `apikey` 헤더를 같이 보내면서 없어진 오류다. 그래도 나면 `SUPABASE_SERVICE_ROLE_KEY` 를 다시 넣고 **재배포** |
| `원본을 못 올렸어요 (403) … AccessDenied` | publishable 키를 넣었다 | `sb_secret_...` (또는 legacy `service_role` JWT `eyJ...`) 로 바꾼다 |
| `원본 보관 자리가 없어요` | `SUPABASE_URL` 이나 키가 아예 없다 | 둘 다 넣었는지, Production 에 켜져 있는지 |
| 첫 화면이 "아직 DB 를 안 붙였어요" | `DATABASE_URL` 이 없거나 틀렸다 | **6543** 인지 본다 |
| 저장이 몇 초씩 걸린다 | 함수가 미국에 있다 | 배포 화면 Functions 탭에서 `icn1` 인지 본다 |

### 함수를 서울에 둔다

`web/vercel.json` 이 `"regions": ["icn1"]` 로 잡아둔다. **지우지 마라.**

Vercel 의 기본 지역은 `iad1`(미국 버지니아)인데 DB 는 서울
(`ap-northeast-2`)에 있다. 그대로 두면 SQL 한 번에 태평양을 왕복해서
**한 번에 200ms 쯤** 든다. 저장 한 건이 DB 를 여러 번 오가니까 그것만으로
몇 초가 쌓인다. 함수를 DB 옆에 두면 왕복이 1~2ms 로 떨어진다.

Supabase 프로젝트를 다른 지역에 만들었으면 이 값도 같이 바꾼다
(도쿄 `hnd1`, 싱가포르 `sin1`, 미국 동부 `iad1`).

> Hobby 요금제는 지역을 **하나만** 고를 수 있다. 배포 화면의 Functions
> 탭에서 지금 어디인지 확인할 수 있다.

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
