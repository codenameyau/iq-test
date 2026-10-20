import type { Domain } from './types';

/**
 * Age norming for cognitive ability.
 *
 * Professional batteries (WAIS, Stanford-Binet) score each person against their own age group,
 * because abilities change across the lifespan: fluid reasoning, working memory, spatial ability
 * and quantitative reasoning peak in the early-to-mid 20s and decline gradually afterwards, while
 * verbal/crystallised ability keeps rising into middle age before a slow late decline
 * (Salthouse 2009; Hartshorne & Germine 2015).
 *
 * Each curve below gives the mean ability at a given age, in theta units (population SD = 1),
 * relative to the reference age of 30 — the age our base item difficulties are anchored to.
 * To express a score "for your age" we subtract this mean from the person's raw ability, so a
 * raw score that is average for a 25-year-old counts as above average for a 70-year-old.
 *
 * These are literature-informed approximations, not values measured on a normed sample; the
 * adjustment is deliberately modest and bounded.
 */

type Curve = [age: number, meanTheta: number][];

const CURVES: Record<Domain, Curve> = {
  matrices: [
    [16, 0.05], [22, 0.17], [30, 0.0], [40, -0.24], [50, -0.48], [60, -0.73], [70, -0.98], [85, -1.3],
  ],
  series: [
    [16, 0.04], [22, 0.16], [30, 0.0], [40, -0.22], [50, -0.45], [60, -0.68], [70, -0.92], [85, -1.2],
  ],
  spatial: [
    [16, 0.08], [22, 0.18], [30, 0.0], [40, -0.25], [50, -0.52], [60, -0.8], [70, -1.05], [85, -1.35],
  ],
  memory: [
    [16, 0.02], [25, 0.15], [30, 0.0], [40, -0.26], [50, -0.52], [60, -0.8], [70, -1.08], [85, -1.45],
  ],
  verbal: [
    [16, -0.35], [20, -0.15], [25, -0.05], [30, 0.0], [40, 0.1], [50, 0.15], [60, 0.12], [70, 0.03], [80, -0.12], [90, -0.3],
  ],
};

/** Below/above this range the curves are extrapolated flat and the result is flagged. */
export const AGE_NORM_MIN = 16;
export const AGE_NORM_MAX = 90;

function interpolate(curve: Curve, age: number): number {
  const x = Math.min(AGE_NORM_MAX, Math.max(AGE_NORM_MIN, age));
  if (x <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [a1, m1] = curve[i];
    if (x <= a1) {
      const [a0, m0] = curve[i - 1];
      return m0 + ((m1 - m0) * (x - a0)) / (a1 - a0);
    }
  }
  return last[1];
}

/** Mean ability at `age` for a domain, in theta units, relative to age 30. Subtract to age-norm. */
export function ageMeanTheta(domain: Domain, age: number): number {
  return interpolate(CURVES[domain], age);
}

export function hasReliableAgeNorm(age: number): boolean {
  return age >= AGE_NORM_MIN && age <= AGE_NORM_MAX;
}
