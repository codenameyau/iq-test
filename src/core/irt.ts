/** Three-parameter logistic IRT model, EAP ability estimation and person-fit. */

export interface ScoredResponse {
  a: number;
  b: number;
  /** Guessing floor: 1 / number of options for multiple choice, 0 for free recall. */
  c: number;
  correct: boolean;
}

export interface AbilityEstimate {
  theta: number;
  /** Posterior standard deviation, used as the standard error of measurement. */
  se: number;
}

const GRID_MIN = -4.5;
const GRID_MAX = 4.5;
const GRID_STEP = 0.025;
const GRID: number[] = [];
for (let t = GRID_MIN; t <= GRID_MAX + 1e-9; t += GRID_STEP) GRID.push(t);

export function probability(theta: number, { a, b, c }: Pick<ScoredResponse, 'a' | 'b' | 'c'>): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/** Expected-a-posteriori estimate with a normal prior. */
export function estimateAbility(
  responses: readonly ScoredResponse[],
  prior: { mean: number; sd: number } = { mean: 0, sd: 1 },
): AbilityEstimate {
  const logPost = GRID.map((theta) => {
    let lp = -0.5 * ((theta - prior.mean) / prior.sd) ** 2;
    for (const r of responses) {
      const p = clampProbability(probability(theta, r));
      lp += r.correct ? Math.log(p) : Math.log(1 - p);
    }
    return lp;
  });
  const max = Math.max(...logPost);
  let total = 0;
  let mean = 0;
  const weights = logPost.map((lp, i) => {
    const w = Math.exp(lp - max);
    total += w;
    mean += w * GRID[i];
    return w;
  });
  mean /= total;
  let variance = 0;
  weights.forEach((w, i) => (variance += w * (GRID[i] - mean) ** 2));
  return { theta: mean, se: Math.sqrt(variance / total) };
}

/**
 * Difficulty that maximises 3PL Fisher information at `theta`
 * (slightly above theta when guessing is possible).
 */
export function optimalDifficulty(theta: number, a: number, c: number): number {
  return theta + Math.log((1 + Math.sqrt(1 + 8 * c)) / 2) / a;
}

/**
 * Standardised log-likelihood person-fit statistic (lz, Drasgow et al. 1985).
 * Strongly negative values (< -1.96) indicate an aberrant response pattern,
 * e.g. missing easy items while solving hard ones.
 */
export function personFit(responses: readonly ScoredResponse[], theta: number): number | null {
  if (responses.length < 8) return null;
  let observed = 0;
  let expected = 0;
  let variance = 0;
  for (const r of responses) {
    const p = clampProbability(probability(theta, r));
    const logit = Math.log(p / (1 - p));
    observed += r.correct ? Math.log(p) : Math.log(1 - p);
    expected += p * Math.log(p) + (1 - p) * Math.log(1 - p);
    variance += p * (1 - p) * logit * logit;
  }
  return variance > 0 ? (observed - expected) / Math.sqrt(variance) : null;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

function clampProbability(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}
