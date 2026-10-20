import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ageMeanTheta, hasReliableAgeNorm } from './age';
import { ageFromDob, validateEmail, validateParticipant, validatePhone } from './participant';

describe('email validation', () => {
  it('accepts real addresses', () => {
    for (const e of ['name@gmail.com', 'a.b-c@sub.example.co.uk', 'jo+tag@proton.me']) {
      expect(validateEmail(e).ok, e).toBe(true);
    }
  });
  it('rejects malformed, disposable, placeholder and typo addresses', () => {
    for (const e of ['', 'nope', 'a@b', 'a@@b.com', 'x@mailinator.com', 'x@example.com', 'x@test.com', 'aaa@aaa.com']) {
      expect(validateEmail(e).ok, e).toBe(false);
    }
    expect(validateEmail('me@gmial.com').error).toMatch(/did you mean/i);
  });
});

describe('phone validation', () => {
  it('accepts international numbers and normalizes them', () => {
    const r = validatePhone('+1 (555) 234-5678');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('+15552345678');
    expect(validatePhone('020 7946 0958').ok).toBe(true);
  });
  it('rejects junk', () => {
    for (const p of ['', '123', '0000000000', '1234567890', 'abcdef', '+1'.padEnd(20, '9')]) {
      expect(validatePhone(p).ok, p).toBe(false);
    }
  });
});

describe('age from dob', () => {
  // Local noon, so UTC offset can't shift the calendar day.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date(2026, 5, 15, 12)));
  afterEach(() => vi.useRealTimers());
  it('computes whole years and rejects the future', () => {
    expect(ageFromDob('2000-06-15')).toBe(26);
    expect(ageFromDob('2000-06-16')).toBe(25);
    expect(ageFromDob('2030-01-01')).toBe(null);
    expect(ageFromDob('bad')).toBe(null);
  });
});

describe('full participant validation', () => {
  it('passes a complete valid record and fails an empty one', () => {
    const ok = validateParticipant({
      fullName: 'Ada Lovelace', dob: '1990-01-01', email: 'ada@proton.me',
      phone: '+44 20 7946 0958', country: 'GB', countryOfBirth: 'GB', postalCode: 'SW1A 1AA',
    });
    expect(ok.ok).toBe(true);
    const bad = validateParticipant({ fullName: '', dob: '', email: '', phone: '', country: '', countryOfBirth: '', postalCode: '' });
    expect(bad.ok).toBe(false);
    expect(Object.keys(bad.errors)).toHaveLength(7);
  });
});

describe('age norming', () => {
  it('is monotone declining for fluid reasoning after the mid-20s', () => {
    expect(ageMeanTheta('matrices', 25)).toBeGreaterThan(ageMeanTheta('matrices', 40));
    expect(ageMeanTheta('matrices', 40)).toBeGreaterThan(ageMeanTheta('matrices', 70));
  });
  it('favours middle age for verbal ability', () => {
    expect(ageMeanTheta('verbal', 50)).toBeGreaterThan(ageMeanTheta('verbal', 20));
  });
  it('is anchored at zero at age 30 and clamps outside 16–90', () => {
    for (const d of ['matrices', 'verbal', 'spatial', 'series', 'memory'] as const) {
      expect(Math.abs(ageMeanTheta(d, 30))).toBeLessThan(1e-9);
    }
    expect(ageMeanTheta('matrices', 10)).toBe(ageMeanTheta('matrices', 16));
    expect(hasReliableAgeNorm(14)).toBe(false);
    expect(hasReliableAgeNorm(40)).toBe(true);
  });
});
