/**
 * localStorage 래퍼. 사생활 보호 모드 등에서 접근이 막혀도 게임이 동작하도록 모든 접근을 try/catch로 감싼다.
 */
const PREFIX = "barun-block:";

export function loadString(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function saveString(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function loadNumber(key: string, fallback = 0): number {
  const v = Number(loadString(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadBool(key: string, fallback = false): boolean {
  const v = loadString(key);
  return v === null ? fallback : v === "1";
}

export function saveBool(key: string, value: boolean): void {
  saveString(key, value ? "1" : "0");
}
