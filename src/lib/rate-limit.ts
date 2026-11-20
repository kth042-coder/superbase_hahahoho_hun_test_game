import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubmissionKind = "score" | "feedback";

/** PRD 6.2: 점수 1분 3회, 피드백 10분 3회 */
const LIMITS: Record<SubmissionKind, { max: number; windowMs: number }> = {
  score: { max: 3, windowMs: 60_000 },
  feedback: { max: 3, windowMs: 10 * 60_000 },
};

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** 원본 IP는 저장하지 않고 salt를 섞은 해시만 저장한다. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  return createHash("sha256").update(ip + salt).digest("hex");
}

/**
 * 제한을 넘지 않았으면 기록을 남기고 true, 넘었으면 false.
 * (동시 요청 경합으로 한두 건 더 통과할 수는 있으나 스팸 방지 목적에는 충분하다.)
 */
export async function checkAndRecord(
  db: SupabaseClient,
  ipHash: string,
  kind: SubmissionKind,
): Promise<boolean> {
  const { max, windowMs } = LIMITS[kind];
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await db
    .from("submission_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("kind", kind)
    .gte("created_at", since);
  // head 요청은 실패해도 error가 비고 count만 null로 올 수 있다
  if (error) throw error;
  if (count === null) throw new Error("submission_log count unavailable");
  if (count >= max) return false;
  const { error: insertError } = await db.from("submission_log").insert({ ip_hash: ipHash, kind });
  if (insertError) throw insertError;
  return true;
}
