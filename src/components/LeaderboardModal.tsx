"use client";

import { useCallback, useEffect, useState } from "react";
import { LEADERBOARD_SIZE, fetchLeaderboard, type LeaderboardRow } from "@/lib/supabase-browser";
import { Modal } from "./Modal";
import { LeafIcon } from "./icons";
import styles from "./ui.module.css";

interface Props {
  highlight?: { id: string; rank: number };
  onClose: () => void;
}

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; rows: LeaderboardRow[] };

const relative = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("ko", { dateStyle: "medium", timeStyle: "short" });

function formatDate(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "방금 전";
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 7) return relative.format(Math.round(diffSec / 86400), "day");
  return absolute.format(date);
}

const LEAF_CLASSES = [styles.leafGold, styles.leafSilver, styles.leafBronze];

export function LeaderboardModal({ highlight, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ok", rows: await fetchLeaderboard() });
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "NOT_CONFIGURED";
      setState({
        kind: "error",
        message: notConfigured ? "리더보드가 아직 설정되지 않았습니다." : "리더보드를 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    // 마운트 시 비동기 로드 (setState는 await 이후에 일어난다)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const inList = state.kind === "ok" && highlight && state.rows.some((r) => r.id === highlight.id);

  return (
    <Modal title={`리더보드 Top ${LEADERBOARD_SIZE}`} onClose={onClose} wide>
      {state.kind === "loading" && (
        <ul className={styles.skeletonList} aria-label="불러오는 중">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      )}

      {state.kind === "error" && (
        <div className={styles.emptyState}>
          <p className={styles.error} role="alert">
            {state.message}
          </p>
          <button type="button" className={styles.secondaryButton} onClick={load}>
            다시 시도
          </button>
        </div>
      )}

      {state.kind === "ok" && state.rows.length === 0 && (
        <p className={styles.emptyState}>아직 등록된 기록이 없습니다. 첫 번째 주인공이 되어 보세요!</p>
      )}

      {state.kind === "ok" && state.rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">닉네임</th>
                <th scope="col" className={styles.num}>
                  점수
                </th>
                <th scope="col" className={styles.num}>
                  레벨
                </th>
                <th scope="col" className={`${styles.num} ${styles.hideNarrow}`}>
                  라인
                </th>
                <th scope="col" className={styles.hideNarrow}>
                  달성 일시
                </th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, i) => (
                <tr key={row.id} className={row.id === highlight?.id ? styles.mine : undefined}>
                  <td>
                    {i < 3 ? (
                      <span className={`${styles.rankLeaf} ${LEAF_CLASSES[i]}`} title={`${i + 1}위`}>
                        <LeafIcon width={18} height={18} />
                        <span className={styles.srOnly}>{i + 1}위</span>
                      </span>
                    ) : (
                      i + 1
                    )}
                  </td>
                  <td className={styles.nickname}>{row.nickname}</td>
                  <td className={styles.num}>{row.score.toLocaleString()}</td>
                  <td className={styles.num}>{row.level}</td>
                  <td className={`${styles.num} ${styles.hideNarrow}`}>{row.lines_cleared}</td>
                  <td className={`${styles.sub} ${styles.hideNarrow}`}>
                    <time dateTime={row.created_at} title={absolute.format(new Date(row.created_at))}>
                      {formatDate(row.created_at)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.kind === "ok" && highlight && !inList && (
        <p className={styles.myRank}>내 순위: {highlight.rank.toLocaleString()}위</p>
      )}
    </Modal>
  );
}
