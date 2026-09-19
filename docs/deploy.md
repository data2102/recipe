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
4. [`20260901000000_week_plan.sql`](https://raw.githubusercontent.com/data2102/recipe/main/supabase/migrations/20260901000000_week_plan.sql) — 요일 배정 (`day_of_week`)
5. [`20260908000000_week_by_date.sql`](https://raw.githubusercontent.com/data2102/recipe/main/supabase/migrations/20260908000000_week_by_date.sql) — 주를 날짜로 (`starts_on`)

**이 목록은 `supabase/migrations/` 와 같아야 한다.** 델타를 새로 쓰면
여기에도 줄을 추가해라 — 안 적으면 다음에 SQL Editor 로 올릴 때 빠진다
(실제로 빠뜨려서 앱이 `column "starts_on" does not exist` 로 죽었다).

> 아직 main 에 머지 안 했으면 위 주소의 `/main/` 을 작업 브랜치 이름으로 바꾼다.
> 저장소를 받아뒀다면 `cat supabase/migrations/<파일>.sql` 로 열어 복사해도 된다.

**순서를 지켜라.** 2번은 1번이 만든 테이블에 넣고, 3번은 그 테이블들을 잠근다.

Supabase 가 "Potential issue detected — 이 쿼리가 RLS 없이 테이블을 만든다"고
물으면 **Run and enable RLS** 를 고른다. 3번이 어차피 하는 일이라 결과는 같고,
그 사이에 테이블이 잠깐 열려 있는 것만 없앤다. 테이블 주인은 RLS 를 통과하므로
2번 시드도 그대로 들어간다.

### 이미 쓰고 있는데 델타가 새로 생겼다면

**새 델타 하나만 올리면 된다.** 앞의 것들은 이미 올라가 있다.

```bash
npx supabase db push          # 안 올라간 것만 알아서 골라 올린다
```

SQL Editor 로 한다면 위 목록에서 **아직 안 올린 파일만** 순서대로 붙여넣는다.

앱이 이런 화면을 내면 그게 안 올라갔다는 뜻이다.

> **DB 에 못 붙었어요** — `column "starts_on" does not exist`

델타는 여러 번 올려도 안전하게 써둔다 (`IF NOT EXISTS`, 이미 채워졌으면
건너뛰기). 헷갈리면 그냥 다시 올려라.

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

### 유튜브 설명란 읽기 (선택, 5분)

없어도 앱은 돈다 — 유튜브 링크가 "제목만" 으로 처리될 뿐이다.
넣으면 **설명란에 재료를 적어둔 영상**은 링크 하나로 레시피가 된다.

[console.cloud.google.com](https://console.cloud.google.com) → 프로젝트 →
**YouTube Data API v3** 사용 설정 → 사용자 인증 정보 → **API 키**.
무료 할당량이 하루 10,000 units 이고 영상 하나 조회가 1 unit 이라 넉넉하다.

자막은 안 쓴다 — 공식 API 의 자막 내려받기는 영상 주인만 되고, 비공식
경로는 지시서 4장이 금지한 것이다.

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
| `YOUTUBE_API_KEY` | **선택.** 있으면 유튜브 링크에서 설명란을 읽는다 |
| `APP_API_TOKEN` | **폰 앱을 쓸 때만.** 24자 이상의 아무 긴 문자열 |

**`NEXT_PUBLIC_` 을 붙이지 마라.** 붙는 순간 브라우저 번들에 실린다.
전부 서버에서만 쓴다.

#### `APP_API_TOKEN` — 폰 앱의 자물쇠

**웹만 쓸 거면 안 넣어도 된다.** 웹 화면은 서버가 직접 그려서 이 문을
안 쓴다 — 없으면 `/api/*` 가 전부 503 으로 막히고, 앱은 멀쩡히 돈다.

폰 앱(`native/`)을 쓸 거면 넣어야 한다. 넣는 순간 그 주소를 아는 누구나
읽고 지울 수 있게 되므로, **짧은 값을 넣지 마라** — 24자 미만이면 서버가
아예 안 연다 (설정을 깜빡한 배포가 조용히 열려 있는 것보다 낫다).

    openssl rand -base64 32        # 이런 걸 넣는다

같은 값을 `native/.env` 의 `EXPO_PUBLIC_API_TOKEN` 에도 넣는다.
**그 값은 앱 파일에 박힌다** — 로그인이 아니라 자물쇠다. 새면 여기서
바꾸고 앱을 다시 올린다. DB 접속 문자열과 API 키는 앱에 절대 안 싣는다.

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

## 6. 폰 앱(React Native) 을 폰에 올리기

**여기까지가 PWA 다.** `native/` 는 같은 서버를 보는 **다른 앱**이고,
설치 방법이 다르다 (크롬 "홈 화면에 추가" 가 아니다).

### 먼저 — 서버 문을 연다

폰 앱은 화면을 서버가 그려주지 않는다. `/api/*` 로 묻는데, 그 문은
`APP_API_TOKEN` 이 없으면 **전부 503 으로 닫혀 있다** (위 3장). 안 넣으면
앱을 깔아도 화면마다 오류만 나온다 — 앱이 고장 난 게 아니라 문이 닫힌 것이다.

1. Vercel → Settings → Environment Variables 에 `APP_API_TOKEN` (24자 이상)
2. **재배포한다** — 저장만 하면 함수에 안 박힌다 (위 "환경변수를 고칠 때")
3. 같은 값을 `native/.env` 에 적는다 (`native/.env.example` 을 복사)

```
EXPO_PUBLIC_API_URL=https://<배포주소>.vercel.app
EXPO_PUBLIC_API_TOKEN=<위와 같은 값>
```

`.env` 는 커밋하지 마라. **앱 파일에 박히는 것과 저장소에 올라가는 것은
다른 문제다** — 박힌 값은 앱을 뜯어야 보이지만, 올린 값은 저장소를 여는
누구나 본다.

### Expo Go 는 쓰지 않는다 (2026-09-19)

한 번 해봤고 안 됐다. 폰에 **"Something went wrong" 한 장**만 뜨는데
**원인이 한 글자도 없고**, 좁히려고 잰 것은 전부 정상이었다 — 배포 번들 ·
개발 번들(6.4MB, HTTP 200) · 매니페스트(`exposdk:57.0.0`) · 꾸러미 버전 ·
앱을 실제로 실행시킨 결과(런타임 오류 0건). `--tunnel` 은 `@expo/ngrok`
전역 설치에 실패해 켜자마자 죽었다.

**"빌드가 없어서 빠르다" 가 이유였는데, 빌드 한 번보다 훨씬 많은 시간을
태웠다.** 목표는 폰에 앱을 올리는 것이지 Expo Go 를 돌리는 게 아니다.

### APK 를 만들어 설치 (EAS Build)

```bash
npm i -g eas-cli
eas login
cd native
eas init
eas build --profile preview --platform android
```

`eas init` 은 `app.json` 에 `extra.eas.projectId` 를 적는다 — **그 줄은
커밋한다** (계정에 매인 값이고, 없으면 다음 빌드가 프로젝트를 새로 만든다).

- **`preview` 가 사이드로드용이다** (`eas.json`): `distribution: internal` +
  `buildType: apk` — 스토어를 안 거치고 링크로 받아 깐다.
  `production` 은 Play 스토어용 `app-bundle` 이라 폰에 바로 못 깐다
- 토큰은 `eas.json` 에 적지 마라. **EAS 환경변수로 넣는다**:

```bash
eas env:create --name EXPO_PUBLIC_API_URL   --value https://<배포주소>.vercel.app
eas env:create --name EXPO_PUBLIC_API_TOKEN --value <값>
```

- 끝나면 나오는 링크를 폰 크롬으로 열어 APK 를 받는다.
  안드로이드가 "출처를 알 수 없는 앱" 을 물어보면 허용한다
- 첫 빌드 때 EAS 가 **키스토어를 대신 만들어 보관한다.** 그걸 잃으면
  같은 앱으로 업데이트를 못 한다 — `eas credentials` 로 받아 따로 둔다

`android.package` 는 `com.data2102.recipe` 다 (`app.json`). **한 번 깔고 나면
바꾸지 마라** — 바꾸면 다른 앱이 되어서 지우고 다시 깔아야 한다.

### 이 저장소의 CI 는 APK 를 안 만든다

`.github/workflows/check.yml` 의 "폰 앱" 은 **타입 검사 + 번들 + 번들에 DB
문자열이 안 섞였는지**까지만 본다. 빌드는 expo.dev 계정이 필요해서 사람이
돌린다. 번들이 통과했다고 APK 가 나온다는 뜻은 아니다 — 네이티브 껍데기는
거기서 처음 만들어진다.

### 안 될 때

| 증상 | 원인 |
|---|---|
| 화면마다 "서버 주소가 아직 안 적혀 있어요" | `EXPO_PUBLIC_API_URL` 이 비었다. `.env` 를 고쳤으면 `npx expo start` 를 **다시** 띄운다 |
| 전부 503 | `APP_API_TOKEN` 이 Vercel 에 없거나, 넣고 **재배포를 안 했다** |
| 401 | 앱 토큰과 서버 토큰이 다르다 |
| 사진이 안 뜬다 | `/photo/<id>` 는 토큰 문이 아니다. `EXPO_PUBLIC_API_URL` 이 틀린 것부터 본다 |
| Expo Go 에서 QR 을 찍어도 안 열린다 | 폰과 PC 가 다른 와이파이다 — `npx expo start --tunnel` |
| 폰에 **"Something went wrong"** 한 장만 뜬다 | Expo Go 의 화면이고 **원인이 한 글자도 없다.** ① 앱이 그린 "앱이 멈췄어요" 화면이면 거기 적힌 메시지를 읽는다 (`app/_layout.tsx` 의 `ErrorBoundary`) ② 그래도 파란 화면이면 모듈이 읽히다 터진 것이다 — 맨 아래 **"View error log"**, 또는 맥의 `npx expo start` 창 |
| `--tunnel` 이 켜자마자 죽는다 | `@expo/ngrok` 전역 설치가 실패한 것이다 (`NgrokResolver`). `npm i -g @expo/ngrok@^4.1.0` 로 먼저 깔거나, 터널 없이 같은 와이파이로 쓴다 |

> `npx expo-doctor` 는 **항상 하나를 실패로 찍는다** — Metro 설정
> (`disableHierarchicalLookup`). **그건 일부러 그렇게 둔 것이다**
> (`native/metro.config.js` 에 이유가 있다). 나머지가 통과하는지만 본다.

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


## 2026-09-10 UX 변경 배포

새 앱 코드를 배포하기 **전에** `supabase/migrations/20260910000000_list_exclusions.sql`
을 적용한다. 기존 마이그레이션은 수정하지 않는다. `shopping_list.excluded`라는
TEXT 컬럼 하나를 추가하며, 기존 목록은 제외 재료가 없는 상태로 시작한다.
데이터 삭제·주차 이동은 없다. 앱만 이전 버전으로 되돌려도 추가 컬럼은 유지할 수 있다.

검증은 `web/`에서 `npm run lint`, `npm run build`로 한다. 회귀 테스트는
마이그레이션이 적용된 **별도 로컬 `recipe_ux_test` DB**에 대해 실행한다.
장보기 목록이 이미 있는 DB에서는 실행을 거부한다. 운영 DB를 사용하지 않는다.

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/recipe_ux_test npm run test:ux
```

회귀 범위: 주차별 날짜 지정, 완료 후 날짜 수정, 재료 중복 제거·수량 근거,
목록별 보유 제외, 구매 체크 중복 방지·취소, 최근 메뉴 추천, 제목·재료 검색.
기존 `CHECKOFF` 구매 이력은 소속 목록을 추정해 삭제하지 않는다.


## 2026-09-15 식단 날짜 전환 배포

새 앱 코드를 배포하기 **전에** `supabase/migrations/20260915000000_day_note.sql`
을 적용한다. 기존 마이그레이션은 수정하지 않는다. `day_note` 테이블 하나가
새로 생길 뿐이라 **기존 데이터는 건드리지 않는다** — 담아둔 요리도, 요일도,
구매 이력도 그대로다. 앱만 이전 버전으로 되돌려도 이 테이블은 남아 있어도
문제가 없다 (예전 코드는 읽지 않는다).

테이블은 RLS 를 켠 채 정책 없이 만든다 (`db/policy.sql` 과 같은 이유 —
anon 키로 REST 가 열리면 안 된다). 앱은 서버에서 직접 붙으므로 영향이 없다.

적용 순서:

```bash
supabase db push            # 또는 대시보드 SQL 편집기에 파일 내용 붙여넣기
```

검증은 `web/` 에서 `npm run lint`, `npm run build`, 그리고 회귀 테스트다.

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/recipe_ux_test npm run test:ux
```

추가된 회귀 범위: 날짜가 주를 정하는 규칙(`whichOf`), 열나흘 범위(`horizon`),
그날의 메모 저장·삭제, 날짜를 고르는 창이 받는 값(`pickable`), 장보기에서
같은 이름이 한 줄로 합쳐지는 것.

## 유튜브 검색 설정

Vercel Production·Preview의 서버 환경변수 YOUTUBE_API_KEY에 YouTube Data API v3가 활성화된 키가 필요하다.
검색은 search.list 1회 + videos.list 1회로 한 페이지 20개를 확인한다. 동일 요청은 15분 캐시한다.
추가 페이지는 사용자가 요청할 때만 검색한다. 검색 중 AI 호출은 하지 않는다. 선택한 영상의 파싱에는 기존 ANTHROPIC_API_KEY가 필요하다.
키 미설정·한도 초과·네트워크 실패는 사용자 안내로 처리한다. 새 DB migration은 없다.
공식 근거: https://developers.google.com/youtube/v3/docs/search/list 및 https://developers.google.com/youtube/v3/docs/videos/list
