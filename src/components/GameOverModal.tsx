"use client";

import { useState } from "react";
import { getAccessToken, useAuth } from "@/lib/auth";
import { Modal } from "./Modal";
import { SproutIcon } from "./icons";
import styles from "./ui.module.css";

export interface Submission {
  id: string;
  rank: number;
}

export interface GameResult {
  score: number;
  level: number;
  lines: number;
  durationMs: number;
  isNewBest: boolean;
  /** 등록 완료 정보 — 모달을 오가도 중복 등록되지 않도록 부모가 보관한다 */
  submission?: Submission;
}

interface Props {
  result: GameResult;
  onRestart: () => void;
  onShowLeaderboard: () => void;
  onRequestLogin: () => void;
  onSubmitted: (submission: Submission) => void;
  onClose: () => void;
}

type SubmitState = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

export function GameOverModal({ result, onRestart, onShowLeaderboard, onRequestLogin, onSubmitted, onClose }: Props) {
  const auth = useAuth();
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const done = result.submission;

  async function submit() {
    if (done || result.score <= 0 || state.kind === "submitting") return;
    setState({ kind: "submitting" });
    try {
      const token = await getAccessToken();
      if (!token) {
        setState({ kind: "idle" });
        onRequestLogin();
        return;
      }
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          score: result.score,
          level: result.level,
          lines_cleared: result.lines,
          duration_ms: Math.round(result.durationMs),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; rank?: number; error?: string };
      if (res.status === 401) {
        setState({ kind: "error", message: body.error ?? "다시 로그인해 주세요." });
        return;
      }
      if (!res.ok || !body.id) {
        setState({ kind: "error", message: body.error ?? "기록을 저장하지 못했습니다." });
        return;
      }
      setState({ kind: "idle" });
      onSubmitted({ id: body.id, rank: body.rank ?? 0 });
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

      {done ? (
        <p className={styles.success} role="status">
          기록을 등록했습니다. 현재 <strong>{done.rank.toLocaleString()}위</strong>입니다.
        </p>
      ) : result.score === 0 ? (
        <p className={styles.hint}>0점 기록은 등록할 수 없습니다.</p>
      ) : auth.status === "user" ? (
        <div className={styles.form}>
          <p className={styles.hint}>
            <strong className={styles.strongText}>{auth.nickname ?? "내 닉네임"}</strong> 이름으로 리더보드에 등록합니다.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={submit}
            disabled={state.kind === "submitting"}
            data-autofocus
          >
            {state.kind === "submitting" ? "등록 중…" : state.kind === "error" ? "재시도" : "점수 등록"}
          </button>
          {state.kind === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </div>
      ) : auth.status === "unavailable" ? (
        <p className={styles.hint}>점수 등록 기능이 아직 설정되지 않았습니다.</p>
      ) : (
        <div className={styles.form}>
          <p className={styles.hint}>점수 등록은 회원만 할 수 있어요. 로그인하면 이 기록을 바로 등록할 수 있습니다.</p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onRequestLogin}
            disabled={auth.status === "loading"}
            data-autofocus
          >
            로그인하고 점수 등록
          </button>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onRestart}>
          다시 하기
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onShowLeaderboard}>
          리더보드 보기
        </button>
      </div>
    </Modal>
  );
}
