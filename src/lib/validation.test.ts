import { describe, expect, it } from "vitest";
import { checkPlausibility, maxPlausibleScore } from "./plausibility";
import { feedbackSchema, nicknameSchema, scoreSubmissionSchema } from "./validation";

describe("닉네임 검증", () => {
  it("앞뒤 공백 제거 후 2~12자", () => {
    expect(nicknameSchema.safeParse(" 가 ").success).toBe(false);
    expect(nicknameSchema.safeParse("  두부  ").data).toBe("두부");
    expect(nicknameSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(nicknameSchema.safeParse("a".repeat(13)).success).toBe(false);
  });

  it("허용 문자만", () => {
    expect(nicknameSchema.safeParse("player_1-가").success).toBe(true);
    expect(nicknameSchema.safeParse("<script>").success).toBe(false);
    expect(nicknameSchema.safeParse("🙂🙂🙂").success).toBe(false);
  });

  it("금칙어 차단 (공백·숫자 섞어도)", () => {
    expect(nicknameSchema.safeParse("시 1 발").success).toBe(false);
    expect(nicknameSchema.safeParse("FuCk").success).toBe(false);
  });
});

describe("점수 제출 검증", () => {
  const valid = { nickname: "바른두부", score: 1200, level: 1, lines_cleared: 4, duration_ms: 60_000 };
  it("정상 값 통과", () => expect(scoreSubmissionSchema.safeParse(valid).success).toBe(true));
  it("0점·음수·소수 거부", () => {
    expect(scoreSubmissionSchema.safeParse({ ...valid, score: 0 }).success).toBe(false);
    expect(scoreSubmissionSchema.safeParse({ ...valid, score: -1 }).success).toBe(false);
    expect(scoreSubmissionSchema.safeParse({ ...valid, score: 1.5 }).success).toBe(false);
  });
});

describe("피드백 검증", () => {
  it("내용 10~500자, 빈 연락처는 undefined", () => {
    const r = feedbackSchema.safeParse({ category: "bug", message: "블록이 가끔 멈춰요 확인 부탁", contact: "  " });
    expect(r.success).toBe(true);
    expect(r.data?.contact).toBeUndefined();
    expect(feedbackSchema.safeParse({ category: "bug", message: "짧음" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ category: "bug", message: "x".repeat(501) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ category: "spam", message: "x".repeat(20) }).success).toBe(false);
  });
});

describe("점수 타당성", () => {
  it("정상적인 기록은 통과", () => {
    expect(checkPlausibility({ score: 12_000, level: 3, lines_cleared: 25, duration_ms: 300_000 })).toEqual({ ok: true });
  });
  it("드롭 점수만 있는 0줄 기록도 통과", () => {
    expect(checkPlausibility({ score: 300, level: 1, lines_cleared: 0, duration_ms: 20_000 }).ok).toBe(true);
  });
  it("레벨 불일치 거부", () => {
    expect(checkPlausibility({ score: 1000, level: 5, lines_cleared: 3, duration_ms: 60_000 })).toMatchObject({
      reason: "level_mismatch",
    });
  });
  it("비현실적인 점수 거부", () => {
    expect(
      checkPlausibility({ score: 999_999_999, level: 1, lines_cleared: 4, duration_ms: 60_000 }),
    ).toMatchObject({ reason: "score_too_high" });
  });
  it("너무 빠른 기록 거부", () => {
    expect(checkPlausibility({ score: 5000, level: 5, lines_cleared: 40, duration_ms: 10_000 })).toMatchObject({
      reason: "too_fast",
    });
  });
  it("상한은 줄 수가 늘면 커진다", () => {
    expect(maxPlausibleScore(100)).toBeGreaterThan(maxPlausibleScore(10));
  });
});
