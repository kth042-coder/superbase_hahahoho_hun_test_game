/**
 * Web Audio로 합성하는 부드러운 마림바 계열 효과음 (PRD 9.7). 음원 파일이 필요 없다.
 * 모바일 자동재생 정책 때문에 첫 사용자 입력에서 unlock()을 호출해야 소리가 난다.
 */
export type SoundName = "move" | "rotate" | "lock" | "hardDrop" | "hold" | "clear" | "tetris" | "levelUp" | "gameOver";

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** 마림바 느낌: 기본음 + 4배음을 짧게 감쇠 */
  private note(freq: number, start: number, duration = 0.35, volume = 0.3): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + start;
    for (const [mult, gainMul] of [
      [1, 1],
      [4, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * gainMul, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration / (mult === 1 ? 1 : 3));
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + duration);
    }
  }

  play(name: SoundName): void {
    if (this.muted || !this.ctx || this.ctx.state !== "running") return;
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, G4 = 392, E4 = 329.63, C4 = 261.63;
    switch (name) {
      case "move":
        this.note(C6, 0, 0.06, 0.05);
        break;
      case "rotate":
        this.note(G5, 0, 0.08, 0.08);
        break;
      case "hold":
        this.note(E5, 0, 0.12, 0.12);
        this.note(A5, 0.05, 0.12, 0.1);
        break;
      case "lock":
        this.note(C4, 0, 0.18, 0.2);
        break;
      case "hardDrop":
        this.note(G4 / 2, 0, 0.22, 0.3);
        break;
      case "clear":
        [C5, E5, G5].forEach((f, i) => this.note(f, i * 0.06, 0.35, 0.22));
        break;
      case "tetris":
        [C5, E5, G5, C6, G5, C6].forEach((f, i) => this.note(f, i * 0.07, 0.45, 0.25));
        break;
      case "levelUp":
        [G4, C5, E5, G5].forEach((f, i) => this.note(f, i * 0.09, 0.4, 0.22));
        break;
      case "gameOver":
        [G4, E4, C4, G4 / 2].forEach((f, i) => this.note(f, i * 0.18, 0.6, 0.25));
        break;
    }
  }
}

export const sound = new SoundPlayer();
