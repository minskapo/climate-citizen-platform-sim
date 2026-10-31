import { describe, expect, test } from 'vitest';
import {
  calculate, actionPotential, CONFIG, QUESTIONS, SECTOR_KEYS, ACTIONS, CARBON_FACTORS,
  POLICIES_REDUCE, POLICIES_SOCIAL, SOCIAL_FOUNDATION,
} from '@shared/calculator';
import fixtures from './fixtures/calc.json';

describe('1.5C calculator matches original', () => {
  test.each(fixtures)('matches original $name', ({ answers, result, potentials }) => {
    const r = calculate(answers as never);
    expect(r.total).toBeCloseTo(result.total, 10);
    expect(r.gap).toBeCloseTo(result.gap, 10);
    expect(r.rate).toBeCloseTo(result.rate, 10);
    expect(r.under).toBe(result.under);
    expect(r.raw).toEqual(result.raw);
    for (const k of Object.keys(result.sectors)) {
      expect(r.sectors[k as keyof typeof r.sectors]).toBeCloseTo(
        result.sectors[k as keyof typeof result.sectors], 10);
    }
    for (const [key, v] of Object.entries(result.parts)) expect(r.parts[key]).toBeCloseTo(v as number, 10);
    for (const [id, v] of Object.entries(potentials)) {
      expect(actionPotential(id, { ...r, ans: answers as never })).toBeCloseTo(v as number, 10);
    }
  });
});

test('question count', () => {
  expect(SECTOR_KEYS.reduce((s, k) => s + QUESTIONS[k].length, 0)).toBe(28);
});
test('config, train factor, data sizes', () => {
  expect(CONFIG).toEqual({ TARGET_2030: 5.9, GLOBAL_AVG: 4.6, KOREA_AVG: 13.6, ACTIONS_TO_PICK: 3, SPLIT_HOUSEHOLD_ENERGY: true });
  expect(CARBON_FACTORS.transport.train).toBeCloseTo((200 * 14) / 1000 / 1000, 12);
  expect(ACTIONS.length).toBe(23);
  expect(POLICIES_REDUCE.length).toBe(15);
  expect(POLICIES_SOCIAL.length).toBe(16);
  expect(SOCIAL_FOUNDATION.length).toBe(5);
});
test('actionPotential without ans uses empty answers', () => {
  const r = calculate({});
  expect(actionPotential('solar', r)).toBeCloseTo(0.14, 10);
  expect(() => actionPotential('nope', r)).toThrow();
});
