-- PRD 3.4 — 바른 블록 테트리스 초기 스키마

create table public.scores (
  id            uuid primary key default gen_random_uuid(),
  nickname      text not null check (char_length(btrim(nickname)) between 2 and 12),
  score         integer not null check (score > 0),
  level         integer not null check (level between 1 and 20),
  lines_cleared integer not null check (lines_cleared >= 0),
  created_at    timestamptz not null default now()
);
create index scores_rank_idx on public.scores (score desc, created_at asc);

create table public.feedbacks (
  id         uuid primary key default gen_random_uuid(),
  category   text not null check (category in ('bug', 'feature', 'other')),
  message    text not null check (char_length(btrim(message)) between 10 and 500),
  contact    text check (contact is null or char_length(contact) <= 100),
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table public.submission_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  kind       text not null check (kind in ('score', 'feedback')),
  created_at timestamptz not null default now()
);
create index submission_log_lookup_idx on public.submission_log (ip_hash, kind, created_at desc);

-- RLS: 모든 테이블 활성화. 정책이 없으면 anon/authenticated 접근은 전부 거부된다.
alter table public.scores         enable row level security;
alter table public.feedbacks      enable row level security;
alter table public.submission_log enable row level security;

-- 리더보드 공개 조회만 허용
create policy "scores are publicly readable"
  on public.scores for select
  to anon, authenticated
  using (true);

-- INSERT/UPDATE/DELETE 정책은 만들지 않는다.
-- 쓰기는 서버 API Route가 service_role 키로 수행한다(service_role은 RLS를 우회).

-- (선택) 30일 지난 레이트 리밋 기록 정리 — pg_cron 확장을 켠 경우에만 실행
-- select cron.schedule('purge-submission-log', '0 4 * * *',
--   $$delete from public.submission_log where created_at < now() - interval '30 days'$$);
