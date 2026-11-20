import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeaderboardRow {
  id: string;
  nickname: string;
  score: number;
  level: number;
  lines_cleared: number;
  created_at: string;
}

export const LEADERBOARD_SIZE = 50;

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * 브라우저용 Supabase 클라이언트 (anon key). 초기 번들 크기를 줄이기 위해 supabase-js는 비동기로 불러온다.
 * 로그인 세션은 localStorage에 저장되고, 인증 메일 링크로 돌아오면 URL의 토큰을 자동으로 읽는다.
 */
export function getSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return null;
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
      });
    })();
  }
  return clientPromise;
}

const getClient = getSupabaseBrowser;

/** 리더보드 Top 50 (점수 내림차순, 동점이면 먼저 달성한 기록 우선) */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const client = await getClient();
  if (!client) throw new Error("NOT_CONFIGURED");
  const { data, error } = await client
    .from("scores")
    .select("id, nickname, score, level, lines_cleared, created_at")
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(LEADERBOARD_SIZE);
  if (error) throw error;
  return data ?? [];
}
