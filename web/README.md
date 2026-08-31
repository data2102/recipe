# web — 앱

Next.js (App Router) + Supabase. 저장소 전체 설명은 [../README.md](../README.md),
무엇을 어떤 순서로 만드는지는 [../docs/claude-code-brief.md](../docs/claude-code-brief.md) 8장.

```bash
npm install
cp .env.example .env.local     # 값 채우기
npm run dev                    # http://localhost:3000
npm run lint && npm run build  # CI 가 보는 것
```

키를 안 채워도 뜬다. "아직 DB 를 안 붙였어요"라고 말해주는 게 그 화면의 일이다.

## 구성

| 경로 | 내용 |
|---|---|
| `app/` | 화면. 지금은 셋업 확인 한 장뿐이다. 3탭은 작업 순서 3번 |
| `app/yeobaek/` | **복사본.** 여백 디자인 시스템 (`README.md` 에 원본 커밋) |
| `lib/supabase.ts` | **서버 전용** DB 접속. Client Component 에서 부르지 마라 |

## 지켜야 할 것

- **색을 하드코딩하지 마라.** `var(--accent)` 처럼 토큰만 쓴다
- **파랑(`--accent`)은 누를 수 있는 것에만.** "68일" 같은 정보는 텍스트 3단계로
- **말하듯 쓴다.** "실패" 대신 "링크를 못 읽었어요. 캡처를 올려주세요"
- **`service_role` 키에 `NEXT_PUBLIC_` 을 붙이지 마라.** 브라우저로 새어 나간다.
  DB 는 Server Component · Route Handler 에서만 부른다 (`../db/policy.sql`)
