// 회원 기능 E2E 확인: 관리자 API로 인증 완료된 테스트 계정 생성 → 로그인 → 점수 등록 → 정리
// 사용: npm run e2e:auth [-- <base-url>]  (기본: http://localhost:3123)
import { readFileSync } from "node:fs";

const [envFile = ".env.local", BASE = "http://localhost:3123"] = process.argv.slice(2);
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@example.com`;
const password = "e2eTest1234";
const nickname = `테스트${stamp.slice(-4)}`;
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
const userIds = [];

async function createUser(em, nick) {
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email: em, password, email_confirm: true, user_metadata: { nickname: nick } }),
  });
  const body = await res.json();
  if (res.ok && body.id) userIds.push(body.id);
  return { res, body };
}

try {
  // 1) 가입 (트리거가 프로필 생성)
  const { res, body } = await createUser(email, nickname);
  check("회원 생성 + 프로필 트리거", res.ok, res.ok ? "" : JSON.stringify(body).slice(0, 120));
  const userId = body.id;

  const prof = await (await fetch(`${URL_}/rest/v1/profiles?id=eq.${userId}&select=nickname`, { headers: admin })).json();
  check("프로필 닉네임 저장", prof[0]?.nickname === nickname, JSON.stringify(prof));

  // 2) 닉네임 중복 확인 API — 대소문자/동일 닉네임은 사용 불가
  const nick = await (await fetch(`${BASE}/api/nickname?name=${encodeURIComponent(nickname)}`)).json();
  check("닉네임 중복 확인 API (사용 중)", nick.available === false, JSON.stringify(nick));

  // 3) 같은 닉네임으로 다른 계정 가입 → 실패해야 함
  const dup = await createUser(`e2e-dup-${stamp}@example.com`, nickname);
  check("중복 닉네임 가입 차단", !dup.res.ok, `status ${dup.res.status}`);

  // 4) 로그인 (anon key + 비밀번호)
  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await login.json();
  check("이메일+비밀번호 로그인", login.ok && !!session.access_token);

  const wrong = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrongPass999" }),
  });
  check("틀린 비밀번호 거부", !wrong.ok, `status ${wrong.status}`);

  // 5) 본인 프로필은 RLS로 조회 가능, 다른 사람 프로필은 불가
  const own = await (
    await fetch(`${URL_}/rest/v1/profiles?select=nickname`, {
      headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` },
    })
  ).json();
  check("본인 프로필만 조회됨 (RLS)", Array.isArray(own) && own.length === 1 && own[0].nickname === nickname, JSON.stringify(own));

  // 6) 점수 등록 — 클라이언트가 다른 닉네임을 보내도 프로필 닉네임으로 저장되어야 함
  const score = await fetch(`${BASE}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ nickname: "사칭시도", score: 4321, level: 2, lines_cleared: 12, duration_ms: 120000 }),
  });
  const scoreBody = await score.json();
  check("로그인 후 점수 등록", score.status === 201, `${score.status} ${JSON.stringify(scoreBody)}`);
  check("닉네임 사칭 불가 (프로필 닉네임 사용)", scoreBody.nickname === nickname);

  const row = await (
    await fetch(`${URL_}/rest/v1/scores?id=eq.${scoreBody.id}&select=nickname,score,user_id`, { headers: admin })
  ).json();
  check("DB에 user_id 연결", row[0]?.user_id === userId && row[0]?.score === 4321, JSON.stringify(row));

  // 7) 리더보드(anon)에 보임
  const lb = await (
    await fetch(`${URL_}/rest/v1/scores?select=nickname,score&order=score.desc&limit=50`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
  ).json();
  check("리더보드에 반영", lb.some((r) => r.nickname === nickname && r.score === 4321));

  // 8) 비로그인 점수 등록은 401
  const anonScore = await fetch(`${BASE}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 100, level: 1, lines_cleared: 1, duration_ms: 10000 }),
  });
  check("비로그인 점수 등록 거부", anonScore.status === 401, `status ${anonScore.status}`);
} catch (err) {
  check("예외 없이 실행", false, String(err));
} finally {
  // 정리: 계정 삭제 → 프로필·점수는 on delete cascade로 함께 삭제
  for (const id of userIds) {
    const del = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
    check(`테스트 계정 삭제 (${id.slice(0, 8)})`, del.ok, `status ${del.status}`);
  }
  if (userIds[0]) {
    const left = await (await fetch(`${URL_}/rest/v1/scores?user_id=eq.${userIds[0]}&select=id`, { headers: admin })).json();
    check("계정 삭제 시 점수도 함께 삭제", Array.isArray(left) && left.length === 0, JSON.stringify(left));
  }
  console.log(results.join("\n"));
}
