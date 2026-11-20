"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { SITE } from "@/config";
import { TetrisEngine, type Action, type GameStatus } from "@/game/engine";
import type { PieceType } from "@/game/pieces";
import { BoardRenderer, drawPreview, readTheme, type Theme } from "@/game/renderer";
import { dismissRecovery, initAuth, useAuth } from "@/lib/auth";
import { sound, type SoundName } from "@/lib/sound";
import { loadBool, loadNumber, saveBool, saveString } from "@/lib/storage";
import dynamic from "next/dynamic";
import type { GameResult } from "./GameOverModal";

// 모달은 필요할 때 불러와 초기 번들(zod, supabase-js 등)을 줄인다 (PRD 4: JS gzip 200KB 이하)
const GameOverModal = dynamic(() => import("./GameOverModal").then((m) => m.GameOverModal), { ssr: false });
const LeaderboardModal = dynamic(() => import("./LeaderboardModal").then((m) => m.LeaderboardModal), { ssr: false });
const FeedbackModal = dynamic(() => import("./FeedbackModal").then((m) => m.FeedbackModal), { ssr: false });
const AuthModal = dynamic(() => import("./AuthModals").then((m) => m.AuthModal), { ssr: false });
const AccountModal = dynamic(() => import("./AuthModals").then((m) => m.AccountModal), { ssr: false });
const ResetPasswordModal = dynamic(() => import("./AuthModals").then((m) => m.ResetPasswordModal), { ssr: false });
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  HardDropIcon,
  HoldIcon,
  MessageIcon,
  MuteIcon,
  PatternIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SproutIcon,
  TrophyIcon,
  UserIcon,
  VolumeIcon,
} from "./icons";
import styles from "./TetrisApp.module.css";
import ui from "./ui.module.css";

/** UI(React)로 내보내는 엔진 상태. 매 프레임이 아니라 값이 바뀔 때만 갱신한다. */
interface Snapshot {
  status: GameStatus;
  score: number;
  level: number;
  lines: number;
  hold: PieceType | null;
  canHold: boolean;
  next: PieceType[];
}

function takeSnapshot(e: TetrisEngine): Snapshot {
  return { status: e.status, score: e.score, level: e.level, lines: e.lines, hold: e.hold, canHold: e.canHold, next: e.nextPieces };
}

function sameSnapshot(a: Snapshot, b: Snapshot) {
  return (
    a.status === b.status &&
    a.score === b.score &&
    a.level === b.level &&
    a.lines === b.lines &&
    a.hold === b.hold &&
    a.canHold === b.canHold &&
    a.next.join() === b.next.join()
  );
}

type ModalState =
  | { kind: "none" }
  | { kind: "gameOver"; result: GameResult }
  | { kind: "leaderboard"; highlight?: { id: string; rank: number }; back?: GameResult }
  | { kind: "feedback" }
  /** back: 게임 오버 화면에서 로그인하러 온 경우, 로그인 후 그 결과 화면으로 돌아간다 */
  | { kind: "auth"; view?: "signIn" | "signUp"; back?: GameResult }
  | { kind: "account" };

interface Toast {
  id: number;
  text: string;
  icon?: "sprout";
}

const KEY_MAP: Record<string, Action> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "softDrop",
  Space: "hardDrop",
  ArrowUp: "rotateCW",
  KeyX: "rotateCW",
  KeyZ: "rotateCCW",
  KeyC: "hold",
  ShiftLeft: "hold",
  ShiftRight: "hold",
};

const EVENT_SOUND: Partial<Record<string, SoundName>> = {
  move: "move",
  rotate: "rotate",
  hold: "hold",
  hardDrop: "hardDrop",
  lock: "lock",
};

export function TetrisApp() {
  const engineRef = useRef<TetrisEngine | null>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const themeRef = useRef<Theme | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const modalOpenRef = useRef(false);
  const optionsRef = useRef({ patternMode: false, reducedMotion: false });

  const [snap, setSnap] = useState<Snapshot>({
    status: "ready",
    score: 0,
    level: 1,
    lines: 0,
    hold: null,
    canHold: true,
    next: [],
  });
  const snapRef = useRef(snap);
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [patternMode, setPatternMode] = useState(false);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ───────── 초기화 (localStorage 값 복원) ─────────
  useEffect(() => {
    const storedBest = loadNumber("best");
    const storedMuted = loadBool("muted");
    const storedPattern = loadBool("pattern");
    bestRef.current = storedBest;
    sound.muted = storedMuted;
    optionsRef.current.patternMode = storedPattern;
    // 서버 렌더와의 불일치를 피하려고 마운트 후에 복원한다
    /* eslint-disable react-hooks/set-state-in-effect */
    setBest(storedBest);
    setMuted(storedMuted);
    setPatternMode(storedPattern);
    /* eslint-enable react-hooks/set-state-in-effect */

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    optionsRef.current.reducedMotion = mq.matches;
    const onMq = () => (optionsRef.current.reducedMotion = mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  // 로그인 세션 복원 (supabase-js는 첫 화면 이후 비동기로 불러온다)
  const auth = useAuth();
  useEffect(() => {
    void initAuth();
  }, []);

  useEffect(() => {
    modalOpenRef.current = modal.kind !== "none" || auth.recovery;
  }, [modal, auth.recovery]);

  // 비밀번호 재설정 링크로 들어오면 게임을 멈춘다
  useEffect(() => {
    if (auth.recovery) engineRef.current?.pause();
  }, [auth.recovery]);

  const showToast = useCallback((text: string, icon?: Toast["icon"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, icon }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 900);
  }, []);

  // ───────── 게임 루프 ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = boardWrapRef.current;
    if (!canvas || !wrap) return;
    const engine = new TetrisEngine();
    engineRef.current = engine;
    const theme = readTheme();
    themeRef.current = theme;
    const renderer = new BoardRenderer(canvas, theme);
    rendererRef.current = renderer;

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      renderer.resize(r.width, r.height);
    });
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      engine.update(dt);

      for (const ev of engine.drainEvents()) {
        const s = EVENT_SOUND[ev.type];
        if (s) sound.play(s);
        if (ev.type === "clear") {
          sound.play(ev.lines === 4 ? "tetris" : "clear");
          renderer.addLineClear(ev.rows, optionsRef.current.reducedMotion);
          if (ev.lines === 4) showToast("신선한 한 판!");
          else if (ev.combo >= 2) showToast(`${ev.combo} 콤보!`);
        } else if (ev.type === "levelUp") {
          sound.play("levelUp");
          showToast("한 단계 성장!", "sprout");
        } else if (ev.type === "gameOver") {
          sound.play("gameOver");
          const isNewBest = engine.score > bestRef.current;
          if (isNewBest) {
            bestRef.current = engine.score;
            setBest(engine.score);
            saveString("best", String(engine.score));
          }
          setModal({
            kind: "gameOver",
            result: { score: engine.score, level: engine.level, lines: engine.lines, durationMs: engine.playTimeMs, isNewBest },
          });
        }
      }

      renderer.render(engine, dt, optionsRef.current);

      const next = takeSnapshot(engine);
      if (!sameSnapshot(next, snapRef.current)) {
        snapRef.current = next;
        setSnap(next);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [showToast]);

  // ───────── 조작 ─────────
  const startGame = useCallback(() => {
    sound.unlock();
    rendererRef.current?.clearEffects();
    engineRef.current?.start();
    setModal({ kind: "none" });
    canvasRef.current?.focus();
  }, []);

  const togglePause = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    sound.unlock();
    e.togglePause();
  }, []);

  const press = useCallback((a: Action) => {
    sound.unlock();
    engineRef.current?.press(a);
  }, []);
  const release = useCallback((a: Action) => engineRef.current?.release(a), []);

  /** 모달이 열리면 게임 자동 일시정지 */
  const openModal = useCallback((m: ModalState) => {
    engineRef.current?.pause();
    setModal(m);
  }, []);

  // 키보드
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onDown = (e: KeyboardEvent) => {
      if (modalOpenRef.current || isTyping(e.target)) return;
      const engine = engineRef.current;
      if (!engine) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        if (engine.status === "playing" || engine.status === "paused") togglePause();
        return;
      }
      if (e.code === "Enter" && (engine.status === "ready" || engine.status === "over")) {
        e.preventDefault();
        startGame();
        return;
      }
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return; // 키 반복은 엔진의 DAS/ARR이 처리
      press(action);
    };
    const onUp = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (action) release(action);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [press, release, startGame, togglePause]);

  // 탭 전환/포커스 이탈 시 자동 일시정지
  useEffect(() => {
    const pause = () => engineRef.current?.pause();
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  // HOLD / NEXT 미리보기 다시 그리기
  const holdCanvasRef = useRef<HTMLCanvasElement>(null);
  const holdMiniRef = useRef<HTMLCanvasElement>(null);
  const nextCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const nextMiniRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const theme = themeRef.current;
    if (!theme) return;
    const opts = { patternMode };
    for (const c of [holdCanvasRef.current, holdMiniRef.current]) {
      if (c) drawPreview(c, theme, snap.hold, { ...opts, dimmed: !snap.canHold });
    }
    nextCanvasRefs.current.forEach((c, i) => c && drawPreview(c, theme, snap.next[i] ?? null, opts));
    if (nextMiniRef.current) drawPreview(nextMiniRef.current, theme, snap.next[0] ?? null, opts);
  }, [snap.hold, snap.canHold, snap.next, patternMode]);

  const toggleMute = () => {
    sound.unlock();
    const m = !muted;
    sound.muted = m;
    setMuted(m);
    saveBool("muted", m);
  };

  const togglePattern = () => {
    const p = !patternMode;
    optionsRef.current.patternMode = p;
    setPatternMode(p);
    saveBool("pattern", p);
  };

  const closeModal = () => {
    if ((modal.kind === "leaderboard" || modal.kind === "auth") && modal.back) {
      setModal({ kind: "gameOver", result: modal.back });
    } else {
      setModal({ kind: "none" });
    }
  };

  const onSignedIn = useCallback(() => {
    setModal((m) => (m.kind === "auth" && m.back ? { kind: "gameOver", result: m.back } : { kind: "none" }));
  }, []);

  const { status } = snap;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <SproutIcon className={styles.brandIcon} />
          <div>
            <h1 className={styles.title}>{SITE.title}</h1>
            <p className={styles.tagline}>{SITE.tagline}</p>
          </div>
        </div>
        <nav className={styles.headerActions} aria-label="게임 메뉴">
          <HeaderButton label={muted ? "소리 켜기" : "소리 끄기"} pressed={muted} onClick={toggleMute}>
            {muted ? <MuteIcon /> : <VolumeIcon />}
          </HeaderButton>
          <HeaderButton label="패턴 모드 (색약 대응)" pressed={patternMode} onClick={togglePattern}>
            <PatternIcon />
          </HeaderButton>
          <HeaderButton label="의견 보내기" onClick={() => openModal({ kind: "feedback" })}>
            <MessageIcon />
          </HeaderButton>
          <HeaderButton label="리더보드" onClick={() => openModal({ kind: "leaderboard" })}>
            <TrophyIcon />
          </HeaderButton>
          {auth.status !== "unavailable" && (
            <button
              type="button"
              className={styles.accountButton}
              onClick={() => openModal(auth.status === "user" ? { kind: "account" } : { kind: "auth" })}
              disabled={auth.status === "loading"}
              aria-label={auth.status === "user" ? `내 계정 (${auth.nickname ?? ""})` : "로그인 또는 회원가입"}
            >
              <UserIcon width={20} height={20} />
              <span className={styles.accountLabel}>
                {auth.status === "user" ? (auth.nickname ?? "내 계정") : "로그인"}
              </span>
            </button>
          )}
        </nav>
      </header>

      <main className={styles.main}>
        {/* 모바일 상단 바 */}
        <div className={styles.mobileBar}>
          <div className={styles.miniCard}>
            <span className={styles.cardLabel}>HOLD</span>
            <canvas ref={holdMiniRef} className={styles.miniPreview} />
          </div>
          <div className={styles.miniStats}>
            <Stat label="점수" value={snap.score} big />
            <div className={styles.miniStatsRow}>
              <Stat label="레벨" value={snap.level} />
              <Stat label="라인" value={snap.lines} />
            </div>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.cardLabel}>NEXT</span>
            <canvas ref={nextMiniRef} className={styles.miniPreview} />
          </div>
          <button
            type="button"
            className={styles.mobilePause}
            onClick={togglePause}
            aria-label={status === "paused" ? "계속하기" : "일시정지"}
            disabled={status !== "playing" && status !== "paused"}
          >
            {status === "paused" ? <PlayIcon /> : <PauseIcon />}
          </button>
        </div>

        <aside className={styles.leftCol}>
          <section className={styles.card} aria-label="홀드">
            <h2 className={styles.cardLabel}>HOLD</h2>
            <canvas ref={holdCanvasRef} className={styles.preview} />
          </section>
          <section className={styles.card} aria-label="기록">
            <Stat label="점수" value={snap.score} big />
            <Stat label="레벨" value={snap.level} />
            <Stat label="라인" value={snap.lines} />
            <Stat label="최고 기록" value={Math.max(best, snap.score)} />
          </section>
        </aside>

        <div className={styles.boardCol}>
          <div ref={boardWrapRef} className={styles.boardWrap}>
            <div className={styles.boardFrame}>
              <canvas
                ref={canvasRef}
                className={styles.board}
                tabIndex={0}
                aria-label={`게임 보드. 점수 ${snap.score}, 레벨 ${snap.level}`}
              />
              {toasts.map((t) => (
                <div key={t.id} className={styles.toast} role="status">
                  {t.icon === "sprout" && <SproutIcon />}
                  {t.text}
                </div>
              ))}
              {status === "ready" && (
                <Overlay>
                  <SproutIcon className={styles.overlayIcon} width={40} height={40} />
                  <p className={styles.overlayTitle}>{SITE.title}</p>
                  <p className={styles.overlayText}>신선한 재료를 차곡차곡 쌓아 한 줄을 완성하세요.</p>
                  <button type="button" className={ui.primaryButton} onClick={startGame}>
                    게임 시작
                  </button>
                  <KeyGuide />
                </Overlay>
              )}
              {status === "paused" && modal.kind === "none" && (
                <Overlay>
                  <p className={styles.overlayTitle}>일시정지</p>
                  <button type="button" className={ui.primaryButton} onClick={togglePause}>
                    계속하기
                  </button>
                  <button type="button" className={ui.secondaryButton} onClick={startGame}>
                    다시 시작
                  </button>
                  <button type="button" className={ui.textButton} onClick={() => openModal({ kind: "feedback" })}>
                    의견 보내기
                  </button>
                </Overlay>
              )}
              {status === "over" && modal.kind === "none" && (
                <Overlay>
                  <p className={styles.overlayTitle}>게임 종료</p>
                  <button type="button" className={ui.primaryButton} onClick={startGame}>
                    다시 하기
                  </button>
                </Overlay>
              )}
            </div>
          </div>
        </div>

        <aside className={styles.rightCol}>
          <section className={styles.card} aria-label="다음 블록">
            <h2 className={styles.cardLabel}>NEXT</h2>
            <div className={styles.nextList}>
              {[0, 1, 2].map((i) => (
                <canvas
                  key={i}
                  ref={(el) => {
                    nextCanvasRefs.current[i] = el;
                  }}
                  className={i === 0 ? styles.preview : styles.previewSmall}
                />
              ))}
            </div>
          </section>
          <div className={styles.sideButtons}>
            {status === "playing" || status === "paused" ? (
              <button type="button" className={ui.secondaryButton} onClick={togglePause}>
                {status === "paused" ? "계속하기" : "일시정지"}
              </button>
            ) : (
              <button type="button" className={ui.primaryButton} onClick={startGame}>
                {status === "over" ? "다시 하기" : "게임 시작"}
              </button>
            )}
          </div>
        </aside>

        <TouchControls press={press} release={release} />
      </main>

      <footer className={styles.footer}>{SITE.operatorNotice}</footer>

      {modal.kind === "gameOver" && !auth.recovery && (
        <GameOverModal
          result={modal.result}
          onRestart={startGame}
          onShowLeaderboard={() =>
            setModal({ kind: "leaderboard", highlight: modal.result.submission, back: modal.result })
          }
          onRequestLogin={() => setModal({ kind: "auth", back: modal.result })}
          onSubmitted={(submission) =>
            setModal({ kind: "gameOver", result: { ...modal.result, submission } })
          }
          onClose={() => setModal({ kind: "none" })}
        />
      )}
      {modal.kind === "leaderboard" && <LeaderboardModal highlight={modal.highlight} onClose={closeModal} />}
      {modal.kind === "feedback" && <FeedbackModal onClose={closeModal} />}
      {modal.kind === "auth" && !auth.recovery && (
        <AuthModal
          initialView={modal.view}
          reason={modal.back ? "로그인하면 방금 기록을 바로 등록할 수 있어요." : undefined}
          onClose={closeModal}
          onSignedIn={onSignedIn}
        />
      )}
      {modal.kind === "account" && !auth.recovery && <AccountModal onClose={closeModal} />}
      {auth.recovery && <ResetPasswordModal onClose={dismissRecovery} />}
    </div>
  );
}

// ───────────────────────── 작은 컴포넌트 ─────────────────────────

function HeaderButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={ui.iconButton}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, big = false }: { label: string; value: number; big?: boolean }) {
  return (
    <div className={big ? styles.statBig : styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value.toLocaleString()}</span>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className={styles.overlay}>{children}</div>;
}

function KeyGuide() {
  return (
    <dl className={styles.keyGuide}>
      <dt>← →</dt>
      <dd>이동</dd>
      <dt>↓</dt>
      <dd>소프트 드롭</dd>
      <dt>Space</dt>
      <dd>하드 드롭</dd>
      <dt>↑ / X · Z</dt>
      <dd>회전</dd>
      <dt>C / Shift</dt>
      <dd>홀드</dd>
      <dt>Esc / P</dt>
      <dd>일시정지</dd>
    </dl>
  );
}

/** 모바일 터치 버튼 — 길게 누르면 키보드와 같은 DAS/ARR 적용 (PRD 2.1) */
function TouchControls({ press, release }: { press: (a: Action) => void; release: (a: Action) => void }) {
  const bind = (action: Action) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      press(action);
    },
    onPointerUp: () => release(action),
    onPointerCancel: () => release(action),
    onLostPointerCapture: () => release(action),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className={styles.touch} aria-label="터치 조작">
      <div className={styles.touchMove}>
        <span />
        <button type="button" className={styles.touchButton} aria-label="하드 드롭" {...bind("hardDrop")}>
          <HardDropIcon />
        </button>
        <span />
        <button type="button" className={styles.touchButton} aria-label="왼쪽" {...bind("left")}>
          <ArrowLeftIcon />
        </button>
        <button type="button" className={styles.touchButton} aria-label="소프트 드롭" {...bind("softDrop")}>
          <ArrowDownIcon />
        </button>
        <button type="button" className={styles.touchButton} aria-label="오른쪽" {...bind("right")}>
          <ArrowRightIcon />
        </button>
      </div>
      <div className={styles.touchAction}>
        <button type="button" className={styles.touchButton} aria-label="홀드" {...bind("hold")}>
          <HoldIcon />
        </button>
        <span />
        <button type="button" className={styles.touchButton} aria-label="반시계 방향 회전" {...bind("rotateCCW")}>
          <RotateCcwIcon />
        </button>
        <button type="button" className={styles.touchButton} aria-label="시계 방향 회전" {...bind("rotateCW")}>
          <RotateCwIcon />
        </button>
      </div>
    </div>
  );
}
