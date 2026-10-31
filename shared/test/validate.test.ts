import { describe, expect, test } from 'vitest';
import { normalizeNickname, checkFileSize, MAX_FILE_BYTES } from '@shared/validate';

describe('validate', () => {
  test('nickname validation', () => {
    expect(normalizeNickname('  햇빛부자 ')).toEqual({ ok: true, value: '햇빛부자' });
    expect(normalizeNickname('').ok).toBe(false);
    expect(normalizeNickname('가'.repeat(21)).ok).toBe(false);
    expect(normalizeNickname('🌞🌞').ok).toBe(false);
  });
  test('nickname messages', () => {
    expect(normalizeNickname('  ')).toEqual({ ok: false, error: '활동명을 입력해 주세요' });
    expect(normalizeNickname('가'.repeat(21))).toEqual({ ok: false, error: '활동명은 20자까지 쓸 수 있어요' });
    expect(normalizeNickname('🌞🌞')).toEqual({ ok: false, error: '한글·영문·숫자를 하나 이상 넣어 주세요' });
  });
  test('nickname 20 chars ok, emoji with letter ok', () => {
    expect(normalizeNickname('a'.repeat(20)).ok).toBe(true);
    expect(normalizeNickname('🌞a').ok).toBe(true);
  });
  test('file size', () => {
    expect(MAX_FILE_BYTES).toBe(1_000_000);
    expect(checkFileSize(1_000_000)).toBe(true);
    expect(checkFileSize(1_000_001)).toBe(false);
  });
});
