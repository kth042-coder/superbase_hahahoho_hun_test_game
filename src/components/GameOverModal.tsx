"use client";

import { useState, type FormEvent } from "react";
import { loadString, saveString } from "@/lib/storage";
import { NICKNAME_MAX, nicknameSchema, firstIssue } from "@/lib/validation";
import { Modal } from "./Modal";
import { SproutIcon } from "./icons";
import styles from "./ui.module.css";

export interface GameResult {
  score: number;
  level: number;
  lines: number;
  durationMs: number;
  isNewBest: boolean;
}

interface Props {
  result: GameResult;
  onRestart: () => void;
  onShowLeaderboard: (highlight?: { id: string; rank: number }) => void;
  onClose: () => void;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; id: string; rank: number }
  | { kind: "error"; message: string };

export function GameOverModal({ result, onRestart, onShowLeaderboard, onClose }: Props) {
  const [nickname, setNickname] = useState(() => loadString("nickname") ?? "");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const canSubmit = result.score > 0 && state.kind !== "submitting" && state.kind !== "done";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setState({ kind: "error", message: firstIssue(parsed.error) });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: parsed.data,
          score: result.score,
          level: result.level,
          lines_cleared: result.lines,
          duration_ms: Math.round(result.durationMs),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; rank?: number; error?: string };
      if (!res.ok || !body.id) {
        setState({ kind: "error", message: body.error ?? "기록을 저장하지 못했습니다." });
        return;
      }
      saveString("nickname", parsed.data);
      setState({ kind: "done", id: body.id, rank: body.rank ?? 0 });
    } catch {
      setState({ kind: "error", message: "네트워크 오류로 저장하지 못했습니다. 연결을 확인해 주세요." });
    }
  }

  return (
    <Modal title="오늘의 수확" onClose={onClose}>
      {result.isNewBest && result.score > 0 && (
        <p className={styles.badge}>
          <SproutIcon width={16} height={16} /> 개인 최고 기록 갱신!
        </p>
      )}
      <dl className={styles.resultGrid}>
        <div>
          <dt>점수</dt>
          <dd>{result.score.toLocaleString()}</dd>
        </div>
        <div>
          <dt>레벨</dt>
          <dd>{result.level}</dd>
        </div>
        <div>
          <dt>라인</dt>
          <dd>{result.lines}</dd>
        </div>
      </dl>

      {state.kind === "done" ? (
        <p className={styles.success} role="status">
          기록을 등록했습니다. 현재 <strong>{state.rank.toLocaleString()}위</strong>입니다.
        </p>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.label} htmlFor="nickname">
            닉네임 <span className={styles.hint}>(2~{NICKNAME_MAX}자)</span>
          </label>
          <div className={styles.inlineRow}>
            <input
              id="nickname"
              className={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX + 4}
              autoComplete="nickname"
              placeholder="닉네임 입력"
              disabled={result.score === 0}
              data-autofocus
            />
            <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>
              {state.kind === "submitting" ? "등록 중…" : state.kind === "error" ? "재시도" : "점수 등록"}
            </button>
          </div>
          {result.score === 0 && <p className={styles.hint}>0점 기록은 등록할 수 없습니다.</p>}
          {state.kind === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onRestart}>
          다시 하기
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onShowLeaderboard(state.kind === "done" ? { id: state.id, rank: state.rank } : undefined)}
        >
          리더보드 보기
        </button>
      </div>
    </Modal>
  );
}
