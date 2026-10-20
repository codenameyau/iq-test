import { describe, expect, it } from 'vitest';
import type { ModeId } from './config';
import { createSession, currentSection, guessingFloor, startSection, submitAnswer, tick, type Session } from './engine';
import { probability } from './irt';
import { createRng } from './rng';
import { buildReport } from './scoring';

/**
 * Simulated test-takers with a known true ability answer according to the IRT model.
 * This checks the adaptive engine + scoring pipeline recovers that ability and that
 * the reported 95% intervals are honest. It cannot validate the item calibrations themselves.
 */
function simulate(mode: ModeId, trueTheta: number, seed: number): Session {
  const rng = createRng(seed * 7919 + 13);
  const session = createSession(mode, false, [], seed);
  while (session.phase !== 'done') {
    if (session.phase === 'section-intro') startSection(session);
    const item = currentSection(session).current!.item;
    const p = probability(trueTheta, { a: item.a, b: item.b, c: guessingFloor(item) });
    const correct = rng.next() < p;
    tick(session, 20_000);
    if (session.phase !== 'active' || currentSection(session).current?.item !== item) continue;
    if (item.kind === 'choice') {
      submitAnswer(session, correct ? item.answer : (item.answer + 1) % item.options.length);
    } else {
      submitAnswer(session, correct ? item.answer : 'X');
    }
  }
  return session;
}

describe('index scores', () => {
  it('centre on the overall score for people whose abilities are equal across areas', () => {
    for (const trueTheta of [-1.5, 1.5]) {
      const gaps: number[] = [];
      for (let seed = 1; seed <= 15; seed++) {
        const report = buildReport(simulate('standard', trueTheta, 500 + seed));
        for (const d of report.domains) gaps.push(d.iq - report.fsiq);
      }
      const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      expect(Math.abs(meanGap)).toBeLessThanOrEqual(3);
    }
  });
});

describe('question-type breakdown', () => {
  it('rarely flags a type for people with no real differences between types', () => {
    let flags = 0;
    const runs = 40;
    for (let seed = 1; seed <= runs; seed++) {
      const report = buildReport(simulate('comprehensive', (seed % 5) - 2, 900 + seed));
      flags += report.types.filter((t) => t.verdict !== 'expected').length;
    }
    expect(flags / runs).toBeLessThanOrEqual(0.6);
  });
});

describe('adaptive scoring recovers known ability', () => {
  const cases: [ModeId, number][] = [
    ['quick', 9],
    ['standard', 7],
    ['comprehensive', 6],
  ];
  for (const [mode, maxRmse] of cases) {
    it(`${mode}: RMSE ≤ ${maxRmse} IQ points and CI coverage ≥ 85%`, () => {
      const errors: number[] = [];
      let covered = 0;
      let runs = 0;
      for (const trueTheta of [-2, -1, 0, 1, 2]) {
        for (let seed = 1; seed <= 12; seed++) {
          const report = buildReport(simulate(mode, trueTheta, seed + Math.round(trueTheta * 100)));
          const trueIq = 100 + 15 * trueTheta;
          errors.push(report.fsiq - trueIq);
          if (trueIq >= report.ciLow && trueIq <= report.ciHigh) covered++;
          runs++;
        }
      }
      const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
      expect(rmse).toBeLessThanOrEqual(maxRmse);
      expect(covered / runs).toBeGreaterThanOrEqual(0.85);
    });
  }
});
