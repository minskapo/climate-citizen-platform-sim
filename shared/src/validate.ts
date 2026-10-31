export const MAX_FILE_BYTES = 1_000_000;

export function checkFileSize(bytes: number): boolean {
  return bytes <= MAX_FILE_BYTES;
}

export type NicknameResult = { ok: true; value: string } | { ok: false; error: string };

export function normalizeNickname(s: string): NicknameResult {
  const value = s.trim();
  if (value.length === 0) return { ok: false, error: '활동명을 입력해 주세요' };
  if ([...value].length > 20) return { ok: false, error: '활동명은 20자까지 쓸 수 있어요' };
  if (!/[\p{Script=Hangul}A-Za-z0-9]/u.test(value)) {
    return { ok: false, error: '한글·영문·숫자를 하나 이상 넣어 주세요' };
  }
  return { ok: true, value };
}
