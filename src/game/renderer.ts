import { COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS } from "./constants";
import type { TetrisEngine } from "./engine";
import { PIECE_TYPES, boxSize, cellToPiece, getCells, type PieceType } from "./pieces";

/** CSS 변수(디자인 토큰, PRD 9.9)에서 읽어 온 색상 */
export interface Theme {
  board: string;
  grid: string;
  brand: string;
  pieces: Record<PieceType, { fill: string; edge: string }>;
}

export function readTheme(el: HTMLElement = document.documentElement): Theme {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const pieces = Object.fromEntries(
    PIECE_TYPES.map((t) => {
      const k = t.toLowerCase();
      return [t, { fill: v(`--piece-${k}`, "#888"), edge: v(`--piece-${k}-edge`, "#555") }];
    }),
  ) as Theme["pieces"];
  return { board: v("--color-board", "#fbfaf5"), grid: v("--color-grid", "#e2dfd2"), brand: v("--color-brand", "#8dc63f"), pieces };
}

export interface RenderOptions {
  patternMode: boolean;
  reducedMotion: boolean;
}

// ───────────────────────── 셀 그리기 ─────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 색약 대응 패턴 (PRD 9.3) — 블록마다 다른 무늬 */
function drawPattern(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, s: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(1, s * 0.08);
  const c = s / 2;
  const p = s * 0.28;
  ctx.beginPath();
  switch (type) {
    case "I": // 가로줄
      ctx.moveTo(x + p, y + c);
      ctx.lineTo(x + s - p, y + c);
      ctx.stroke();
      break;
    case "O": // 원
      ctx.arc(x + c, y + c, s * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "T": // 점
      ctx.arc(x + c, y + c, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "S": // 사선 /
      ctx.moveTo(x + p, y + s - p);
      ctx.lineTo(x + s - p, y + p);
      ctx.stroke();
      break;
    case "Z": // 사선 \
      ctx.moveTo(x + p, y + p);
      ctx.lineTo(x + s - p, y + s - p);
      ctx.stroke();
      break;
    case "J": // 세로줄
      ctx.moveTo(x + c, y + p);
      ctx.lineTo(x + c, y + s - p);
      ctx.stroke();
      break;
    case "L": // 십자
      ctx.moveTo(x + p, y + c);
      ctx.lineTo(x + s - p, y + c);
      ctx.moveTo(x + c, y + p);
      ctx.lineTo(x + c, y + s - p);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** 채움 색 + 1px 진한 테두리 + 상단 하이라이트, 모서리 3px (PRD 9.3) */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  type: PieceType,
  x: number,
  y: number,
  size: number,
  patternMode: boolean,
) {
  const { fill, edge } = theme.pieces[type];
  const inset = 1;
  const s = size - inset * 2;
  const px = x + inset;
  const py = y + inset;
  const r = Math.min(3, s / 4);
  roundRect(ctx, px, py, s, s, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = edge;
  ctx.stroke();
  // 상단 2px 하이라이트
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  roundRect(ctx, px + 1, py + 1, s - 2, Math.max(2, size * 0.08), r);
  ctx.fill();
  if (patternMode) drawPattern(ctx, type, px, py, s);
}

function drawGhostCell(ctx: CanvasRenderingContext2D, theme: Theme, type: PieceType, x: number, y: number, size: number) {
  const { fill, edge } = theme.pieces[type];
  const s = size - 4;
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, s, s);
  ctx.globalAlpha = 1;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = edge;
  roundRect(ctx, x + 2, y + 2, s, s, 3);
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────── 이펙트 ─────────────────────────

interface Flash {
  rows: number[]; // 화면 기준 줄 인덱스 (0 = 보이는 맨 윗줄)
  age: number;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

const FLASH_MS = 220;

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 24;
  private flashes: Flash[] = [];
  private leaves: Leaf[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private theme: Theme,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D를 사용할 수 없습니다.");
    this.ctx = ctx;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
  }

  /** 컨테이너 크기에 맞춰 셀 크기를 정하고 devicePixelRatio를 반영한다. */
  resize(maxWidth: number, maxHeight: number): { width: number; height: number } {
    this.cell = Math.max(10, Math.floor(Math.min(maxWidth / COLS, maxHeight / VISIBLE_ROWS)));
    const width = this.cell * COLS;
    const height = this.cell * VISIBLE_ROWS;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  /** 라인 클리어 연출: 반짝임 + 잎사귀 파티클 (PRD 9.7) */
  addLineClear(rows: number[], reducedMotion: boolean) {
    const visibleRows = rows.map((r) => r - HIDDEN_ROWS).filter((r) => r >= 0);
    this.flashes.push({ rows: visibleRows, age: 0 });
    if (reducedMotion) return;
    const colors = [this.theme.brand, this.theme.pieces.T.fill, "#b7d47f"];
    const count = 3 + Math.min(2, rows.length - 1);
    for (const r of visibleRows) {
      for (let i = 0; i < count; i++) {
        this.leaves.push({
          x: Math.random() * COLS * this.cell,
          y: (r + 0.5) * this.cell,
          vx: (Math.random() - 0.5) * 0.12,
          vy: -0.05 - Math.random() * 0.1,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.01,
          age: 0,
          life: 700 + Math.random() * 300,
          size: this.cell * (0.35 + Math.random() * 0.2),
          color: colors[i % colors.length],
        });
      }
    }
  }

  clearEffects() {
    this.flashes = [];
    this.leaves = [];
  }

  render(engine: TetrisEngine, dt: number, opts: RenderOptions) {
    const { ctx, cell, theme } = this;
    const w = cell * COLS;
    const h = cell * VISIBLE_ROWS;

    ctx.fillStyle = theme.board;
    ctx.fillRect(0, 0, w, h);

    // 격자
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, h);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(w, y * cell + 0.5);
    }
    ctx.stroke();

    // 고정된 블록
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = cellToPiece(engine.board[y][x]);
        if (t) drawCell(ctx, theme, t, x * cell, (y - HIDDEN_ROWS) * cell, cell, opts.patternMode);
      }
    }

    const p = engine.active;
    if (p && engine.status !== "over") {
      // 고스트
      const gy = engine.ghostY();
      if (gy !== p.y) {
        for (const c of getCells(p.type, p.rotation)) {
          const y = gy + c.y - HIDDEN_ROWS;
          if (y >= 0) drawGhostCell(ctx, theme, p.type, (p.x + c.x) * cell, y * cell, cell);
        }
      }
      // 현재 블록
      for (const c of engine.absoluteCells(p)) {
        const y = c.y - HIDDEN_ROWS;
        if (y >= 0) drawCell(ctx, theme, p.type, c.x * cell, y * cell, cell, opts.patternMode);
      }
    }

    this.renderEffects(dt);
  }

  private renderEffects(dt: number) {
    const { ctx, cell } = this;
    const w = cell * COLS;
    this.flashes = this.flashes.filter((f) => (f.age += dt) < FLASH_MS);
    for (const f of this.flashes) {
      const a = 1 - f.age / FLASH_MS;
      ctx.fillStyle = this.theme.brand;
      ctx.globalAlpha = 0.7 * a;
      for (const r of f.rows) ctx.fillRect(0, r * cell, w, cell);
      ctx.globalAlpha = 1;
    }

    this.leaves = this.leaves.filter((l) => (l.age += dt) < l.life);
    for (const l of this.leaves) {
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.vy += 0.0002 * dt; // 살짝 떨어지는 중력
      l.rot += l.vr * dt;
      ctx.save();
      ctx.globalAlpha = 1 - l.age / l.life;
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      // 잎사귀 모양
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(0, -l.size / 2);
      ctx.quadraticCurveTo(l.size / 2, 0, 0, l.size / 2);
      ctx.quadraticCurveTo(-l.size / 2, 0, 0, -l.size / 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -l.size / 2.5);
      ctx.lineTo(0, l.size / 2.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** HOLD/NEXT 미리보기용 작은 캔버스에 블록 하나를 가운데 정렬해 그린다. */
export function drawPreview(
  canvas: HTMLCanvasElement,
  theme: Theme,
  type: PieceType | null,
  opts: { patternMode: boolean; dimmed?: boolean },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 80;
  const cssH = canvas.clientHeight || 48;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!type) return;
  const cells = getCells(type, 0);
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y));
  const wCells = maxX - minX + 1;
  const hCells = maxY - minY + 1;
  const size = Math.floor(Math.min(cssW / Math.max(4, boxSize(type)), cssH / 2.5));
  const ox = (cssW - wCells * size) / 2;
  const oy = (cssH - hCells * size) / 2;
  ctx.globalAlpha = opts.dimmed ? 0.35 : 1;
  for (const c of cells) {
    drawCell(ctx, theme, type, ox + (c.x - minX) * size, oy + (c.y - minY) * size, size, opts.patternMode);
  }
  ctx.globalAlpha = 1;
}
