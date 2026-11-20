import { createBag, type Rng } from "./bag";
import {
  ARR_MS,
  COLS,
  DAS_MS,
  HIDDEN_ROWS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  NEXT_PREVIEW_COUNT,
  ROWS,
  SOFT_DROP_FACTOR,
} from "./constants";
import {
  getCells,
  getKicks,
  pieceToCell,
  spawnX,
  type Cell,
  type Offset,
  type PieceType,
  type Rotation,
} from "./pieces";
import {
  HARD_DROP_POINTS,
  SOFT_DROP_POINTS,
  comboPoints,
  gravitySeconds,
  levelForLines,
  lineClearPoints,
} from "./scoring";

export type GameStatus = "ready" | "playing" | "paused" | "over";

export type Action = "left" | "right" | "softDrop" | "hardDrop" | "rotateCW" | "rotateCCW" | "hold";

export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export type GameEvent =
  | { type: "move" }
  | { type: "rotate" }
  | { type: "hold" }
  | { type: "hardDrop"; distance: number }
  | { type: "lock" }
  | { type: "clear"; lines: number; rows: number[]; combo: number; points: number }
  | { type: "levelUp"; level: number }
  | { type: "gameOver"; reason: "blockOut" | "lockOut" };

export interface EngineOptions {
  rng?: Rng;
}

/**
 * 테트리스 게임 로직. DOM/렌더링과 분리되어 있으며 update(dt)로 시간을 진행한다.
 * 좌표계: x는 오른쪽(+), y는 아래쪽(+). y < HIDDEN_ROWS 인 줄은 화면에 보이지 않는 버퍼.
 */
export class TetrisEngine {
  board: Cell[][] = [];
  active: ActivePiece | null = null;
  hold: PieceType | null = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  /** 연속 클리어 카운트. 클리어가 없으면 -1 */
  combo = -1;
  status: GameStatus = "ready";
  /** 일시정지 시간을 제외한 실제 플레이 시간 (ms) */
  playTimeMs = 0;

  private queue: PieceType[] = [];
  private rng: Rng;
  private events: GameEvent[] = [];

  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;

  private softDropHeld = false;
  private heldDirs: (-1 | 1)[] = [];
  private dasTimer = 0;
  private arrMoves = 0;

  constructor(options: EngineOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.reset();
  }

  // ───────────────────────── 상태 제어 ─────────────────────────

  reset(): void {
    this.board = Array.from({ length: ROWS }, () => new Array<Cell>(COLS).fill(0));
    this.active = null;
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.status = "ready";
    this.playTimeMs = 0;
    this.queue = [];
    this.events = [];
    this.gravityAcc = 0;
    this.resetLockState();
    this.clearInput();
    this.fillQueue();
  }

  start(): void {
    this.reset();
    this.status = "playing";
    this.spawn(this.takeNext());
  }

  pause(): void {
    if (this.status === "playing") {
      this.status = "paused";
      this.clearInput();
    }
  }

  resume(): void {
    if (this.status === "paused") this.status = "playing";
  }

  togglePause(): void {
    if (this.status === "playing") this.pause();
    else this.resume();
  }

  /** 렌더/사운드용 이벤트를 꺼내고 비운다. */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get nextPieces(): PieceType[] {
    return this.queue.slice(0, NEXT_PREVIEW_COUNT);
  }

  // ───────────────────────── 입력 ─────────────────────────

  press(action: Action): void {
    if (this.status !== "playing" || !this.active) return;
    switch (action) {
      case "left":
      case "right": {
        const dir = action === "left" ? -1 : 1;
        this.heldDirs = this.heldDirs.filter((d) => d !== dir);
        this.heldDirs.push(dir);
        this.dasTimer = 0;
        this.arrMoves = 0;
        this.shift(dir);
        break;
      }
      case "softDrop":
        this.softDropHeld = true;
        this.gravityAcc = 0;
        // 누르는 즉시 한 칸 내려 반응성을 높인다
        if (this.tryMove(0, 1)) this.score += SOFT_DROP_POINTS;
        break;
      case "hardDrop":
        this.hardDrop();
        break;
      case "rotateCW":
        this.rotate(1);
        break;
      case "rotateCCW":
        this.rotate(-1);
        break;
      case "hold":
        this.holdPiece();
        break;
    }
  }

  release(action: Action): void {
    if (action === "left" || action === "right") {
      const dir = action === "left" ? -1 : 1;
      this.heldDirs = this.heldDirs.filter((d) => d !== dir);
      this.dasTimer = 0;
      this.arrMoves = 0;
    } else if (action === "softDrop") {
      this.softDropHeld = false;
    }
  }

  private clearInput(): void {
    this.softDropHeld = false;
    this.heldDirs = [];
    this.dasTimer = 0;
    this.arrMoves = 0;
  }

  // ───────────────────────── 시간 진행 ─────────────────────────

  update(dtMs: number): void {
    if (this.status !== "playing" || !this.active) return;
    // 탭 복귀 등으로 dt가 비정상적으로 크면 잘라낸다
    const dt = Math.min(dtMs, 250);
    this.playTimeMs += dt;

    this.updateAutoShift(dt);
    if (!this.active) return;
    this.updateGravity(dt);
    if (!this.active) return;
    this.updateLock(dt);
  }

  private updateAutoShift(dt: number): void {
    const dir = this.heldDirs[this.heldDirs.length - 1];
    if (dir === undefined) return;
    this.dasTimer += dt;
    const charged = this.dasTimer - DAS_MS;
    if (charged < 0) return;
    const target = Math.floor(charged / ARR_MS) + 1;
    // 한 프레임에 보드 너비 이상 이동할 필요는 없다
    let steps = Math.min(target - this.arrMoves, COLS);
    this.arrMoves = target;
    while (steps-- > 0 && this.shift(dir)) {
      /* 이동 반복 */
    }
  }

  private updateGravity(dt: number): void {
    const g = gravitySeconds(this.level) * 1000;
    const interval = this.softDropHeld ? g / SOFT_DROP_FACTOR : g;
    this.gravityAcc += dt;
    let guard = ROWS;
    while (this.gravityAcc >= interval && guard-- > 0) {
      this.gravityAcc -= interval;
      if (this.tryMove(0, 1)) {
        if (this.softDropHeld) this.score += SOFT_DROP_POINTS;
      } else {
        this.gravityAcc = 0;
        break;
      }
    }
  }

  private updateLock(dt: number): void {
    if (!this.active) return;
    if (this.isGrounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS || this.lockResets >= MAX_LOCK_RESETS) {
        this.lockPiece();
      }
    } else {
      this.lockTimer = 0;
    }
  }

  // ───────────────────────── 조작 ─────────────────────────

  private shift(dir: -1 | 1): boolean {
    if (this.tryMove(dir, 0)) {
      this.onSuccessfulManipulation();
      this.events.push({ type: "move" });
      return true;
    }
    return false;
  }

  private rotate(dir: 1 | -1): void {
    const p = this.active;
    if (!p) return;
    const to = (((p.rotation + dir) % 4) + 4) % 4 as Rotation;
    for (const kick of getKicks(p.type, p.rotation, to)) {
      const nx = p.x + kick.x;
      const ny = p.y + kick.y;
      if (!this.collides(p.type, to, nx, ny)) {
        p.x = nx;
        p.y = ny;
        p.rotation = to;
        this.updateLowest();
        this.onSuccessfulManipulation();
        this.events.push({ type: "rotate" });
        return;
      }
    }
  }

  private hardDrop(): void {
    const p = this.active;
    if (!p) return;
    const distance = this.ghostY() - p.y;
    p.y += distance;
    this.score += distance * HARD_DROP_POINTS;
    this.events.push({ type: "hardDrop", distance });
    this.lockPiece();
  }

  private holdPiece(): void {
    if (!this.canHold || !this.active) return;
    const current = this.active.type;
    const next = this.hold ?? this.takeNext();
    this.hold = current;
    this.canHold = false;
    this.events.push({ type: "hold" });
    this.spawn(next);
  }

  /** 바닥에 닿은 상태에서 이동/회전에 성공하면 락 타이머를 리셋한다 (최대 횟수 제한). */
  private onSuccessfulManipulation(): void {
    if (this.lockTimer > 0 || this.isGrounded()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  }

  // ───────────────────────── 고정 / 클리어 / 스폰 ─────────────────────────

  private lockPiece(): void {
    const p = this.active;
    if (!p) return;
    const cells = this.absoluteCells(p);
    const value = pieceToCell(p.type);
    for (const c of cells) this.board[c.y][c.x] = value;
    this.active = null;
    this.events.push({ type: "lock" });

    // Lock Out: 블록 전체가 보이지 않는 버퍼 영역에 고정됨
    if (cells.every((c) => c.y < HIDDEN_ROWS)) {
      this.gameOver("lockOut");
      return;
    }

    const cleared = this.clearLines();
    if (cleared.length > 0) {
      this.combo++;
      const levelBefore = this.level;
      const points = lineClearPoints(cleared.length, levelBefore) + comboPoints(this.combo, levelBefore);
      this.score += points;
      this.lines += cleared.length;
      this.level = levelForLines(this.lines);
      this.events.push({ type: "clear", lines: cleared.length, rows: cleared, combo: this.combo, points });
      if (this.level > levelBefore) this.events.push({ type: "levelUp", level: this.level });
    } else {
      this.combo = -1;
    }

    this.canHold = true;
    this.spawn(this.takeNext());
  }

  /** 가득 찬 줄을 지우고, 지운 줄의 (지우기 전) y 인덱스 목록을 반환한다. */
  private clearLines(): number[] {
    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((c) => c !== 0)) full.push(y);
    }
    if (full.length === 0) return full;
    const kept = this.board.filter((_, y) => !full.includes(y));
    const empty = Array.from({ length: full.length }, () => new Array<Cell>(COLS).fill(0));
    this.board = [...empty, ...kept];
    return full;
  }

  private spawn(type: PieceType): void {
    const piece: ActivePiece = { type, rotation: 0, x: spawnX(type), y: 0 };
    this.resetLockState();
    this.gravityAcc = 0;
    // Block Out: 스폰 위치가 이미 막혀 있음
    if (this.collides(piece.type, piece.rotation, piece.x, piece.y)) {
      this.active = null;
      this.gameOver("blockOut");
      return;
    }
    this.active = piece;
    // 가이드라인처럼 스폰 직후 가능하면 한 칸 내려 화면에 보이게 한다
    this.tryMove(0, 1);
    this.lowestY = piece.y;
  }

  private gameOver(reason: "blockOut" | "lockOut"): void {
    this.status = "over";
    this.clearInput();
    this.events.push({ type: "gameOver", reason });
  }

  private takeNext(): PieceType {
    const next = this.queue.shift()!;
    this.fillQueue();
    return next;
  }

  private fillQueue(): void {
    while (this.queue.length < NEXT_PREVIEW_COUNT + 1) {
      this.queue.push(...createBag(this.rng));
    }
  }

  private resetLockState(): void {
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
  }

  // ───────────────────────── 충돌 / 좌표 ─────────────────────────

  private tryMove(dx: number, dy: number): boolean {
    const p = this.active;
    if (!p || this.collides(p.type, p.rotation, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    if (dy > 0) this.updateLowest();
    return true;
  }

  /** 지금까지보다 더 낮은 줄에 도달하면 락 리셋 횟수를 초기화한다. */
  private updateLowest(): void {
    const p = this.active;
    if (p && p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
    }
  }

  private isGrounded(): boolean {
    const p = this.active;
    return !!p && this.collides(p.type, p.rotation, p.x, p.y + 1);
  }

  collides(type: PieceType, rotation: Rotation, x: number, y: number): boolean {
    for (const c of getCells(type, rotation)) {
      const bx = x + c.x;
      const by = y + c.y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && this.board[by][bx] !== 0) return true;
    }
    return false;
  }

  absoluteCells(p: ActivePiece): Offset[] {
    return getCells(p.type, p.rotation).map((c) => ({ x: p.x + c.x, y: p.y + c.y }));
  }

  /** 하드 드롭 시 착지할 y */
  ghostY(): number {
    const p = this.active;
    if (!p) return 0;
    let y = p.y;
    while (!this.collides(p.type, p.rotation, p.x, y + 1)) y++;
    return y;
  }

  // ───────────────────────── 테스트 보조 ─────────────────────────

  /** 테스트용: 현재 블록을 지정한 블록으로 교체 */
  debugSetActive(piece: ActivePiece): void {
    this.active = { ...piece };
    this.resetLockState();
    this.lowestY = piece.y;
  }

  /** 테스트용: 다음에 나올 블록 순서를 앞에 끼워 넣음 */
  debugPushQueueFront(...types: PieceType[]): void {
    this.queue.unshift(...types);
  }
}
