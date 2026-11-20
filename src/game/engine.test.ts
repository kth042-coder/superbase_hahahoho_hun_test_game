import { describe, expect, it } from "vitest";
import { createBag, seededRng } from "./bag";
import { COLS, HIDDEN_ROWS, LOCK_DELAY_MS, ROWS } from "./constants";
import { TetrisEngine } from "./engine";
import { PIECE_TYPES, getCells, pieceToCell } from "./pieces";
import { comboPoints, gravitySeconds, levelForLines, lineClearPoints } from "./scoring";

function newEngine(seed = 1) {
  const e = new TetrisEngine({ rng: seededRng(seed) });
  e.start();
  e.drainEvents();
  return e;
}

/** dt 상한(250ms)에 걸리지 않도록 잘게 나눠 시간을 진행한다 */
function advance(e: TetrisEngine, ms: number) {
  while (ms > 0) {
    const step = Math.min(10, ms);
    e.update(step);
    ms -= step;
  }
}

/** 맨 아래 n줄을 col 열만 비우고 채운다 */
function fillRowsExcept(e: TetrisEngine, n: number, holeCol: number) {
  for (let i = 0; i < n; i++) {
    const y = ROWS - 1 - i;
    for (let x = 0; x < COLS; x++) e.board[y][x] = x === holeCol ? 0 : 1;
  }
}

describe("scoring", () => {
  it("줄 수별 점수 × 레벨", () => {
    expect(lineClearPoints(1, 1)).toBe(100);
    expect(lineClearPoints(2, 1)).toBe(300);
    expect(lineClearPoints(3, 2)).toBe(1000);
    expect(lineClearPoints(4, 3)).toBe(2400);
  });

  it("콤보 점수는 50 × 콤보 × 레벨, 첫 클리어(0)는 0점", () => {
    expect(comboPoints(0, 5)).toBe(0);
    expect(comboPoints(1, 1)).toBe(50);
    expect(comboPoints(3, 2)).toBe(300);
  });

  it("10줄마다 레벨업, 최대 20", () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(9)).toBe(1);
    expect(levelForLines(10)).toBe(2);
    expect(levelForLines(500)).toBe(20);
  });

  it("낙하 속도 공식", () => {
    expect(gravitySeconds(1)).toBe(1);
    expect(gravitySeconds(2)).toBeCloseTo(0.793, 3);
    expect(gravitySeconds(15)).toBeCloseTo(0.0071, 3);
  });
});

describe("7-bag", () => {
  it("한 bag에 7종이 정확히 한 번씩", () => {
    const bag = createBag(seededRng(42));
    expect([...bag].sort()).toEqual([...PIECE_TYPES].sort());
  });

  it("엔진이 내보내는 처음 14개는 두 bag으로 구성", () => {
    const e = new TetrisEngine({ rng: seededRng(7) });
    e.start();
    const seen: string[] = [e.active!.type];
    for (let i = 0; i < 13; i++) {
      e.press("hardDrop");
      // 블록이 쌓이며 게임 오버가 나지 않도록 보드를 비운다
      e.board = e.board.map((row) => row.map(() => 0));
      seen.push(e.active!.type);
    }
    expect([...seen.slice(0, 7)].sort()).toEqual([...PIECE_TYPES].sort());
    expect([...seen.slice(7, 14)].sort()).toEqual([...PIECE_TYPES].sort());
  });
});

describe("회전 (SRS)", () => {
  it("4번 회전하면 원래 모양", () => {
    for (const t of PIECE_TYPES) {
      const e = newEngine();
      e.debugSetActive({ type: t, rotation: 0, x: 3, y: 8 });
      const before = e.absoluteCells(e.active!);
      for (let i = 0; i < 4; i++) e.press("rotateCW");
      expect(e.active!.rotation).toBe(0);
      expect(e.absoluteCells(e.active!)).toEqual(before);
      for (let r = 0; r < 4; r++) expect(getCells(t, r as 0 | 1 | 2 | 3)).toHaveLength(4);
    }
  });

  it("T 블록 시계 방향 회전 모양", () => {
    // R 방향: 세로 막대 + 오른쪽 돌기
    expect(getCells("T", 1)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it("벽에 붙은 I 블록은 월킥으로 회전된다", () => {
    const e = newEngine();
    // 세로(R) 상태 I를 왼쪽 벽에 붙임: R 상태에서 채워진 열은 박스 x+2
    e.debugSetActive({ type: "I", rotation: 1, x: -2, y: 5 });
    expect(e.collides("I", 1, -2, 5)).toBe(false);
    e.press("rotateCCW"); // R → 0, 기본 위치는 벽 밖이므로 킥 필요
    expect(e.active!.rotation).toBe(0);
    for (const c of e.absoluteCells(e.active!)) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(COLS);
    }
  });

  it("T-스핀 자리로 킥되어 들어간다 (바닥 근처 회전)", () => {
    const e = newEngine();
    // 바닥에서 회전 시 위로 밀어올리는 킥이 동작하는지
    e.debugSetActive({ type: "T", rotation: 0, x: 4, y: ROWS - 2 });
    e.press("rotateCW");
    expect(e.active!.rotation).toBe(1);
    for (const c of e.absoluteCells(e.active!)) expect(c.y).toBeLessThan(ROWS);
  });

  it("O 블록은 회전해도 위치가 그대로", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 5 });
    const before = e.absoluteCells(e.active!);
    e.press("rotateCW");
    expect(e.absoluteCells(e.active!).sort((a, b) => a.x - b.x || a.y - b.y)).toEqual(
      before.sort((a, b) => a.x - b.x || a.y - b.y),
    );
  });
});

describe("이동과 드롭", () => {
  it("벽을 넘어 이동하지 않는다", () => {
    const e = newEngine();
    for (let i = 0; i < 20; i++) e.press("left");
    expect(Math.min(...e.absoluteCells(e.active!).map((c) => c.x))).toBe(0);
  });

  it("DAS 이후 ARR 간격으로 자동 이동", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 5 });
    e.press("right"); // 즉시 1칸 → x=5
    expect(e.active!.x).toBe(5);
    e.update(169); // DAS 전
    expect(e.active!.x).toBe(5);
    e.update(1); // DAS 도달 → 1칸
    expect(e.active!.x).toBe(6);
    e.update(50); // ARR → 1칸
    expect(e.active!.x).toBe(7);
    e.release("right");
    e.update(200);
    expect(e.active!.x).toBe(7);
  });

  it("하드 드롭: 이동 칸 × 2점, 즉시 고정", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 0 });
    const ghost = e.ghostY();
    e.press("hardDrop");
    expect(e.score).toBe(ghost * 2);
    expect(e.board[ROWS - 1][4]).toBe(pieceToCell("O"));
    expect(e.board[ROWS - 1][5]).toBe(pieceToCell("O"));
  });

  it("소프트 드롭: 칸당 1점", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 0 });
    e.press("softDrop"); // 즉시 1칸
    expect(e.score).toBe(1);
    e.update(50); // 레벨1 소프트 드롭 간격 = 1000/20 = 50ms → 1칸
    expect(e.score).toBe(2);
    expect(e.active!.y).toBe(2);
  });

  it("중력: 레벨 1에서 1초마다 1칸", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 0 });
    advance(e, 999);
    expect(e.active!.y).toBe(0);
    e.update(1);
    expect(e.active!.y).toBe(1);
  });

  it("락 딜레이 0.5초 후 고정", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: ROWS - 2 });
    advance(e, LOCK_DELAY_MS - 1);
    expect(e.board[ROWS - 1][4]).toBe(0);
    e.update(1);
    expect(e.board[ROWS - 1][4]).toBe(pieceToCell("O"));
  });

  it("바닥에서 이동하면 락 타이머 리셋, 15회 후에는 즉시 고정", () => {
    const e = newEngine();
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: ROWS - 2 });
    for (let i = 0; i < 15; i++) {
      e.update(400);
      e.press(i % 2 === 0 ? "left" : "right");
      e.release(i % 2 === 0 ? "left" : "right");
    }
    // 아직 고정 안 됨 (리셋 15회 사용)
    expect(e.board[ROWS - 1].some((c) => c !== 0)).toBe(false);
    e.update(1);
    expect(e.board[ROWS - 1].some((c) => c !== 0)).toBe(true);
  });
});

describe("라인 클리어와 점수", () => {
  it("I 블록으로 4줄 클리어 = 800 × 레벨 + 하드 드롭 점수", () => {
    const e = newEngine();
    fillRowsExcept(e, 4, 9);
    e.debugSetActive({ type: "I", rotation: 1, x: 7, y: 0 }); // R 상태 채워진 열 = x+2 = 9
    const dist = e.ghostY() - 0;
    e.press("hardDrop");
    const events = e.drainEvents();
    const clear = events.find((ev) => ev.type === "clear");
    expect(clear).toMatchObject({ type: "clear", lines: 4, points: 800 });
    expect(e.score).toBe(800 + dist * 2);
    expect(e.lines).toBe(4);
    expect(e.board[ROWS - 1].every((c) => c === 0)).toBe(true);
  });

  it("연속 클리어 시 콤보 보너스, 클리어 없으면 콤보 초기화", () => {
    const e = newEngine();
    // 1차: 1줄 클리어 (콤보 0)
    fillRowsExcept(e, 1, 0);
    e.debugSetActive({ type: "I", rotation: 1, x: -2, y: 0 });
    e.press("hardDrop");
    expect(e.combo).toBe(0);
    // 2차: 또 1줄 클리어 (콤보 1 → +50)
    e.board = e.board.map((row) => row.map(() => 0));
    fillRowsExcept(e, 1, 0);
    e.debugSetActive({ type: "I", rotation: 1, x: -2, y: 0 });
    const before = e.score;
    const dist = e.ghostY();
    e.press("hardDrop");
    expect(e.combo).toBe(1);
    expect(e.score - before).toBe(100 + 50 + dist * 2);
    // 3차: 클리어 없음 → 콤보 초기화
    e.board = e.board.map((row) => row.map(() => 0));
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 0 });
    e.press("hardDrop");
    expect(e.combo).toBe(-1);
  });

  it("10줄을 지우면 레벨 2", () => {
    const e = newEngine();
    e.lines = 8;
    fillRowsExcept(e, 2, 0);
    e.debugSetActive({ type: "I", rotation: 1, x: -2, y: 0 });
    e.press("hardDrop");
    expect(e.lines).toBe(10);
    expect(e.level).toBe(2);
    expect(e.drainEvents().some((ev) => ev.type === "levelUp")).toBe(true);
  });
});

describe("홀드", () => {
  it("홀드는 블록당 1회, 고정 후 다시 가능", () => {
    const e = newEngine();
    const first = e.active!.type;
    e.press("hold");
    expect(e.hold).toBe(first);
    const second = e.active!.type;
    e.press("hold"); // 무시됨
    expect(e.active!.type).toBe(second);
    e.press("hardDrop");
    expect(e.canHold).toBe(true);
    e.press("hold");
    expect(e.active!.type).toBe(first);
  });
});

describe("게임 오버", () => {
  it("스폰 위치가 막히면 Block Out", () => {
    const e = newEngine();
    // 줄이 가득 차서 지워지지 않도록 가운데만 막는다
    for (let y = 0; y < HIDDEN_ROWS + 1; y++) for (let x = 3; x < 7; x++) e.board[y][x] = 1;
    e.debugSetActive({ type: "O", rotation: 0, x: 0, y: 10 });
    e.press("hardDrop");
    expect(e.status).toBe("over");
  });

  it("블록이 전부 버퍼 영역에서 고정되면 Lock Out", () => {
    const e = newEngine();
    // 보이는 영역 맨 윗줄까지 가운데를 막아 둔다
    for (let y = HIDDEN_ROWS; y < ROWS; y++) e.board[y][4] = e.board[y][5] = 1;
    e.debugSetActive({ type: "O", rotation: 0, x: 4, y: 0 });
    e.press("hardDrop");
    const over = e.drainEvents().find((ev) => ev.type === "gameOver");
    expect(over).toMatchObject({ reason: "lockOut" });
  });

  it("재시작 시 상태 완전 초기화", () => {
    const e = newEngine();
    e.score = 999;
    e.press("hold");
    e.start();
    expect(e.score).toBe(0);
    expect(e.hold).toBeNull();
    expect(e.lines).toBe(0);
    expect(e.status).toBe("playing");
  });

  it("일시정지 중에는 시간이 흐르지 않는다", () => {
    const e = newEngine();
    const y = e.active!.y;
    e.pause();
    e.update(5000);
    expect(e.active!.y).toBe(y);
    expect(e.playTimeMs).toBe(0);
  });
});
