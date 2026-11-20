# 바른 블록

브라우저에서 바로 즐기는 블록 퍼즐 게임입니다. 기획은 [`gemini-code-1795140232890.md`](./gemini-code-1795140232890.md)(PRD)를 따릅니다.

- Next.js 16 (App Router) + TypeScript, Canvas 2D 렌더링
- Supabase (리더보드·피드백), Vercel 배포
- 풀무원 브랜드 컬러 기반 디자인 토큰 (`src/app/globals.css`)

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase 값 입력 (없어도 게임은 동작, 점수 등록·리더보드·피드백만 비활성)
npm run dev                  # http://localhost:3000
```

## 스크립트

| 명령 | 설명 |
| :--- | :--- |
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm test` | 단위 테스트 (게임 로직, 입력 검증, 점수 타당성) |
| `npm run check` | lint + 타입 체크 + 테스트 (CI용) |

## Supabase 설정

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/`의 SQL을 **파일 이름 순서대로 하나씩** 실행 (각각 New query에서)
   1. `20261120000000_init.sql` — 테이블, RLS
   2. `20261120000100_grants.sql` — 테이블 권한
   3. `20261120000200_auth_profiles.sql` — 회원 프로필, 가입 트리거, 점수-계정 연결
3. Authentication → URL Configuration
   - **Site URL:** 배포 주소 (예: `https://○○○.vercel.app`)
   - **Redirect URLs:** `http://localhost:3000/**`, `http://localhost:3123/**`, `https://○○○.vercel.app/**`
4. Project Settings → API에서 값을 복사해 `.env.local`(로컬)과 Vercel Environment Variables(배포)에 등록

> Supabase 기본 메일 발송은 시간당 발송 수가 적게 제한됩니다. 실제 서비스에서는 Authentication → Emails에서 SMTP를 연결하세요.

| 변수 | 범위 |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 (리더보드 조회만 가능) |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** — `NEXT_PUBLIC_` 접두사 금지 |
| `IP_HASH_SALT` | **서버 전용** — 임의의 긴 문자열 |

## 폴더 구조

```
src/
  game/        게임 로직 (DOM 없음, 단위 테스트 대상) + Canvas 렌더러
  lib/         검증 스키마, 점수 타당성 검사, Supabase 클라이언트, 사운드, 저장소
  components/  React UI (게임 화면, 모달)
  app/         페이지, 레이아웃, API Route (/api/scores, /api/feedback)
supabase/migrations/  DB 스키마 + RLS
```

## 배포 전 확인

- `src/config.ts`의 `operatorNotice`를 실제 운영 주체로 수정 (PRD 9.8)
- 로고·슬로건을 쓰려면 브랜드/CI 담당 부서 승인 필요 (현재는 로고 없이 색·서체만 반영)
- PRD 7장 배포 후 검증 체크리스트 수행
