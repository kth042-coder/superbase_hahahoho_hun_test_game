-- 회원 기능: 프로필(고유 닉네임) + 점수와 계정 연결 (PRD 2.4)

-- 1) 프로필 테이블 — auth.users 1:1, 닉네임은 대소문자 구분 없이 고유
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (
               char_length(nickname) between 2 and 12
               and nickname = btrim(nickname)
               and nickname ~ '^[가-힣a-zA-Z0-9 _-]+$'
             ),
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_lower_idx on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

-- 본인 프로필만 조회 가능 (닉네임 중복 확인은 서버 API가 service_role로 수행)
create policy "users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

grant select on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

-- 2) 가입 시 프로필 자동 생성 — signUp의 options.data.nickname 사용
--    닉네임이 규칙에 어긋나거나 이미 사용 중이면 가입 자체가 실패한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, btrim(new.raw_user_meta_data ->> 'nickname'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 점수와 계정 연결 — 탈퇴(계정 삭제) 시 기록도 함께 삭제
--    기존 비회원 기록은 user_id가 null로 남는다.
alter table public.scores
  add column user_id uuid references auth.users (id) on delete cascade;
create index scores_user_idx on public.scores (user_id);
