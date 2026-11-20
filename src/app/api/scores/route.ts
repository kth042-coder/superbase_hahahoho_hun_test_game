import { errorJson, json, readJson } from "@/lib/api-response";
import { checkPlausibility } from "@/lib/plausibility";
import { checkAndRecord, clientIp, hashIp } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { firstIssue, scoreSubmissionSchema } from "@/lib/validation";

/** POST /api/scores — PRD 5.1. 로그인한 회원만 등록 가능 (Authorization: Bearer <access_token>) */
export async function POST(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return errorJson(503, "점수 저장 기능이 아직 설정되지 않았습니다.");

  // 1) 로그인 확인 — 토큰을 Supabase Auth로 검증한다 (클라이언트가 보낸 사용자 정보는 믿지 않는다)
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return errorJson(401, "로그인 후 점수를 등록할 수 있습니다.");
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return errorJson(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const userId = auth.user.id;

  // 2) 입력 검증 + 점수 타당성
  const parsed = scoreSubmissionSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, firstIssue(parsed.error));
  const input = parsed.data;

  const plausible = checkPlausibility(input);
  if (!plausible.ok) {
    console.warn("[scores] rejected implausible score", plausible.reason, { userId, ...input });
    return errorJson(400, "기록을 확인할 수 없어 등록하지 못했습니다.");
  }

  try {
    // 3) 닉네임은 프로필에서 가져온다
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("nickname")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return errorJson(409, "프로필 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");

    const allowed = await checkAndRecord(db, hashIp(clientIp(req)), "score");
    if (!allowed) return errorJson(429, "잠시 후 다시 시도해 주세요. (1분에 3회까지 등록할 수 있습니다)");

    const { data: row, error } = await db
      .from("scores")
      .insert({
        user_id: userId,
        nickname: profile.nickname,
        score: input.score,
        level: input.level,
        lines_cleared: input.lines_cleared,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    // 순위 = 나보다 점수가 높거나, 같은 점수를 먼저 달성한 기록 수 + 1
    const [higher, tiedEarlier] = await Promise.all([
      db.from("scores").select("id", { count: "exact", head: true }).gt("score", input.score),
      db
        .from("scores")
        .select("id", { count: "exact", head: true })
        .eq("score", input.score)
        .lt("created_at", row.created_at),
    ]);
    if (higher.error) throw higher.error;
    if (tiedEarlier.error) throw tiedEarlier.error;
    const rank = (higher.count ?? 0) + (tiedEarlier.count ?? 0) + 1;

    return json({ id: row.id, rank, nickname: profile.nickname }, 201);
  } catch (err) {
    console.error("[scores] insert failed", err);
    return errorJson(500, "서버 오류로 기록을 저장하지 못했습니다.");
  }
}
