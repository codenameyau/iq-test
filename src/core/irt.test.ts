import { describe, expect, it } from 'vitest';
import { difficultyForSuccess, estimateAbility, normalCdf, personFit, probability } from './irt';

describe('irt', () => {
  it('3PL probability is c at -inf, 1 at +inf and (1+c)/2 at theta = b', () => {
    const item = { a: 1.5, b: 0.5, c: 0.2 };
    expect(probability(-20, item)).toBeCloseTo(0.2, 5);
    expect(probability(20, item)).toBeCloseTo(1, 5);
    expect(probability(0.5, item)).toBeCloseTo(0.6, 5);
  });

  it('EAP with no responses returns the prior', () => {
    const est = estimateAbility([]);
    expect(est.theta).toBeCloseTo(0, 2);
    expect(est.se).toBeCloseTo(1, 2);
  });

  it('EAP moves up with correct answers and shrinks SE', () => {
    const items = [-1, -0.5, 0, 0.5, 1].map((b) => ({ a: 1.5, b, c: 0, correct: true }));
    const est = estimateAbility(items);
    expect(est.theta).toBeGreaterThan(1);
    expect(est.se).toBeLessThan(1);
  });

  it('difficultyForSuccess picks an item answered correctly at the requested rate', () => {
    for (const c of [0, 0.125, 0.25]) {
      for (const success of [0.5, 0.7, 0.85]) {
        const b = difficultyForSuccess(0.3, 1.4, c, success);
        expect(probability(0.3, { a: 1.4, b, c })).toBeCloseTo(success, 6);
      }
    }
    expect(difficultyForSuccess(0, 1.4, 0, 0.7)).toBeLessThan(0);
  });

  it('person-fit flags a reversed (aberrant) pattern', () => {
    const bs = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];
    const consistent = bs.map((b) => ({ a: 1.5, b, c: 0, correct: b < 0.25 }));
    const reversed = bs.map((b) => ({ a: 1.5, b, c: 0, correct: b > 0.25 }));
    expect(personFit(consistent, 0.25)!).toBeGreaterThan(-1);
    expect(personFit(reversed, 0.25)!).toBeLessThan(-1.96);
  });

  it('normal CDF matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});
