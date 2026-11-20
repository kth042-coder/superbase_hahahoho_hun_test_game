import { LINES_PER_LEVEL, MAX_LEVEL } from "./constants";

/** 줄 수별 기본 점수 (레벨 배율 적용 전) */
export const LINE_CLEAR_BASE = [0, 100, 300, 500, 800] as const;
export const COMBO_BASE = 50;
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

export function lineClearPoints(lines: number, level: number): number {
  return (LINE_CLEAR_BASE[lines] ?? 0) * level;
}

/** combo: 연속 클리어 횟수 (첫 클리어는 0, 그다음부터 1, 2, ...) */
export function comboPoints(combo: number, level: number): number {
  return combo > 0 ? COMBO_BASE * combo * level : 0;
}

export function levelForLines(lines: number): number {
  return Math.min(MAX_LEVEL, Math.floor(lines / LINES_PER_LEVEL) + 1);
}

/** 한 칸 낙하 시간(초) = (0.8 - (level - 1) × 0.007) ^ (level - 1) */
export function gravitySeconds(level: number): number {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}
