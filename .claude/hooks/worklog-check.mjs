#!/usr/bin/env node
/**
 * Stop 훅: 프로젝트 파일이 바뀌었는데 docs/WORKLOG.md가 갱신되지 않았으면 응답 종료를 막고(block)
 * 작업 기록을 먼저 쓰도록 Claude에게 요구한다.
 *
 * "바뀜" 판정 (WORKLOG.md의 마지막 수정 시각 이후):
 *  - 커밋되지 않은 변경/새 파일 중 수정 시각이 WORKLOG보다 늦은 파일
 *  - WORKLOG.md를 포함하지 않은 커밋
 * 무한 루프 방지: 이미 한 번 막은 뒤(stop_hook_active)에는 통과시킨다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const LOG = "docs/WORKLOG.md";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function main() {
  const input = readStdin();
  if (input.stop_hook_active) return; // 이미 한 번 요구했다면 다시 막지 않는다

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logPath = path.join(root, LOG);
  if (!existsSync(path.join(root, ".git"))) return;

  const logMtime = existsSync(logPath) ? statSync(logPath).mtimeMs : 0;
  const changed = new Set();

  // 1) 커밋되지 않은 변경 (삭제 파일은 수정 시각이 없어 그대로 포함)
  const status = git(["status", "--porcelain", "-uall"], root);
  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    let file = line.slice(3).trim();
    if (file.includes(" -> ")) file = file.split(" -> ")[1];
    file = file.replace(/^"|"$/g, "");
    if (file === LOG) continue;
    const abs = path.join(root, file);
    if (!existsSync(abs) || statSync(abs).mtimeMs > logMtime) changed.add(file);
  }

  // 2) WORKLOG를 포함하지 않은 최근 커밋
  if (logMtime > 0) {
    const since = new Date(logMtime).toISOString();
    const out = git(["log", `--since=${since}`, "--name-only", "--format=@@%h %s"], root);
    for (const block of out.split("@@").filter(Boolean)) {
      const [header, ...files] = block.trim().split("\n").filter(Boolean);
      if (files.length && !files.includes(LOG)) changed.add(`(커밋) ${header}`);
    }
  }

  if (changed.size === 0) return;

  const list = [...changed].slice(0, 15).join(", ");
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `작업 기록이 갱신되지 않았습니다. 응답을 마치기 전에 ${LOG}를 업데이트하세요: ` +
        `① "작업 이력"에 오늘 날짜로 이번 작업 내용·이유·커밋 해시·확인 결과 추가 ` +
        `② "현재 상태"와 "다음에 할 일" 최신화 ③ 새로 알게 된 함정이 있으면 추가. ` +
        `변경된 항목: ${list}`,
    }),
  );
}

try {
  main();
} catch {
  // 훅 오류로 작업이 막히지 않도록 조용히 통과
}
