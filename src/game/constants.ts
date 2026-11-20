/** 보드 가로 칸 수 */
export const COLS = 10;
/** 화면에 보이는 세로 줄 수 */
export const VISIBLE_ROWS = 20;
/** 화면에 보이지 않는 상단 버퍼(스폰 영역) 줄 수 */
export const HIDDEN_ROWS = 2;
/** 내부 보드 전체 줄 수 (버퍼 포함) */
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const MAX_LEVEL = 20;
export const LINES_PER_LEVEL = 10;

/** 바닥 접촉 후 고정까지의 시간 (ms) */
export const LOCK_DELAY_MS = 500;
/** 락 딜레이 리셋 최대 횟수 */
export const MAX_LOCK_RESETS = 15;

/** 첫 반복까지 지연 (Delayed Auto Shift, ms) */
export const DAS_MS = 170;
/** 반복 간격 (Auto Repeat Rate, ms) */
export const ARR_MS = 50;
/** 소프트 드롭 시 중력 배율 */
export const SOFT_DROP_FACTOR = 20;

export const NEXT_PREVIEW_COUNT = 3;
