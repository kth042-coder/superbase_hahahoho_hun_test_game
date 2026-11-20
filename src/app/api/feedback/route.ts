import { errorJson, json, readJson } from "@/lib/api-response";
import { checkAndRecord, clientIp, hashIp } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { feedbackSchema, firstIssue } from "@/lib/validation";

/** POST /api/feedback — PRD 5.2 */
export async function POST(req: Request) {
  const parsed = feedbackSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, firstIssue(parsed.error));
  const input = parsed.data;

  // 허니팟이 채워져 있으면 봇으로 보고 저장하지 않되, 성공처럼 응답한다
  if (input.website) return json({ ok: true }, 201);

  const db = getSupabaseAdmin();
  if (!db) return errorJson(503, "의견 보내기 기능이 아직 설정되지 않았습니다.");

  try {
    const allowed = await checkAndRecord(db, hashIp(clientIp(req)), "feedback");
    if (!allowed) return errorJson(429, "잠시 후 다시 시도해 주세요. (10분에 3회까지 보낼 수 있습니다)");

    const { error } = await db.from("feedbacks").insert({
      category: input.category,
      message: input.message,
      contact: input.contact ?? null,
      meta: input.meta ?? null,
    });
    if (error) throw error;
    return json({ ok: true }, 201);
  } catch (err) {
    console.error("[feedback] insert failed", err);
    return errorJson(500, "서버 오류로 의견을 저장하지 못했습니다.");
  }
}
