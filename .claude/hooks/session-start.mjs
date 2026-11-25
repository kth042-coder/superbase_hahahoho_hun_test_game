#!/usr/bin/env node
/**
 * SessionStart 훅: docs/WORKLOG.md의 핵심 섹션(현재 상태, 마지막 세션 스냅샷, 다음에 할 일, 최근 작업 이력)과
 * 현재 git 상태를 Claude의 컨텍스트에 자동으로 넣어, 새 세션이 바로 이어서 작업할 수 있게 한다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LOG = "docs/WORKLOG.md";
const MAX = 9000; // 컨텍스트에 넣을 최대 글자 수

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

/** "## 제목"으로 시작하는 섹션 본문을 다음 "## " 전까지 잘라낸다 */
function section(text, title) {
  const i = text.indexOf(`## ${title}`);
  if (i === -1) return "";
  const rest = text.slice(i);
  const next = rest.slice(3).search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next + 3))
    .replace(/<!-- SESSION-SNAPSHOT:\w+ -->/g, "")
    .replace(/\n---\s*/g, "\n")
    .trim();
}

function main() {
  const input = readStdin();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logPath = path.join(root, LOG);
  if (!existsSync(logPath)) return;
  const text = readFileSync(logPath, "utf8");

  // 최근 작업 이력 2개
  const hist = section(text, "작업 이력");
  const entries = hist.split(/\n(?=### )/).slice(1);
  const recent = entries.slice(-2).join("\n\n");

  const status = git(["status", "--short"], root) || "(변경 없음)";
  const head = git(["log", "-3", "--oneline"], root);

  const parts = [
    "[이전 작업 이어받기 — docs/WORKLOG.md 자동 요약 (SessionStart 훅)]",
    section(text, "현재 상태"),
    section(text, "마지막 세션 종료 스냅샷 (자동 기록 — SessionEnd 훅)"),
    section(text, "다음에 할 일"),
    recent ? `## 최근 작업 이력\n${recent}` : "",
    `## 지금 git 상태\n최근 커밋:\n${head}\n\n변경 파일:\n${status}`,
    "※ 함정·자주 쓰는 명령은 docs/WORKLOG.md 전체를 참고. 작업을 마치면 WORKLOG의 작업 이력/현재 상태/다음에 할 일을 갱신할 것.",
  ].filter(Boolean);

  let context = parts.join("\n\n");
  if (context.length > MAX) context = context.slice(0, MAX) + "\n…(이하 생략 — docs/WORKLOG.md 참고)";

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    }),
  );
}

try {
  main();
} catch {
  // 훅 오류로 세션 시작이 막히지 않도록 조용히 통과
}
