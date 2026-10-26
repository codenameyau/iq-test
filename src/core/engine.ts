import { sectionsFor, type ModeId } from './config';
import { difficultyForSuccess, estimateAbility, type ScoredResponse } from './irt';
import { createRng, hashSeed, type Rng } from './rng';
import type { Domain, Item, ItemGenerator, ItemPosition } from './types';
import type { ParticipantInfo } from './participant';
import { matricesGenerator } from '../items/matrices';
import { memoryGenerator, normalizeRecall } from '../items/memory';
import { seriesGenerator } from '../items/series';
import { spatialGenerator } from '../items/spatial';
import { verbalGenerator } from '../items/verbal';

export const GENERATORS: Record<Domain, ItemGenerator> = {
  matrices: matricesGenerator,
  verbal: verbalGenerator,
  spatial: spatialGenerator,
  series: seriesGenerator,
  memory: memoryGenerator,
};

/** Typical guessing floor per domain, used only for choosing the next target difficulty. */
const TARGET_GUESSING: Record<Domain, number> = {
  matrices: 1 / 8,
  series: 1 / 6,
  verbal: 1 / 5,
  spatial: 1 / 4,
  memory: 0,
};
const TARGET_DISCRIMINATION = 1.4;
/**
 * Chance of answering correctly that each question is aimed at. Maximum-information targeting
 * (~55%) leaves people failing long runs of questions; ~70% costs little precision and keeps
 * the test feeling fair.
 */
const TARGET_SUCCESS = 0.7;
/** Section openers and the question after two misses in a row are aimed at this easier level. */
const EASY_SUCCESS = 0.85;

export interface ResponseRecord {
  item: Item;
  /** Option index or typed text. Every question is answered, so this is never null. */
  response: number | string;
  correct: boolean;
  ms: number;
}

export interface SectionState {
  domain: Domain;
  items: number;
  /** Suggested time for the section, shown as guidance only. There is no time limit. */
  seconds: number;
  /** Time spent in this section so far, counting up. */
  elapsedMs: number;
  responses: ResponseRecord[];
  current: { item: Item; elapsedMs: number } | null;
}

export type Phase = 'section-intro' | 'active' | 'done';

export interface Session {
  version: 1;
  id: string;
  seed: number;
  mode: ModeId;
  nonverbal: boolean;
  startedAt: number;
  finishedAt: number | null;
  sectionIndex: number;
  phase: Phase;
  sections: SectionState[];
  /** Monotonic counter so every draw gets a fresh, reproducible RNG stream. */
  draws: number;
  /** Items shown but abandoned by a page reload; never shown again. */
  abandonedIds: string[];
  /** Items seen in earlier tests on this device; avoided unless no item near the target remains. */
  priorSeenIds: string[];
  interruptions: number;
  focusLosses: number;
  /** Collected on the intake screen shown after the final section, before results. */
  participant: ParticipantInfo | null;
}

export function createSession(
  mode: ModeId,
  nonverbal: boolean,
  priorSeenIds: string[] = [],
  seed = randomSeed(),
): Session {
  return {
    version: 1,
    id: `${Date.now().toString(36)}-${seed.toString(36)}`,
    seed,
    mode,
    nonverbal,
    startedAt: Date.now(),
    finishedAt: null,
    sectionIndex: 0,
    phase: 'section-intro',
    sections: sectionsFor(mode, nonverbal).map((s) => ({
      domain: s.domain,
      items: s.items,
      seconds: s.seconds,
      elapsedMs: 0,
      responses: [],
      current: null,
    })),
    draws: 0,
    abandonedIds: [],
    priorSeenIds,
    interruptions: 0,
    focusLosses: 0,
    participant: null,
  };
}

export function setParticipant(session: Session, participant: ParticipantInfo): void {
  session.participant = participant;
}

export function currentSection(session: Session): SectionState {
  return session.sections[session.sectionIndex];
}

export function guessingFloor(item: Item): number {
  return item.kind === 'choice' ? 1 / item.options.length : 0;
}

export function toScored(record: ResponseRecord): ScoredResponse {
  return { a: record.item.a, b: record.item.b, c: guessingFloor(record.item), correct: record.correct };
}

export function scoredResponses(sections: readonly SectionState[]): ScoredResponse[] {
  return sections.flatMap((s) => s.responses.map(toScored));
}

export function startSection(session: Session): void {
  session.phase = 'active';
  drawNextItem(session);
}

export function isCorrect(item: Item, response: number | string): boolean {
  return item.kind === 'choice'
    ? response === item.answer
    : normalizeRecall(String(response)) === item.answer;
}

export function submitAnswer(session: Session, response: number | string): void {
  const section = currentSection(session);
  if (!section.current) return;
  const { item, elapsedMs } = section.current;
  section.responses.push({ item, response, correct: isCorrect(item, response), ms: Math.round(elapsedMs) });
  section.current = null;
  if (section.responses.length >= section.items) finishSection(session);
  else drawNextItem(session);
}

/** Advances the count-up clock for the current section and item. There is no time limit. */
export function tick(session: Session, deltaMs: number): void {
  if (session.phase !== 'active') return;
  const section = currentSection(session);
  section.elapsedMs += deltaMs;
  if (section.current) section.current.elapsedMs += deltaMs;
}

/**
 * Called when a saved session is reopened mid-item. The on-screen item is replaced so a
 * reload can't be used to pause the clock while still looking at the same question.
 */
export function resumeAfterReload(session: Session): void {
  if (session.phase !== 'active') return;
  const section = currentSection(session);
  if (section.current) {
    session.abandonedIds.push(section.current.item.id);
    section.current = null;
    session.interruptions++;
    drawNextItem(session);
  }
}

function finishSection(session: Session): void {
  if (session.sectionIndex < session.sections.length - 1) {
    session.sectionIndex++;
    session.phase = 'section-intro';
  } else {
    session.phase = 'done';
    session.finishedAt = Date.now();
  }
}

function drawNextItem(session: Session): void {
  const section = currentSection(session);
  const rng = createRng(hashSeed(session.seed, section.domain, session.draws++));
  const jitter = (rng.next() - 0.5) * 0.4;
  const target = nextTarget(session, section) + jitter;
  const position = { index: section.responses.length, count: section.items };
  section.current = { item: pickItem(GENERATORS[section.domain], rng, target, session, position), elapsedMs: 0 };
}

/** Max distance from the target difficulty we accept in order to avoid a previously seen item. */
const FRESH_ITEM_TOLERANCE = 0.75;

function pickItem(generator: ItemGenerator, rng: Rng, target: number, session: Session, position: ItemPosition): Item {
  const sessionIds = usedIds(session);
  const freshIds = new Set([...sessionIds, ...session.priorSeenIds]);
  try {
    const fresh = generator.generate(rng, target, freshIds, position);
    if (Math.abs(fresh.b - target) <= FRESH_ITEM_TOLERANCE) return fresh;
  } catch {
    // Every nearby item was seen in an earlier test; fall back to session-only avoidance.
  }
  return generator.generate(rng, target, sessionIds, position);
}

export function shownItemIds(session: Session): string[] {
  return [...usedIds(session)];
}

function nextTarget(session: Session, section: SectionState): number {
  const overall = estimateAbility(scoredResponses(session.sections));
  const own = estimateAbility(section.responses.map(toScored), { mean: overall.theta, sd: 1 });
  const recent = section.responses.slice(-2);
  const easier = section.responses.length === 0 || (recent.length === 2 && recent.every((r) => !r.correct));
  return difficultyForSuccess(
    own.theta,
    TARGET_DISCRIMINATION,
    TARGET_GUESSING[section.domain],
    easier ? EASY_SUCCESS : TARGET_SUCCESS,
  );
}

function usedIds(session: Session): Set<string> {
  const ids = new Set(session.abandonedIds);
  for (const s of session.sections) for (const r of s.responses) ids.add(r.item.id);
  return ids;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
