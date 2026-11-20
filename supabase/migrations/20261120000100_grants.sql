-- 테이블 접근 권한(GRANT)
-- 최근 Supabase 프로젝트는 public 스키마의 새 테이블에 anon/service_role 권한을 자동 부여하지 않는다.
-- RLS는 "권한이 있는 역할"이 어떤 행을 볼 수 있는지만 거르므로, 권한 자체를 명시적으로 준다.

-- 리더보드 공개 조회 (행 범위는 RLS 정책 "scores are publicly readable"이 결정)
grant select on public.scores to anon, authenticated;

-- 서버 API Route(service_role)의 쓰기·조회
grant select, insert on public.scores         to service_role;
grant select, insert on public.feedbacks      to service_role;
grant select, insert, delete on public.submission_log to service_role;

-- anon/authenticated는 feedbacks, submission_log 및 scores 쓰기 권한이 없다 (의도된 설정).
