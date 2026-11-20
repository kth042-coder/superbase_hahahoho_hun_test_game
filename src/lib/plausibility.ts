import { COLS, ROWS } from "@/game/constants";
import { COMBO_BASE, HARD_DROP_POINTS, LINE_CLEAR_BASE, levelForLines } from "@/game/scoring";

/**
 * PRD 6.3 점수 타당성 검사. 명백한 조작만 걸러내는 관대한 상한 검사다.
 *
 * 상한 계산 근거:
 * - 콤보 상한: 블록 1개는 4칸을 더하고 1줄 클리어는 10칸을 지운다. 매 블록이 줄을 지워야
 *   콤보가 이어지므로 보드(220칸)가 바닥날 때까지 이어질 수 있는 콤보는 220/6 ≈ 37회.
 *   여유를 두어 MAX_COMBO = 40.
 * - 줄당 최대 점수: 싱글 100 + 콤보 50×40 = 2100 (테트리스 줄당 200보다 큼) → 레벨 배율 적용.
 *   줄 k를 지울 때의 레벨은 최대 levelForLines(k-1).
 * - 드롭 점수: 블록 1개당 최대 (전체 높이 × 하드 드롭 2점). 놓을 수 있는 블록 수는
 *   (지운 칸 + 보드 칸) / 4 이하.
 * - 시간: 줄당 최소 0.5초 (상위권 플레이어보다도 빠른 속도).
 */
export const MAX_COMBO = 40;
export const MIN_MS_PER_LINE = 500;

export function maxPlausibleScore(lines: number): number {
  const perLineBase = LINE_CLEAR_BASE[1] + COMBO_BASE * MAX_COMBO;
  let lineScore = 0;
  for (let k = 1; k <= lines; k++) lineScore += perLineBase * levelForLines(k - 1);
  const maxPieces = Math.ceil((lines * COLS + ROWS * COLS) / 4);
  const dropScore = maxPieces * ROWS * HARD_DROP_POINTS;
  return lineScore + dropScore;
}

export type PlausibilityResult = { ok: true } | { ok: false; reason: string };

export function checkPlausibility(input: {
  score: number;
  level: number;
  lines_cleared: number;
  duration_ms: number;
}): PlausibilityResult {
  if (input.level !== levelForLines(input.lines_cleared)) {
    return { ok: false, reason: "level_mismatch" };
  }
  if (input.score > maxPlausibleScore(input.lines_cleared)) {
    return { ok: false, reason: "score_too_high" };
  }
  if (input.duration_ms < input.lines_cleared * MIN_MS_PER_LINE) {
    return { ok: false, reason: "too_fast" };
  }
  return { ok: true };
}
