"use client";

import { useState, type FormEvent } from "react";
import {
  CONTACT_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  MESSAGE_MAX,
  MESSAGE_MIN,
  feedbackSchema,
  firstIssue,
  type FeedbackCategory,
} from "@/lib/validation";
import { Modal } from "./Modal";
import styles from "./ui.module.css";

interface Props {
  onClose: () => void;
}

type State = { kind: "idle" } | { kind: "submitting" } | { kind: "done" } | { kind: "error"; message: string };

export function FeedbackModal({ onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // 허니팟
  const [state, setState] = useState<State>({ kind: "idle" });
  const length = message.trim().length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      category,
      message,
      contact,
      website,
      meta: {
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
        userAgent: navigator.userAgent.slice(0, 400),
        screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
      },
    };
    const parsed = feedbackSchema.safeParse(payload);
    if (!parsed.success) {
      setState({ kind: "error", message: firstIssue(parsed.error) });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setState({ kind: "error", message: body.error ?? "의견을 보내지 못했습니다." });
        return;
      }
      setState({ kind: "done" });
    } catch {
      setState({ kind: "error", message: "네트워크 오류로 보내지 못했습니다. 연결을 확인해 주세요." });
    }
  }

  if (state.kind === "done") {
    return (
      <Modal title="의견 보내기" onClose={onClose}>
        <p className={styles.success} role="status">
          소중한 의견 감사합니다! 더 나은 게임을 만드는 데 참고하겠습니다.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onClose} data-autofocus>
            닫기
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="의견 보내기" onClose={onClose}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>유형</legend>
          <div className={styles.segmented}>
            {FEEDBACK_CATEGORIES.map((c) => (
              <label key={c} className={category === c ? styles.segmentActive : styles.segment}>
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  className={styles.srOnly}
                />
                {FEEDBACK_CATEGORY_LABELS[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={styles.label} htmlFor="fb-message">
          내용 <span className={styles.hint}>(필수, {MESSAGE_MIN}~{MESSAGE_MAX}자)</span>
        </label>
        <textarea
          id="fb-message"
          className={styles.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX + 50}
          rows={5}
          placeholder="불편했던 점이나 바라는 기능을 자유롭게 적어 주세요."
          data-autofocus
        />
        <p className={`${styles.counter} ${length > MESSAGE_MAX ? styles.error : ""}`} aria-live="polite">
          {length} / {MESSAGE_MAX}
        </p>

        <label className={styles.label} htmlFor="fb-contact">
          연락처 또는 닉네임 <span className={styles.hint}>(선택)</span>
        </label>
        <input
          id="fb-contact"
          className={styles.input}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={CONTACT_MAX}
          autoComplete="email"
          placeholder="이메일 또는 닉네임"
        />
        <p className={styles.hint}>답변 목적으로만 사용되며 공개되지 않습니다.</p>

        {/* 허니팟: 화면에 보이지 않으며 사람은 채우지 않는다 */}
        <div className={styles.honeypot} aria-hidden="true">
          <label htmlFor="fb-website">웹사이트</label>
          <input
            id="fb-website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {state.kind === "error" && (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={state.kind === "submitting"}>
            {state.kind === "submitting" ? "보내는 중…" : "보내기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
