import { describe, expect, test } from 'vitest';
import { councilOf, hiddenNoticeText } from '../src/text';

describe('shared text helpers', () => {
  test('councilOf prefers sigungu, then sido, else 지역 미입력', () => {
    expect(councilOf('서울', '마포구')).toBe('마포구의회');
    expect(councilOf('세종', '')).toBe('세종의회');
    expect(councilOf('', '')).toBe('지역 미입력');
  });
  test('hiddenNoticeText names the reason neutrally', () => {
    expect(hiddenNoticeText('광고')).toBe('운영 원칙(광고)에 따라 글을 숨겼어요');
  });
});
