import { describe, expect, test } from 'vitest';
import {
  campaignStatus, isVisible, canApply, participantPhase, dayIndex, runEnd, type StatusInput,
} from '@shared/campaignStatus';

const practice: StatusInput = {
  type: 'practice', publish: 'scheduled', showUpcoming: true,
  schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-01-31', runStart: '2027-02-08', runDays: 28 },
};
const signature: StatusInput = {
  type: 'signature', publish: 'now', showUpcoming: true,
  schedule: { recruitStart: '2027-01-04', recruitEnd: '2027-02-28' },
};
const offline: StatusInput = {
  type: 'offline', publish: 'now', showUpcoming: true,
  schedule: { recruitStart: '2027-01-11', recruitEnd: '2027-01-23', recruitEndTime: '18:00', eventDate: '2027-01-25', eventStart: '14:00', eventEnd: '16:00' },
};

describe('campaignStatus', () => {
  test('practice timeline', () => {
    expect(campaignStatus(practice, '2027-01-03')).toBe('scheduled');
    expect(campaignStatus(practice, '2027-02-07')).toBe('recruiting');
    expect(canApply(practice, '2027-02-07', '10:00')).toBe(false);
    expect(canApply(practice, '2027-01-31', '23:00')).toBe(true);
    expect(campaignStatus(practice, '2027-03-07')).toBe('running');
    expect(participantPhase(practice, '2027-03-07')).toBe('final');
    expect(participantPhase(practice, '2027-03-06')).toBe('running');
    expect(participantPhase(practice, '2027-02-07')).toBe('before');
    expect(participantPhase(practice, '2027-03-08')).toBe('after');
    expect(dayIndex(practice, '2027-02-20')).toBe(13);
    expect(dayIndex(practice, '2027-02-07')).toBeNull();
    expect(runEnd(practice)).toBe('2027-03-07');
    expect(campaignStatus(practice, '2027-03-08')).toBe('closed');
  });
  test('signature has no running', () => {
    expect(campaignStatus(signature, '2027-01-03')).toBe('scheduled');
    expect(campaignStatus(signature, '2027-02-28')).toBe('recruiting');
    expect(canApply(signature, '2027-02-28', '23:30')).toBe(true);
    expect(campaignStatus(signature, '2027-03-01')).toBe('closed');
    expect(canApply(signature, '2027-03-01', '00:00')).toBe(false);
    expect(runEnd(signature)).toBe('2027-02-28');
  });
  test('offline event day', () => {
    expect(campaignStatus(offline, '2027-01-23')).toBe('recruiting');
    expect(canApply(offline, '2027-01-23', '17:59')).toBe(true);
    expect(canApply(offline, '2027-01-23', '18:00')).toBe(false);
    expect(campaignStatus(offline, '2027-01-24')).toBe('recruiting');
    expect(campaignStatus(offline, '2027-01-25')).toBe('running');
    expect(campaignStatus(offline, '2027-01-26')).toBe('closed');
    expect(runEnd(offline)).toBe('2027-01-25');
  });
  test('draft is never applicable and not visible', () => {
    const d = { ...practice, publish: 'draft' as const };
    expect(campaignStatus(d, '2027-01-10')).toBe('draft');
    expect(canApply(d, '2027-01-10', '10:00')).toBe(false);
    expect(isVisible(d, '2027-01-10')).toBe(false);
  });
  test('recruitStartTime gates start of applications', () => {
    const c: StatusInput = { ...practice, schedule: { ...practice.schedule, recruitStartTime: '09:00' } };
    expect(canApply(c, '2027-01-04', '08:59')).toBe(false);
    expect(canApply(c, '2027-01-04', '09:00')).toBe(true);
  });
  test('scheduled hidden unless showUpcoming', () => {
    const hidden = { ...practice, showUpcoming: false };
    expect(isVisible(hidden, '2027-01-03')).toBe(false);
    expect(isVisible(practice, '2027-01-03')).toBe(true);
    expect(isVisible(hidden, '2027-01-04')).toBe(true);
  });
});
