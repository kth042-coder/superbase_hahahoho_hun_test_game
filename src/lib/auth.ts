"use client";

import { useSyncExternalStore } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";

/**
 * 로그인 상태 저장소 (PRD 2.4). React 어디서든 useAuth()로 읽는다.
 * - loading: 세션 복원 중
 * - unavailable: Supabase 환경 변수가 없음
 * - guest / user
 */
export interface AuthState {
  status: "loading" | "unavailable" | "guest" | "user";
  userId: string | null;
  email: string | null;
  nickname: string | null;
  /** 비밀번호 재설정 메일 링크로 들어온 상태 */
  recovery: boolean;
}

const GUEST: AuthState = { status: "guest", userId: null, email: null, nickname: null, recovery: false };
let state: AuthState = { ...GUEST, status: "loading" };
let session: Session | null = null;
const listeners = new Set<() => void>();
let initialized = false;

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: AuthState = { ...GUEST, status: "loading" };

export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

async function loadNickname(userId: string): Promise<string | null> {
  const client = await getSupabaseBrowser();
  if (!client) return null;
  // 가입 직후에는 트리거가 프로필을 만드는 중일 수 있어 한 번 재시도한다
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await client.from("profiles").select("nickname").eq("id", userId).maybeSingle();
    if (data?.nickname) return data.nickname;
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

async function applySession(next: Session | null) {
  session = next;
  if (!next) {
    setState({ ...GUEST, recovery: state.recovery });
    return;
  }
  const userId = next.user.id;
  setState({ status: "user", userId, email: next.user.email ?? null });
  const nickname = await loadNickname(userId);
  if (session?.user.id === userId) setState({ nickname });
}

/** 앱 시작 시 한 번 호출 — 세션 복원 + 상태 변화 구독 */
export async function initAuth(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const client = await getSupabaseBrowser();
  if (!client) {
    setState({ status: "unavailable" });
    return;
  }
  client.auth.onAuthStateChange((event, next) => {
    if (event === "PASSWORD_RECOVERY") setState({ recovery: true });
    // 콜백 안에서 Supabase를 바로 호출하면 교착될 수 있어 다음 틱으로 미룬다
    setTimeout(() => void applySession(next), 0);
  });
  const { data } = await client.auth.getSession();
  await applySession(data.session);
}

export async function getAccessToken(): Promise<string | null> {
  const client = await getSupabaseBrowser();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

// ───────────────────────── 동작 ─────────────────────────

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; message: string };

/** Supabase 오류를 사용자용 한국어 문구로 바꾼다 */
export function authErrorMessage(error: AuthError | Error | null | undefined): string {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  const code = "code" in error ? (error as AuthError).code : undefined;
  const msg = error.message ?? "";
  switch (code) {
    case "invalid_credentials":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "email_not_confirmed":
      return "이메일 인증을 완료해 주세요. 받은 편지함(스팸함 포함)을 확인해 주세요.";
    case "user_already_exists":
    case "email_exists":
      return "이미 가입된 이메일입니다. 로그인해 주세요.";
    case "weak_password":
      return "비밀번호가 너무 약합니다. 더 길고 복잡하게 만들어 주세요.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    case "email_address_invalid":
      return "사용할 수 없는 이메일 주소입니다.";
    case "same_password":
      return "이전과 다른 비밀번호를 입력해 주세요.";
    case "signup_disabled":
      return "현재 회원가입이 중지되어 있습니다.";
  }
  if (/database error saving new user/i.test(msg)) return "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.";
  if (/fetch|network/i.test(msg)) return "네트워크 오류가 발생했습니다. 연결을 확인해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function redirectUrl(): string {
  return window.location.origin + window.location.pathname;
}

export async function signUp(email: string, password: string, nickname: string): Promise<AuthResult> {
  const client = await getSupabaseBrowser();
  if (!client) return { ok: false, message: "회원 기능이 아직 설정되지 않았습니다." };
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { nickname }, emailRedirectTo: redirectUrl() },
  });
  if (error) return { ok: false, message: authErrorMessage(error) };
  // 이메일 인증이 켜져 있으면 session이 없다. 이미 가입된 이메일이면 identities가 빈 배열로 온다.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, message: "이미 가입된 이메일입니다. 로그인해 주세요." };
  }
  return { ok: true, needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = await getSupabaseBrowser();
  if (!client) return { ok: false, message: "회원 기능이 아직 설정되지 않았습니다." };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
}

export async function resendConfirmation(email: string): Promise<AuthResult> {
  const client = await getSupabaseBrowser();
  if (!client) return { ok: false, message: "회원 기능이 아직 설정되지 않았습니다." };
  const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectUrl() } });
  return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const client = await getSupabaseBrowser();
  if (!client) return { ok: false, message: "회원 기능이 아직 설정되지 않았습니다." };
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const client = await getSupabaseBrowser();
  if (!client) return { ok: false, message: "회원 기능이 아직 설정되지 않았습니다." };
  const { error } = await client.auth.updateUser({ password });
  if (error) return { ok: false, message: authErrorMessage(error) };
  setState({ recovery: false });
  return { ok: true };
}

export function dismissRecovery() {
  setState({ recovery: false });
}

export async function signOut(): Promise<void> {
  const client = await getSupabaseBrowser();
  await client?.auth.signOut();
}
