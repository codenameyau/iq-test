import { DOMAINS, MODES, QUESTION_TYPES, questionTypeOf, type DomainInfo, type ModeId } from './config';
import {
  guessingFloor,
  scoredResponses,
  toScored,
  type ResponseRecord,
  type SectionState,
  type Session,
} from './engine';
import { estimateAbility, normalCdf, personFit, probability } from './irt';
import { ageMeanTheta, hasReliableAgeNorm } from './age';
import { ageFromDob, type ParticipantInfo } from './participant';
import type { Domain } from './types';

const IQ_MEAN = 100;
const IQ_SD = 15;
const Z95 = 1.96;
/** Faster than this on a multiple-choice item is treated as a rapid guess. */
const RAPID_GUESS_MS = 2000;
/** Items top out near b = +2.7, so estimates above this IQ are imprecise. */
export const MEASUREMENT_CEILING = 140;
export const MEASUREMENT_FLOOR = 60;

export interface Classification {
  label: string;
  range: string;
  description: string;
}

export interface DomainScore {
  domain: Domain;
  info: DomainInfo;
  iq: number;
  ciLow: number;
  ciHigh: number;
  percentile: number;
  correct: number;
  administered: number;
  medianSeconds: number;
  /** Relative to the person's own overall level, not to the population. */
  relative: 'strength' | 'weakness' | 'consistent';
}

export interface ValidityFlag {
  severity: 'info' | 'warning';
  title: string;
  detail: string;
}

/** Performance on one question type, judged against what the person's overall level predicts. */
export interface TypeScore {
  key: string;
  domain: Domain;
  name: string;
  measures: string;
  correct: number;
  total: number;
  /** Correct answers expected for someone at the person's overall ability on these exact items. */
  expected: number;
  /** Standardised residual (observed − expected) / SD. */
  z: number;
  verdict: 'above' | 'below' | 'expected';
  averageDifficulty: number;
  /** Difficulty of the hardest item answered correctly, or null. */
  hardestSolved: number | null;
  medianSeconds: number;
}

export interface ReviewEntry extends ResponseRecord {
  domain: Domain;
  number: number;
}

export interface Report {
  mode: ModeId;
  nonverbal: boolean;
  participant: ParticipantInfo | null;
  /** Age in whole years from the participant's date of birth, or null if not provided. */
  age: number | null;
  ageNormed: boolean;
  /** IQ points added (or removed) by comparing against the person's age group. */
  ageAdjustmentPoints: number;
  fsiq: number;
  ciLow: number;
  ciHigh: number;
  sem: number;
  reliability: number;
  percentile: number;
  rarity: string;
  classification: Classification;
  domains: DomainScore[];
  types: TypeScore[];
  /** Spread between the highest and lowest index, in IQ points. */
  indexSpread: number;
  flags: ValidityFlag[];
  confidence: 'high' | 'moderate' | 'low';
  totalCorrect: number;
  totalAdministered: number;
  durationMs: number;
  activeMs: number;
  review: ReviewEntry[];
}

export const CLASSIFICATIONS: (Classification & { min: number })[] = [
  { min: 130, label: 'Extremely High', range: '130+', description: 'About 2% of adults score in this range. Problems that most people find difficult tend to be manageable, and complex new material is usually learned quickly.' },
  { min: 120, label: 'Very High', range: '120–129', description: 'About 7% of adults score in this range. Abstract and complex reasoning comes comfortably, including demanding academic and professional material.' },
  { min: 110, label: 'High Average', range: '110–119', description: 'About 16% of adults score in this range. Reasoning tends to be quicker and more accurate than typical, especially on unfamiliar problems.' },
  { min: 90, label: 'Average', range: '90–109', description: 'Half of all adults score in this range. Reasoning ability is fully sufficient for the large majority of educational and occupational demands.' },
  { min: 80, label: 'Low Average', range: '80–89', description: 'About 16% of adults score in this range. Most everyday reasoning is comfortable; complex abstract material may take more time and structured practice.' },
  { min: 70, label: 'Very Low', range: '70–79', description: 'About 7% of adults score in this range. Results this low on an unproctored online test often reflect testing conditions; a professional assessment gives a far more reliable picture.' },
  { min: -Infinity, label: 'Extremely Low', range: 'below 70', description: 'About 2% of adults score in this range. A score this low from an online test should not be taken at face value; only a qualified professional can assess this properly.' },
];

export function classify(iq: number): Classification {
  return CLASSIFICATIONS.find((c) => iq >= c.min)!;
}

export function buildReport(session: Session): Report {
  const all = scoredResponses(session.sections);
  const overall = estimateAbility(all);

  // Age norming: shift ability to compare against typical performance at the person's age.
  const age = session.participant ? ageFromDob(session.participant.dob) : null;
  const ageNormed = age !== null;
  const domainOffset = (domain: Domain) => (ageNormed ? ageMeanTheta(domain, age) : 0);
  // Overall offset weights each area's age shift by how many items it contributed.
  let offsetSum = 0;
  let offsetWeight = 0;
  for (const s of session.sections) {
    const n = s.responses.length;
    offsetSum += domainOffset(s.domain) * n;
    offsetWeight += n;
  }
  const overallOffset = offsetWeight > 0 ? offsetSum / offsetWeight : 0;
  const overallTheta = overall.theta - overallOffset;

  const fsiq = toIq(overallTheta);
  const halfWidth = Z95 * overall.se * IQ_SD;

  const domains = session.sections.map((section) => {
    const responses = section.responses.map(toScored);
    const est = estimateAbility(responses, domainPrior(session, section));
    const theta = est.theta - domainOffset(section.domain);
    const iq = toIq(theta);
    const half = Z95 * est.se * IQ_SD;
    // Difference is meaningful only when it exceeds the combined measurement error.
    const threshold = Z95 * Math.sqrt(est.se ** 2 + overall.se ** 2) * IQ_SD;
    const diff = iq - fsiq;
    return {
      domain: section.domain,
      info: DOMAINS[section.domain],
      iq,
      ciLow: Math.round(iq - half),
      ciHigh: Math.round(iq + half),
      percentile: percentileOf(theta),
      correct: section.responses.filter((r) => r.correct).length,
      administered: section.responses.length,
      medianSeconds: median(section.responses.map((r) => r.ms / 1000)),
      relative: diff > threshold ? 'strength' : diff < -threshold ? 'weakness' : 'consistent',
    } satisfies DomainScore;
  });

  const records = session.sections.flatMap((s) => s.responses);
  const flags = validityFlags(session, records, personFit(all, overall.theta), fsiq);
  if (ageNormed && !hasReliableAgeNorm(age)) {
    flags.push({
      severity: 'warning',
      title: 'Age outside the normed range',
      detail: `Age norms here cover 16 to 90. At ${age}, the age adjustment is held at the nearest end of that range, so your score is less reliable. A test designed for your age group would be more accurate.`,
    });
  }
  const warnings = flags.filter((f) => f.severity === 'warning').length;
  const indexIqs = domains.map((d) => d.iq);

  return {
    mode: session.mode,
    nonverbal: session.nonverbal,
    participant: session.participant,
    age,
    ageNormed,
    ageAdjustmentPoints: Math.round(-overallOffset * IQ_SD),
    fsiq,
    ciLow: Math.round(fsiq - halfWidth),
    ciHigh: Math.round(fsiq + halfWidth),
    sem: Math.round(overall.se * IQ_SD * 10) / 10,
    reliability: Math.max(0, 1 - overall.se ** 2),
    percentile: percentileOf(overallTheta),
    rarity: rarity(overallTheta),
    classification: classify(fsiq),
    domains,
    // The breakdown compares against the age-normed overall level so it stays consistent with FSIQ.
    types: typeScores(records, overallTheta),
    indexSpread: Math.max(...indexIqs) - Math.min(...indexIqs),
    flags,
    confidence: warnings === 0 && overall.se < 0.33 ? 'high' : warnings <= 1 ? 'moderate' : 'low',
    totalCorrect: records.filter((r) => r.correct).length,
    totalAdministered: all.length,
    durationMs: (session.finishedAt ?? Date.now()) - session.startedAt,
    activeMs: session.sections.reduce((sum, s) => sum + s.elapsedMs, 0),
    review: session.sections.flatMap((s) =>
      s.responses.map((r, i) => ({ ...r, domain: s.domain, number: i + 1 })),
    ),
  };
}

/**
 * Typical loading of each ability area on general ability (g) in adult batteries.
 * Area = G_LOADING·g + specific part, so the specific part has SD sqrt(1 − G_LOADING²).
 */
const G_LOADING = 0.8;

/**
 * Empirical-Bayes prior for an area score: centred on the ability shown in the *other*
 * sections rather than on the population mean. A short section's estimate is then pulled
 * toward the person's own level, so index scores don't all regress toward 100 and look
 * systematically weaker (or stronger) than the overall score.
 */
function domainPrior(session: Session, section: SectionState): { mean: number; sd: number } {
  const others = scoredResponses(session.sections.filter((s) => s !== section));
  if (others.length === 0) return { mean: 0, sd: 1 };
  const rest = estimateAbility(others);
  return {
    mean: G_LOADING * rest.theta,
    sd: Math.sqrt(1 - G_LOADING ** 2 + (G_LOADING * rest.se) ** 2),
  };
}

/**
 * |z| needed before a question type is called above or below expectation. Each report
 * compares ~10–16 types, so a looser cut-off would flag one or two types by chance alone.
 */
const TYPE_Z_THRESHOLD = 2;
const TYPE_MIN_ITEMS = 3;

function typeScores(records: ResponseRecord[], theta: number): TypeScore[] {
  const groups = new Map<string, ResponseRecord[]>();
  for (const r of records) {
    const key = questionTypeOf(r.item).key;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = Object.keys(QUESTION_TYPES);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(order, a) - rank(order, b))
    .map(([key, rs]) => {
      const type = questionTypeOf(rs[0].item);
      const probs = rs.map((r) => probability(theta, { a: r.item.a, b: r.item.b, c: guessingFloor(r.item) }));
      const expected = probs.reduce((s, p) => s + p, 0);
      const sd = Math.sqrt(probs.reduce((s, p) => s + p * (1 - p), 0));
      const correct = rs.filter((r) => r.correct).length;
      const z = sd > 0 ? (correct - expected) / sd : 0;
      const solved = rs.filter((r) => r.correct).map((r) => r.item.b);
      return {
        key,
        domain: type.domain,
        name: type.name,
        measures: type.measures,
        correct,
        total: rs.length,
        expected,
        z,
        verdict: rs.length < TYPE_MIN_ITEMS ? 'expected' : z >= TYPE_Z_THRESHOLD ? 'above' : z <= -TYPE_Z_THRESHOLD ? 'below' : 'expected',
        averageDifficulty: rs.reduce((s, r) => s + r.item.b, 0) / rs.length,
        hardestSolved: solved.length ? Math.max(...solved) : null,
        medianSeconds: median(rs.filter((r) => r.response !== null).map((r) => r.ms / 1000)),
      } satisfies TypeScore;
    });
}

function rank(order: string[], key: string): number {
  const i = order.indexOf(key);
  return i < 0 ? order.length : i;
}

function validityFlags(
  session: Session,
  records: ResponseRecord[],
  lz: number | null,
  fsiq: number,
): ValidityFlag[] {
  const flags: ValidityFlag[] = [];
  const choice = records.filter((r) => r.item.kind === 'choice' && r.response !== null);
  const rapid = choice.filter((r) => r.ms < RAPID_GUESS_MS).length;
  if (choice.length > 0 && rapid / choice.length >= 0.15) {
    flags.push({
      severity: 'warning',
      title: 'Many very fast answers',
      detail: `${rapid} of ${choice.length} multiple-choice answers were given in under 2 seconds — faster than the item can be read. Rapid guessing lowers the score; it likely underestimates your ability.`,
    });
  }
  if (lz !== null && lz < -1.96) {
    flags.push({
      severity: 'warning',
      title: 'Inconsistent response pattern',
      detail: `Some easy items were missed while harder ones were solved (person-fit lz = ${lz.toFixed(2)}). This usually points to lapses of attention, distraction or guessing, so the score is less certain than the interval suggests.`,
    });
  }
  if (session.focusLosses > 0) {
    flags.push({
      severity: session.focusLosses >= 3 ? 'warning' : 'info',
      title: 'Left the test window',
      detail: `The test window lost focus ${session.focusLosses} time${session.focusLosses === 1 ? '' : 's'} during the test. Interruptions and outside help both make the result less accurate.`,
    });
  }
  if (session.interruptions > 0) {
    flags.push({
      severity: 'info',
      title: 'Test was reloaded',
      detail: `The page was reloaded ${session.interruptions} time${session.interruptions === 1 ? '' : 's'} mid-question. Progress was restored and the interrupted question was replaced with a new one.`,
    });
  }
  if (fsiq > MEASUREMENT_CEILING || fsiq < MEASUREMENT_FLOOR) {
    flags.push({
      severity: 'info',
      title: 'Near the edge of the measurable range',
      detail: `This test measures most precisely between ${MEASUREMENT_FLOOR} and ${MEASUREMENT_CEILING}. Beyond that range there are too few items of matching difficulty to pin the score down, so read it as "${fsiq > MEASUREMENT_CEILING ? `above ${MEASUREMENT_CEILING}` : `below ${MEASUREMENT_FLOOR}`}".`,
    });
  }
  if (MODES[session.mode].id === 'quick') {
    flags.push({
      severity: 'info',
      title: 'Short form',
      detail: 'The quick test uses fewer items, so its confidence interval is wider. Take the comprehensive test for the most precise result.',
    });
  }
  return flags;
}

function toIq(theta: number): number {
  return Math.round(IQ_MEAN + IQ_SD * theta);
}

function percentileOf(theta: number): number {
  const p = normalCdf(theta) * 100;
  return p >= 99 || p <= 1 ? Math.round(p * 10) / 10 : Math.round(p);
}

function rarity(theta: number): string {
  const above = 1 - normalCdf(theta);
  if (theta <= 0) return 'Around or below the population average';
  const oneIn = Math.round(1 / above);
  return oneIn < 2 ? 'Around the population average' : `About 1 in ${oneIn.toLocaleString()} people score this high or higher`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
