#!/usr/bin/env node
/**
 * SessionEnd 훅: 세션이 끝나는 시점의 상태를 docs/WORKLOG.md의 "마지막 세션 종료 스냅샷" 블록에 기록한다.
 * (브랜치, 최신 커밋, 원격과의 차이, 커밋 안 된 파일) — 다음 세션이 이어서 작업할 수 있도록.
 * 블록은 매번 덮어쓴다. 사람이 쓰는 "작업 이력"은 건드리지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOG = "docs/WORKLOG.md";
const START = "<!-- SESSION-SNAPSHOT:START -->";
const END = "<!-- SESSION-SNAPSHOT:END -->";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

const git = (args, cwd) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16) + " (KST)";
}

function main() {
  const input = readStdin();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logPath = path.join(root, LOG);
  if (!existsSync(logPath)) return;

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root) || "?";
  const head = git(["log", "-1", "--format=%h %s"], root) || "?";
  const counts = git(["rev-list", "--left-right", "--count", `HEAD...@{u}`], root);
  let remote = "원격 추적 정보 없음";
  if (counts) {
    const [ahead, behind] = counts.split(/\s+/).map(Number);
    remote = ahead || behind ? `푸시 안 된 커밋 ${ahead}개, 받아올 커밋 ${behind}개` : "원격과 동일 (푸시 완료)";
  }
  const status = git(["status", "--porcelain", "-uall"], root)
    .split("\n")
    .filter((l) => l.trim() && !l.endsWith(LOG));
  const files = status.length
    ? status.slice(0, 20).map((l) => `  - \`${l.trim()}\``).join("\n") + (status.length > 20 ? `\n  - …외 ${status.length - 20}개` : "")
    : "  - 없음";

  const block = [
    START,
    "## 마지막 세션 종료 스냅샷 (자동 기록 — SessionEnd 훅)",
    "",
    `- 종료 시각: ${kstNow()}${input.reason ? ` · 종료 사유: ${input.reason}` : ""}`,
    `- 브랜치: \`${branch}\` · 최신 커밋: \`${head}\``,
    `- 원격: ${remote}`,
    "- 커밋 안 된 파일 (WORKLOG 제외):",
    files,
    "",
    "> 다음 세션에서는 이 스냅샷과 \"다음에 할 일\"을 보고 이어서 작업한다. 커밋 안 된 파일이 있으면 먼저 정리 여부를 사용자에게 확인.",
    END,
  ].join("\n");

  let text = readFileSync(logPath, "utf8");
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s !== -1 && e > s) {
    text = text.slice(0, s) + block + text.slice(e + END.length);
  } else {
    // "다음에 할 일" 섹션 앞에 넣는다 (없으면 맨 끝)
    const anchor = text.indexOf("## 다음에 할 일");
    text = anchor !== -1 ? text.slice(0, anchor) + block + "\n\n---\n\n" + text.slice(anchor) : text + "\n\n" + block + "\n";
  }
  writeFileSync(logPath, text);
}

try {
  main();
} catch {
  // 훅 오류로 종료가 막히지 않도록 조용히 통과
}
