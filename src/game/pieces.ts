export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
/** 0: 스폰, 1: 오른쪽(R), 2: 180도, 3: 왼쪽(L) */
export type Rotation = 0 | 1 | 2 | 3;

export const PIECE_TYPES: readonly PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

/** 보드 셀 값: 0은 빈칸, 1~7은 PIECE_TYPES 인덱스 + 1 */
export type Cell = number;

export function pieceToCell(type: PieceType): Cell {
  return PIECE_TYPES.indexOf(type) + 1;
}

export function cellToPiece(cell: Cell): PieceType | null {
  return cell > 0 ? PIECE_TYPES[cell - 1] : null;
}

type Matrix = number[][];

/** SRS 기준 스폰 방향(0) 모양 */
const BASE_SHAPES: Record<PieceType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateCW(m: Matrix): Matrix {
  const n = m.length;
  return m.map((_, r) => m.map((__, c) => m[n - 1 - c][r]));
}

export interface Offset {
  x: number;
  y: number;
}

/** [type][rotation] → 바운딩 박스 내 채워진 칸 좌표 목록 */
const SHAPE_CELLS: Record<PieceType, Offset[][]> = Object.fromEntries(
  PIECE_TYPES.map((type) => {
    const rotations: Offset[][] = [];
    let m = BASE_SHAPES[type];
    for (let r = 0; r < 4; r++) {
      const cells: Offset[] = [];
      m.forEach((row, y) => row.forEach((v, x) => v && cells.push({ x, y })));
      rotations.push(cells);
      m = rotateCW(m);
    }
    return [type, rotations];
  }),
) as Record<PieceType, Offset[][]>;

export function getCells(type: PieceType, rotation: Rotation): Offset[] {
  return SHAPE_CELLS[type][rotation];
}

export function boxSize(type: PieceType): number {
  return BASE_SHAPES[type].length;
}

/** 스폰 x 위치 (보드 가운데 정렬) */
export function spawnX(type: PieceType): number {
  return type === "O" ? 4 : 3;
}

/*
 * SRS 월킥 테이블. 원본 표는 y가 위쪽(+)이지만 보드는 y가 아래쪽(+)이므로
 * 아래 값은 원본의 y 부호를 뒤집어 저장했다.
 * 키: `${from}${to}`
 */
type KickTable = Record<string, readonly Offset[]>;

const k = (pairs: [number, number][]): Offset[] => pairs.map(([x, y]) => ({ x, y: -y }));

const JLSTZ_KICKS: KickTable = {
  "01": k([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "10": k([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "12": k([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "21": k([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "23": k([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
  "32": k([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "30": k([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "03": k([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
};

const I_KICKS: KickTable = {
  "01": k([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "10": k([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "12": k([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
  "21": k([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "23": k([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "32": k([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "30": k([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "03": k([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
};

const NO_KICK: readonly Offset[] = [{ x: 0, y: 0 }];

export function getKicks(type: PieceType, from: Rotation, to: Rotation): readonly Offset[] {
  if (type === "O") return NO_KICK;
  const table = type === "I" ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}${to}`] ?? NO_KICK;
}
