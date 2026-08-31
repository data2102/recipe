-- =====================================================================
--  접근 잠금  (Supabase 전용)
--
--  v1 에는 로그인이 없다 (docs/claude-code-brief.md 7장). 그런데 Supabase 는
--  public 스키마의 테이블을 anon 키로 REST 에 그대로 연다. anon 키는 공개
--  값이라, 잠그지 않으면 프로젝트 주소를 아는 누구나 내 레시피를 읽고
--  지울 수 있다. "로그인이 없다" 가 "아무나 쓴다" 가 되면 안 된다.
--
--  그래서: 모든 테이블에 RLS 를 켜고 **정책은 하나도 만들지 않는다.**
--    - anon / authenticated  -> 아무것도 못 본다 (정책이 없으니 전부 거부)
--
--  앱은 REST 를 쓰지 않는다. 서버에서 PostgreSQL 에 직접 붙는다
--  (web/lib/db.ts). 접속 주인(postgres)은 RLS 를 통과하므로 앱은 그대로
--  돌아가고, 열려 있던 REST 문만 닫힌다. 접속 문자열은 서버에만 둔다 —
--  web/.env.example 참조.
--
--  v2 에서 로그인이 생기면 여기에 user_id 기반 정책을 추가한다.
--  그때까지는 정책이 비어 있는 게 맞다.
--
--  방언: PostgreSQL. SQLite 에는 RLS 가 없어서 이 파일은 db/schema.sql 과
--  따로 둔다 (verify_seed.py 는 SQLite 라 schema.sql 만 올린다).
-- =====================================================================

-- 테이블 이름을 손으로 적지 않는다. 테이블이 늘면 여기도 자동으로 따라온다.
-- 여러 번 돌려도 안전하다.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END
$$;


-- 확인:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--     -> rowsecurity 가 전부 t 여야 한다
--   SELECT COUNT(*) FROM pg_policies WHERE schemaname='public';
--     -> 0 이어야 한다. 정책이 생겼다면 누가 문을 연 것이다
