import type { ModeId } from './config';
import type { ParticipantInfo } from './participant';
import type { Report } from './scoring';

/** Sent to the server. Score and breakdowns only — never questions or answers. */
export interface SubmissionPayload {
  sessionId: string;
  submittedAt: string;
  fullName: string;
  dob: string;
  email: string;
  phone: string;
  country: string;
  countryOfBirth: string;
  postalCode: string;
  mode: ModeId;
  nonverbal: boolean;
  age: number | null;
  ageNormed: boolean;
  ageAdjustmentPoints: number;
  fsiq: number;
  ciLow: number;
  ciHigh: number;
  sem: number;
  reliability: number;
  percentile: number;
  rarity: string;
  classificationLabel: string;
  classificationRange: string;
  indexSpread: number;
  confidence: Report['confidence'];
  totalCorrect: number;
  totalAdministered: number;
  durationMs: number;
  activeMs: number;
  domains: Array<{
    domain: string;
    iq: number;
    ciLow: number;
    ciHigh: number;
    percentile: number;
    correct: number;
    administered: number;
    medianSeconds: number;
    relative: string;
  }>;
  types: Array<{
    key: string;
    domain: string;
    name: string;
    correct: number;
    total: number;
    expected: number;
    z: number;
    verdict: string;
    averageDifficulty: number;
    hardestSolved: number | null;
    medianSeconds: number;
  }>;
  flags: Array<{ severity: string; title: string; detail: string }>;
}

export function submissionPayload(sessionId: string, info: ParticipantInfo, report: Report): SubmissionPayload {
  return {
    sessionId,
    submittedAt: new Date(info.submittedAt).toISOString(),
    fullName: info.fullName,
    dob: info.dob,
    email: info.email,
    phone: info.phone,
    country: info.country,
    countryOfBirth: info.countryOfBirth,
    postalCode: info.postalCode,
    mode: report.mode,
    nonverbal: report.nonverbal,
    age: report.age,
    ageNormed: report.ageNormed,
    ageAdjustmentPoints: report.ageAdjustmentPoints,
    fsiq: report.fsiq,
    ciLow: report.ciLow,
    ciHigh: report.ciHigh,
    sem: report.sem,
    reliability: report.reliability,
    percentile: report.percentile,
    rarity: report.rarity,
    classificationLabel: report.classification.label,
    classificationRange: report.classification.range,
    indexSpread: report.indexSpread,
    confidence: report.confidence,
    totalCorrect: report.totalCorrect,
    totalAdministered: report.totalAdministered,
    durationMs: Math.round(report.durationMs),
    activeMs: Math.round(report.activeMs),
    domains: report.domains.map((d) => ({
      domain: d.domain,
      iq: d.iq,
      ciLow: d.ciLow,
      ciHigh: d.ciHigh,
      percentile: d.percentile,
      correct: d.correct,
      administered: d.administered,
      medianSeconds: d.medianSeconds,
      relative: d.relative,
    })),
    types: report.types.map((t) => ({
      key: t.key,
      domain: t.domain,
      name: t.name,
      correct: t.correct,
      total: t.total,
      expected: t.expected,
      z: t.z,
      verdict: t.verdict,
      averageDifficulty: t.averageDifficulty,
      hardestSolved: t.hardestSolved,
      medianSeconds: t.medianSeconds,
    })),
    flags: report.flags.map((f) => ({ severity: f.severity, title: f.title, detail: f.detail })),
  };
}

const SAVE_ERROR = "Couldn't save your results. Check your connection and try again.";

/** Returns an error message, or null once the server has stored the submission. */
export async function sendSubmission(sessionId: string, info: ParticipantInfo, report: Report): Promise<string | null> {
  try {
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submissionPayload(sessionId, info, report)),
    });
    if (!response.ok) return SAVE_ERROR;
    return null;
  } catch {
    return SAVE_ERROR;
  }
}
