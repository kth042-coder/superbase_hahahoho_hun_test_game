# 작업 기록 (WORKLOG)

> 다음 작업을 시작할 때 **"현재 상태"와 "다음에 할 일"**부터 읽으세요.
> 작업이 끝날 때마다 맨 아래 "작업 이력"에 항목을 추가하고, 위의 두 섹션을 최신으로 고칩니다.
> (Stop 훅이 기록 누락을 막습니다 — `.claude/hooks/worklog-check.mjs`)

---

## 현재 상태 (2026-11-25 기준)

| 항목 | 상태 |
| :--- | :--- |
| 서비스 | **바른 블록** — Next.js 16 웹 테트리스 + 리더보드 + 피드백 + 회원가입/로그인 |
| 기획서 | `gemini-code-1795140232890.md` (PRD v1.3) |
| GitHub | https://github.com/kth042-coder/superbase_hahahoho_hun_test_game (`main`, 최신 커밋 `d50a9d4`) |
| 배포 | https://superbasehahahohohuntestgame-lv9g.vercel.app (Vercel, `main` 푸시 시 자동 배포) |
| Vercel 환경 변수 | 4개 등록 완료 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`) |
| Supabase | 마이그레이션 3개 모두 적용 (`init` → `grants` → `auth_profiles`). 이메일 인증 **켜짐** |
| 로컬 | `.env.local` 작성 완료(커밋 안 됨). 개발 서버 `npx next dev -p 3123` |
| 테스트 | 단위 42개 통과, 회원 기능 E2E 14개 통과(로컬·배포 모두) |

### 동작 확인된 기능
- 게임: 7-bag, SRS 회전/월킥, 홀드, 고스트, 락 딜레이, DAS/ARR, 점수·콤보·레벨, 일시정지/자동 일시정지
- 디자인: 풀무원 브랜드 컬러 토큰, 나눔스퀘어, 채소 테마 블록, 잎사귀 이펙트, 효과음, 반응형(데스크톱 3열/모바일 터치)
- 회원: 이메일+비밀번호 가입(고유 닉네임), 로그인, 인증 메일 재발송, 비밀번호 찾기/재설정, 로그아웃
- 점수 등록: **회원 전용**, 서버가 토큰 검증 후 프로필 닉네임으로 저장(사칭 불가), 점수 타당성 검사, 레이트 리밋
- 리더보드 Top 50, 피드백(쓰기 전용, 허니팟)

---

## 다음에 할 일

### 사용자 확인 필요
- [ ] **실제 이메일로 가입 → 인증 메일 수신 → 링크 클릭 → 로그인** 흐름 확인 (실메일 발송은 아직 미검증)
- [ ] Supabase **Authentication → URL Configuration** 설정 확인
  - Site URL: `https://superbasehahahohohuntestgame-lv9g.vercel.app`
  - Redirect URLs: `http://localhost:3123/**`, `https://superbasehahahohohuntestgame-lv9g.vercel.app/**`
- [ ] 배포 사이트에서 게임 오버 → [로그인하고 점수 등록] → 로그인 → 결과 화면 복귀 → 등록 흐름 직접 플레이
- [ ] `src/config.ts`의 `operatorNotice`("운영: 바른 블록 팀" 임시 문구)를 실제 운영 주체로 수정
- [ ] 풀무원 로고·슬로건 사용 시 브랜드/CI 부서 승인 (PRD 9.8)

### 개발 후보 (PRD 1.3 "회원 기능 2차 범위")
- [ ] 내 기록 보기 (최고 점수, 최근 기록, 현재 순위)
- [ ] 리더보드 1인 1기록 (사람별 최고 기록만 표시)
- [ ] 회원 탈퇴 UI (DB는 계정 삭제 시 점수까지 cascade 삭제되도록 이미 준비됨)
- [ ] 닉네임 변경
- [ ] Google 소셜 로그인
- [ ] 운영용 SMTP 연결 (Supabase 기본 메일은 시간당 발송 수 제한이 큼)

---

## 알아두면 좋은 함정 (다시 겪지 않도록)

- **Supabase 새 테이블은 GRANT가 자동으로 안 됨** → `permission denied (42501)`. 새 테이블을 만들면 `grant ... to anon / service_role`을 명시해야 한다 (`20261120000100_grants.sql` 참고).
- **supabase-js의 `head: true` count 요청은 실패해도 `error`가 비고 `count`만 `null`일 수 있다** → `count === null`을 반드시 오류로 처리 (닉네임 확인·레이트 리밋에서 실제로 발생).
- **SQL Editor에서 이미 실행한 `create table` SQL을 다시 돌리면 `42P07 already exists`** 로 쿼리 전체가 취소된다. 마이그레이션은 New query에서 파일 하나씩만 실행.
- **`NEXT_PUBLIC_*` 값은 빌드 시점에 코드에 박힌다** → Vercel에서 변수를 바꾸면 **Redeploy** 필요. 로컬 프로덕션 서버(`next start`)도 다시 빌드해야 함. 개발 서버는 `.env.local` 변경을 바로 반영.
- **이 PC의 Git Bash에는 node가 PATH에 없을 수 있음** → `export PATH="/c/Program Files/nodejs:$PATH"` (Node v26.13.1, winget 설치).
- **Git Bash에서 curl 인자로 한글 JSON을 보내면 인코딩이 깨짐** → 파일에 UTF-8로 쓰고 `--data-binary @file` 사용.
- **헤드리스 Edge 스크린샷은 창 너비가 약 500px 미만으로 줄지 않음** → 390px 캡처가 잘려 보여도 레이아웃 문제가 아님.
- **메모리 부족 시 Claude Code가 백그라운드 셸을 종료해도 node 개발 서버 프로세스는 남아 포트를 점유할 수 있음** → `netstat -ano | grep :3123`으로 확인.
- **OneDrive 폴더 + `.next`** → 빌드 중 `EBUSY` 발생 시 셸 cwd가 `.next` 안에 있지 않은지 확인 후 `rm -rf .next` 재시도.
- `AGENTS.md`는 `next dev`가 자동 생성하는 파일 (지워도 다시 생김, 커밋해 둠).

## 자주 쓰는 명령

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev -- -p 3123          # 개발 서버
npm run check                   # lint + 타입 체크 + 단위 테스트
npm run build                   # 프로덕션 빌드 (초기 JS gzip 200KB 이하 유지 — 현재 약 189KB)
npm run e2e:auth                # 회원 기능 E2E (로컬 3123 대상, 테스트 계정 자동 생성·삭제)
npm run e2e:auth -- https://superbasehahahohohuntestgame-lv9g.vercel.app   # 배포 사이트 대상
```

---

## 작업 이력

### 2026-11-20 — 1일차: 기획 검토부터 회원 기능 배포까지
1. **PRD 검토·개선 (v1.1):** 닉네임/피드백 길이 불일치 통일, anon INSERT 허용이라는 보안 구멍을 API Route + service_role 구조로 변경, 점수·레벨 공식, 게임 규칙(7-bag/SRS/락 딜레이), DDL, 수용 기준 추가.
2. **디자인 (v1.2):** 풀무원 홈페이지 CSS 분석(메인 그린 `#8dc63f`, 진녹 `#056130`, 베이지 `#ece9de`, 나눔스퀘어, radius 6/20/24px) → PRD 9장 디자인 시스템. 로고·슬로건·Lohas 서체는 승인 전 미사용.
3. **구현:** Next.js 16 + TS, Canvas 렌더러, 게임 엔진(순수 모듈), 모달(게임 오버/리더보드/피드백), API(`/api/scores`, `/api/feedback`), Supabase 마이그레이션, 효과음(Web Audio), 반응형. Node.js LTS를 winget으로 설치.
4. **Supabase 연동:** `.env.local` 작성, 테이블 권한(GRANT) 문제 해결 → 점수 저장·리더보드·보안 차단 확인.
5. **GitHub:** 저장소 생성 후 첫 커밋 `6c1c174` 푸시 (작성자 `kth042-coder` / noreply 이메일).
6. **Vercel:** 점수 저장 실패 원인 = 환경 변수 미등록 → 4개 등록 + Redeploy 후 정상 확인.
7. **회원가입·로그인 (v1.3):** Supabase Auth 이메일+비밀번호, `profiles`(고유 닉네임) + 가입 트리거, `scores.user_id`, 점수 등록 회원 전용, `/api/nickname`. 버그 수정: count 요청 실패 시 "사용 가능"으로 새던 문제. 커밋 `c40b078` 푸시 → 배포 사이트에서 E2E 14개 통과.
8. **작업 기록 체계:** 이 파일, `CLAUDE.md`, Stop 훅(`.claude/settings.json`) 추가, E2E 스크립트를 `scripts/e2e-auth.mjs`로 저장소에 편입.

### 2026-11-25 — 작업 기록 체계 커밋
- 커밋 `d50a9d4` — 미커밋 상태였던 `CLAUDE.md`, `docs/WORKLOG.md`, `.claude/settings.json`·`.claude/hooks/worklog-check.mjs`(Stop 훅), `scripts/e2e-auth.mjs`, `package.json`(`e2e:auth` 스크립트)을 커밋·푸시.
- 확인: `npm run check` 통과(단위 42개), 비밀값 검사 결과 없음. 앱 코드 변경 없음(e2e 스크립트의 비밀번호는 테스트용 임시 계정 값).
