import { describe, expect, it } from 'vitest';
import { parseSubmission } from './payload.ts';

function validBody(): Record<string, unknown> {
  return {
    sessionId: 'mf0abc-1a2b',
    submittedAt: new Date().toISOString(),
    fullName: 'Sam Lee',
    dob: '1990-04-12',
    email: 'Sam@Example.com',
    phone: '+15552345678',
    country: 'US',
    countryOfBirth: 'CA',
    postalCode: '10001',
    mode: 'standard',
    nonverbal: false,
    age: 36,
    ageNormed: true,
    ageAdjustmentPoints: 2,
    fsiq: 118,
    ciLow: 111,
    ciHigh: 125,
    sem: 3.4,
    reliability: 0.95,
    percentile: 88,
    rarity: 'about 1 in 8',
    classificationLabel: 'High Average',
    classificationRange: '110–119',
    indexSpread: 11,
    confidence: 'high',
    totalCorrect: 30,
    totalAdministered: 54,
    durationMs: 1_800_000,
    activeMs: 1_700_000,
    domains: [
      { domain: 'matrices', iq: 122, ciLow: 112, ciHigh: 132, percentile: 93, correct: 8, administered: 12, medianSeconds: 28.4, relative: 'strength' },
    ],
    types: [
      { key: 'matrix-progression', domain: 'matrices', name: 'Progression', correct: 4, total: 6, expected: 3.2, z: 0.8, verdict: 'expected', averageDifficulty: 0.4, hardestSolved: 1.1, medianSeconds: 30 },
    ],
    flags: [{ severity: 'info', title: 'Left the test window', detail: 'The test window lost focus once.' }],
    review: [{ prompt: 'Which option completes the pattern?', answer: 2, response: 1 }],
    questions: ['secret question text'],
  };
}

describe('parseSubmission', () => {
  it('keeps the score and breakdown and drops question content', () => {
    const result = parseSubmission(validBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('sam@example.com');
    expect(result.value.fsiq).toBe(118);
    expect(result.value.domains[0]?.domain).toBe('matrices');
    expect(result.value.types[0]?.name).toBe('Progression');
    const saved = JSON.stringify(result.value);
    expect(saved).not.toContain('Which option');
    expect(saved).not.toContain('secret question');
    expect(saved).not.toContain('review');
  });

  it('rejects a missing score breakdown', () => {
    const body = validBody();
    body.domains = [];
    expect(parseSubmission(body).ok).toBe(false);
  });

  it('rejects an implausible phone number', () => {
    const body = validBody();
    body.phone = '000';
    expect(parseSubmission(body).ok).toBe(false);
  });
});
