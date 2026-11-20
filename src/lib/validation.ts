import { z } from "zod";
import { MAX_LEVEL } from "@/game/constants";
import { containsProfanity } from "./profanity";

/** PRD 2.2 / 3.1 — 클라이언트·서버·DB가 같은 수치를 쓴다 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9 _-]+$/;

/** PRD 2.3 / 3.2 */
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 500;
export const CONTACT_MAX = 100;

export const FEEDBACK_CATEGORIES = ["bug", "feature", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "버그 제보",
  feature: "기능 제안",
  other: "기타 의견",
};

export const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN, `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.`)
  .max(NICKNAME_MAX, `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`)
  .regex(NICKNAME_PATTERN, "한글, 영문, 숫자, 공백, _, - 만 사용할 수 있습니다.")
  .refine((v) => !containsProfanity(v), "사용할 수 없는 단어가 포함되어 있습니다.");

export const scoreSubmissionSchema = z.object({
  nickname: nicknameSchema,
  score: z.number().int().positive().max(2_000_000_000),
  level: z.number().int().min(1).max(MAX_LEVEL),
  lines_cleared: z.number().int().min(0).max(1_000_000),
  duration_ms: z.number().int().min(0).max(24 * 60 * 60 * 1000),
});
export type ScoreSubmission = z.infer<typeof scoreSubmissionSchema>;

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN, `내용은 ${MESSAGE_MIN}자 이상 입력해 주세요.`)
    .max(MESSAGE_MAX, `내용은 ${MESSAGE_MAX}자 이하로 입력해 주세요.`),
  contact: z
    .string()
    .trim()
    .max(CONTACT_MAX, `연락처는 ${CONTACT_MAX}자 이하로 입력해 주세요.`)
    .optional()
    .transform((v) => (v ? v : undefined)),
  meta: z
    .object({
      appVersion: z.string().max(20).optional(),
      userAgent: z.string().max(400).optional(),
      screen: z.string().max(40).optional(),
    })
    .optional(),
  /** 허니팟 — 사람은 비워 둔다 */
  website: z.string().max(200).optional(),
});
export type FeedbackSubmission = z.input<typeof feedbackSchema>;

/** zod 오류에서 첫 번째 메시지를 꺼낸다 */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}
