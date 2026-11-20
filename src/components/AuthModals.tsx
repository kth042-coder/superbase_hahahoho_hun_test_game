"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  resendConfirmation,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  useAuth,
} from "@/lib/auth";
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  PASSWORD_MIN,
  emailSchema,
  firstIssue,
  passwordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";
import { Modal } from "./Modal";
import styles from "./ui.module.css";

type View = "signIn" | "signUp" | "forgot";
type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string } | { kind: "info"; message: string };

interface AuthModalProps {
  initialView?: View;
  /** 로그인 직후 안내 문구 (예: "로그인하면 방금 기록을 등록할 수 있어요") */
  reason?: string;
  onClose: () => void;
  onSignedIn: () => void;
}

/** 로그인 / 회원가입 / 비밀번호 찾기 (PRD 2.4) */
export function AuthModal({ initialView = "signIn", reason, onClose, onSignedIn }: AuthModalProps) {
  const [view, setView] = useState<View>(initialView);
  const auth = useAuth();
  const signedInRef = useRef(false);

  // 로그인 상태가 되면 (이 모달에서 로그인했거나 다른 탭에서 로그인됨) 알린다
  useEffect(() => {
    if (auth.status === "user" && !signedInRef.current) {
      signedInRef.current = true;
      onSignedIn();
    }
  }, [auth.status, onSignedIn]);

  const title = view === "signIn" ? "로그인" : view === "signUp" ? "회원가입" : "비밀번호 찾기";

  return (
    <Modal title={title} onClose={onClose}>
      {auth.status === "unavailable" ? (
        <p className={styles.error}>회원 기능이 아직 설정되지 않았습니다.</p>
      ) : (
        <>
          {view !== "forgot" && (
            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "signIn"}
                className={view === "signIn" ? styles.tabActive : styles.tab}
                onClick={() => setView("signIn")}
              >
                로그인
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "signUp"}
                className={view === "signUp" ? styles.tabActive : styles.tab}
                onClick={() => setView("signUp")}
              >
                회원가입
              </button>
            </div>
          )}
          {reason && view !== "forgot" && <p className={styles.notice}>{reason}</p>}
          {view === "signIn" && <SignInForm onForgot={() => setView("forgot")} />}
          {view === "signUp" && <SignUpForm onDone={() => setView("signIn")} />}
          {view === "forgot" && <ForgotForm onBack={() => setView("signIn")} />}
        </>
      )}
    </Modal>
  );
}

function StatusMessage({ status }: { status: Status }) {
  if (status.kind === "error")
    return (
      <p className={styles.error} role="alert">
        {status.message}
      </p>
    );
  if (status.kind === "info")
    return (
      <p className={styles.success} role="status">
        {status.message}
      </p>
    );
  return null;
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setStatus({ kind: "error", message: firstIssue(parsed.error) });
    setStatus({ kind: "busy" });
    const r = await signIn(parsed.data.email, parsed.data.password);
    if (!r.ok) {
      setUnconfirmed(r.message.startsWith("이메일 인증"));
      setStatus({ kind: "error", message: r.message });
    }
    // 성공 시 useAuth 상태 변화로 AuthModal이 onSignedIn을 호출한다
  }

  async function resend() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return;
    setStatus({ kind: "busy" });
    const r = await resendConfirmation(parsed.data);
    setStatus(r.ok ? { kind: "info", message: "인증 메일을 다시 보냈습니다." } : { kind: "error", message: r.message });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.label} htmlFor="si-email">
        이메일
      </label>
      <input
        id="si-email"
        type="email"
        className={styles.input}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        data-autofocus
      />
      <label className={styles.label} htmlFor="si-password">
        비밀번호
      </label>
      <input
        id="si-password"
        type="password"
        className={styles.input}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <StatusMessage status={status} />
      {unconfirmed && (
        <button type="button" className={styles.textButton} onClick={resend}>
          인증 메일 다시 보내기
        </button>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.textButton} onClick={onForgot}>
          비밀번호를 잊으셨나요?
        </button>
        <button type="submit" className={styles.primaryButton} disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "확인 중…" : "로그인"}
        </button>
      </div>
    </form>
  );
}

type NickCheck = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "bad"; message: string };

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [nick, setNick] = useState<NickCheck>({ kind: "idle" });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function checkNickname(name: string): Promise<boolean> {
    if (name.trim().length < NICKNAME_MIN) return false;
    setNick({ kind: "checking" });
    try {
      const res = await fetch(`/api/nickname?name=${encodeURIComponent(name)}`);
      const body = (await res.json()) as { available?: boolean; reason?: string; error?: string };
      if (!res.ok) {
        setNick({ kind: "bad", message: body.error ?? "닉네임을 확인하지 못했습니다." });
        return false;
      }
      if (body.available) {
        setNick({ kind: "ok" });
        return true;
      }
      setNick({ kind: "bad", message: body.reason ?? "사용할 수 없는 닉네임입니다." });
      return false;
    } catch {
      setNick({ kind: "bad", message: "닉네임을 확인하지 못했습니다." });
      return false;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ email, password, passwordConfirm, nickname });
    if (!parsed.success) return setStatus({ kind: "error", message: firstIssue(parsed.error) });
    setStatus({ kind: "busy" });
    if (!(await checkNickname(parsed.data.nickname))) {
      setStatus({ kind: "idle" });
      return;
    }
    const r = await signUp(parsed.data.email, parsed.data.password, parsed.data.nickname);
    if (!r.ok) return setStatus({ kind: "error", message: r.message });
    if (r.needsConfirmation) setSentTo(parsed.data.email);
    // 이메일 인증이 꺼져 있으면 바로 로그인 상태가 되어 AuthModal이 닫힌다
  }

  if (sentTo) {
    return (
      <div className={styles.form}>
        <p className={styles.success} role="status">
          <strong>{sentTo}</strong>(으)로 인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.
        </p>
        <p className={styles.hint}>메일이 보이지 않으면 스팸함을 확인해 주세요.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onDone} data-autofocus>
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.label} htmlFor="su-email">
        이메일
      </label>
      <input
        id="su-email"
        type="email"
        className={styles.input}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        data-autofocus
      />
      <label className={styles.label} htmlFor="su-nickname">
        닉네임{" "}
        <span className={styles.hint}>
          ({NICKNAME_MIN}~{NICKNAME_MAX}자, 리더보드에 표시)
        </span>
      </label>
      <input
        id="su-nickname"
        className={styles.input}
        value={nickname}
        onChange={(e) => {
          setNickname(e.target.value);
          setNick({ kind: "idle" });
        }}
        onBlur={() => nickname.trim() && void checkNickname(nickname)}
        maxLength={NICKNAME_MAX + 4}
        autoComplete="nickname"
        aria-describedby="su-nickname-status"
      />
      <p id="su-nickname-status" aria-live="polite" className={nick.kind === "bad" ? styles.error : styles.hint}>
        {nick.kind === "checking" && "확인 중…"}
        {nick.kind === "ok" && "사용할 수 있는 닉네임입니다."}
        {nick.kind === "bad" && nick.message}
      </p>
      <label className={styles.label} htmlFor="su-password">
        비밀번호 <span className={styles.hint}>({PASSWORD_MIN}자 이상, 영문+숫자)</span>
      </label>
      <input
        id="su-password"
        type="password"
        className={styles.input}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
      />
      <label className={styles.label} htmlFor="su-password2">
        비밀번호 확인
      </label>
      <input
        id="su-password2"
        type="password"
        className={styles.input}
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
        autoComplete="new-password"
      />
      <p className={styles.hint}>이메일은 로그인과 비밀번호 찾기에만 사용되며 공개되지 않습니다.</p>
      <StatusMessage status={status} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "가입 중…" : "가입하기"}
        </button>
      </div>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setStatus({ kind: "error", message: firstIssue(parsed.error) });
    setStatus({ kind: "busy" });
    const r = await sendPasswordReset(parsed.data);
    setStatus(
      r.ok
        ? { kind: "info", message: "가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 메일의 링크를 눌러 주세요." }
        : { kind: "error", message: r.message },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.hint}>가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내 드립니다.</p>
      <label className={styles.label} htmlFor="fg-email">
        이메일
      </label>
      <input
        id="fg-email"
        type="email"
        className={styles.input}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        data-autofocus
      />
      <StatusMessage status={status} />
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          로그인으로
        </button>
        <button type="submit" className={styles.primaryButton} disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "보내는 중…" : "재설정 메일 받기"}
        </button>
      </div>
    </form>
  );
}

/** 비밀번호 재설정 메일 링크로 들어왔을 때 새 비밀번호 입력 */
export function ResetPasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setStatus({ kind: "error", message: firstIssue(parsed.error) });
    if (password !== confirm) return setStatus({ kind: "error", message: "비밀번호가 서로 일치하지 않습니다." });
    setStatus({ kind: "busy" });
    const r = await updatePassword(password);
    if (!r.ok) return setStatus({ kind: "error", message: r.message });
    setDone(true);
  }

  return (
    <Modal title="새 비밀번호 설정" onClose={onClose}>
      {done ? (
        <>
          <p className={styles.success} role="status">
            비밀번호를 변경했습니다.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={onClose} data-autofocus>
              확인
            </button>
          </div>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.label} htmlFor="rp-password">
            새 비밀번호 <span className={styles.hint}>({PASSWORD_MIN}자 이상, 영문+숫자)</span>
          </label>
          <input
            id="rp-password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            data-autofocus
          />
          <label className={styles.label} htmlFor="rp-password2">
            새 비밀번호 확인
          </label>
          <input
            id="rp-password2"
            type="password"
            className={styles.input}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <StatusMessage status={status} />
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryButton} disabled={status.kind === "busy"}>
              {status.kind === "busy" ? "변경 중…" : "비밀번호 변경"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** 로그인한 사용자의 계정 정보 */
export function AccountModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await signOut();
    onClose();
  }

  return (
    <Modal title="내 계정" onClose={onClose}>
      <dl className={styles.accountInfo}>
        <dt>닉네임</dt>
        <dd>{auth.nickname ?? "불러오는 중…"}</dd>
        <dt>이메일</dt>
        <dd>{auth.email}</dd>
      </dl>
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={logout} disabled={busy}>
          {busy ? "로그아웃 중…" : "로그아웃"}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onClose} data-autofocus>
          닫기
        </button>
      </div>
    </Modal>
  );
}
