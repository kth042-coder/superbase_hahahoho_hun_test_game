/**
 * 간단한 금칙어 필터. 공백·특수문자를 제거한 뒤 부분 일치로 검사한다.
 * 완벽한 필터는 아니며, 명백한 욕설만 걸러내는 것을 목표로 한다.
 */
const BANNED = [
  "시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "븅신", "개새", "새끼", "좆", "존나", "ㅈㄴ",
  "지랄", "미친놈", "미친년", "닥쳐", "fuck", "shit", "bitch", "asshole", "dick", "pussy",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_\-.0-9]/g, "");
}

export function containsProfanity(text: string): boolean {
  const n = normalize(text);
  return BANNED.some((w) => n.includes(w));
}
