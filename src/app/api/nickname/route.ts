import { errorJson, json } from "@/lib/api-response";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { firstIssue, nicknameSchema } from "@/lib/validation";

/** GET /api/nickname?name=... — 회원가입 전 닉네임 사용 가능 여부 확인 (대소문자 구분 없음) */
export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return errorJson(503, "회원 기능이 아직 설정되지 않았습니다.");

  const name = new URL(req.url).searchParams.get("name") ?? "";
  const parsed = nicknameSchema.safeParse(name);
  if (!parsed.success) return json({ available: false, reason: firstIssue(parsed.error) });

  // ilike는 %, _ 를 와일드카드로 해석하므로 이스케이프한다
  const pattern = parsed.data.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { count, error } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .ilike("nickname", pattern);
  // head 요청은 실패해도 error가 비고 count만 null로 올 수 있어 둘 다 확인한다 (실패 시 "사용 가능"으로 새지 않게)
  if (error || count === null) {
    console.error("[nickname] check failed", error ?? "count is null");
    return errorJson(500, "닉네임을 확인하지 못했습니다.");
  }
  const available = count === 0;
  return json({ available, reason: available ? undefined : "이미 사용 중인 닉네임입니다." });
}
