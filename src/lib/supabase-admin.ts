import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/**
 * service_role 키를 쓰는 서버 전용 클라이언트. RLS를 우회하므로 API Route에서만 사용한다.
 * 환경 변수가 없으면 null을 반환한다 (로컬에서 Supabase 없이 게임만 실행하는 경우).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
