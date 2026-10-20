import { describe, expect, it } from 'vitest';
import type { ParticipantInfo } from './participant';
import type { Report } from './scoring';
import { submissionPayload } from './submit';

describe('submissionPayload', () => {
  it('sends the score and breakdowns and leaves questions out', () => {
    const info: ParticipantInfo = {
      fullName: 'Sam Lee',
      dob: '1990-04-12',
      email: 'sam@example.com',
      phone: '+15552345678',
      country: 'US',
      countryOfBirth: 'CA',
      postalCode: '10001',
      submittedAt: Date.now(),
    };
    const report = {
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
      classification: { label: 'High Average', range: '110–119', description: 'unused' },
      indexSpread: 11,
      confidence: 'high',
      totalCorrect: 30,
      totalAdministered: 54,
      durationMs: 1000.4,
      activeMs: 900.2,
      domains: [
        { domain: 'matrices', iq: 122, ciLow: 112, ciHigh: 132, percentile: 93, correct: 8, administered: 12, medianSeconds: 20, relative: 'consistent', info: { name: 'Matrix' } },
      ],
      types: [
        { key: 'matrix-progression', domain: 'matrices', name: 'Progression', correct: 4, total: 6, expected: 3, z: 0.2, verdict: 'expected', averageDifficulty: 0, hardestSolved: null, medianSeconds: 10 },
      ],
      flags: [],
      review: [{ item: { prompt: 'UNIQUE_PROMPT_MARKER', answer: 3 }, response: 1, correct: false }],
    } as unknown as Report;

    const payload = submissionPayload('mf0abc-1a2b', info, report);
    const saved = JSON.stringify(payload);
    expect(payload.fsiq).toBe(118);
    expect(payload.domains[0]?.iq).toBe(122);
    expect(payload.types[0]?.name).toBe('Progression');
    expect(payload.durationMs).toBe(1000);
    expect(saved).not.toContain('UNIQUE_PROMPT_MARKER');
    expect(saved).not.toContain('review');
  });
});
