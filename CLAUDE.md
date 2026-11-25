# 바른 블록 (웹 테트리스) — 프로젝트 안내

## 세션 시작 시
1. **`docs/WORKLOG.md`를 먼저 읽는다** — 현재 상태, 마지막 세션 종료 스냅샷, 다음에 할 일, 알려진 함정이 정리되어 있다.
   - SessionStart 훅이 핵심 요약을 자동으로 넣어 주지만, 함정·명령은 파일 전체를 확인한다.
   - 스냅샷에 커밋 안 된 파일·푸시 안 된 커밋이 있으면 먼저 사용자에게 알리고 정리 여부를 묻는다.
2. 기획서는 `gemini-code-1795140232890.md` (PRD). 기능을 바꾸면 PRD도 함께 갱신한다.

## 작업 기록 규칙 (필수)
- 파일을 바꾸는 작업을 마칠 때마다 `docs/WORKLOG.md`를 갱신한다.
  - 맨 아래 **"작업 이력"**에 날짜(YYYY-MM-DD)와 함께 무엇을·왜 했는지, 커밋 해시, 확인 결과(테스트 통과 여부, 미확인 사항)를 추가한다.
  - **"현재 상태"**와 **"다음에 할 일"** 섹션을 최신으로 고친다 (끝난 항목 체크, 새 후속 작업 추가).
  - 새로 알게 된 함정은 **"알아두면 좋은 함정"**에 추가한다.
- Stop 훅(`.claude/hooks/worklog-check.mjs`)이 기록 누락 시 응답 종료를 막고 갱신을 요구한다.
- SessionEnd 훅(`.claude/hooks/session-end.mjs`)이 세션 종료 시점 상태를 WORKLOG의 스냅샷 블록에 자동 기록한다 (`<!-- SESSION-SNAPSHOT -->` 블록은 손으로 고치지 않는다).
- 비밀값(키, 비밀번호)은 기록에 쓰지 않는다.

## 소통
- 사용자에게는 항상 **한국어**로 답한다.

## 기술 요약
- Next.js 16 (App Router, Turbopack) + TypeScript, Canvas 2D, CSS Modules + 디자인 토큰(`src/app/globals.css`)
- Supabase: Postgres + RLS + Auth(이메일/비밀번호). 쓰기는 API Route가 service_role로만 수행
- 배포: Vercel (`main` 푸시 시 자동). 환경 변수 4개는 README 참고
- 이 PC의 Git Bash에서는 `export PATH="/c/Program Files/nodejs:$PATH"` 후 npm/npx 사용

## 검증
- 변경 후 `npm run check` (lint + tsc + vitest), 배포 전 `npm run build`
- 회원/점수 흐름: `npm run e2e:auth` (테스트 계정 자동 생성·삭제)
- 커밋 전 비밀값 검사: `git grep --cached -nE "eyJhbGci|sb_secret_"` 결과가 없어야 함
