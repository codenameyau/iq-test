import type { ChoiceItem, ItemGenerator, Visual } from '../core/types';
import type { Rng } from '../core/rng';

/**
 * Quantitative series and number-matrix items.
 * If any easier family fits the shown terms, that easier strategy is the real
 * difficulty, so the draft is discarded. Shown terms stay ≤ 999 and the answer
 * ≤ 1999; a multiplication used to reach the answer is at most two-digit ×
 * one-digit, or ×10 / ×100.
 */

const SERIES_PROMPT = 'Which number comes next?';
const MATRIX_PROMPT = 'Which number replaces the question mark?';
const SERIES_TAG = 'ns-series';
const MATRIX_TAG = 'ns-matrix';
const ATTEMPTS_PER_FAMILY = 50;
const MAX_SHOWN = 999;
const MAX_ANSWER = 1999;

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];

type FamilyName =
  | 'plus-k'
  | 'minus-or-double'
  | 'increasing-diff'
  | 'times3-square-alt'
  | 'interleaved'
  | 'second-diff'
  | 'alt-ops'
  | 'fibonacci'
  | 'geo-diff-poly'
  | 'mixed-interleave'
  | 'affine-third'
  | 'compound'
  | 'row-sum'
  | 'row-product'
  | 'row-mul-minus'
  | 'row-double-sum'
  | 'row-col-arith'
  | 'row-col-combo';

type FamilyKind = 'series' | 'matrix';

interface Family {
  name: FamilyName;
  b: number;
  a: number;
  kind: FamilyKind;
}

interface Draft {
  shown: number[];
  answer: number;
  explanation: string;
  stimulus: Visual;
}

const FAMILIES: readonly Family[] = [
  { name: 'plus-k', b: -2.4, a: 1.3, kind: 'series' },
  { name: 'minus-or-double', b: -1.8, a: 1.3, kind: 'series' },
  { name: 'increasing-diff', b: -1.1, a: 1.4, kind: 'series' },
  { name: 'times3-square-alt', b: -0.6, a: 1.4, kind: 'series' },
  { name: 'interleaved', b: 0, a: 1.5, kind: 'series' },
  { name: 'row-sum', b: -1.2, a: 1.3, kind: 'matrix' },
  { name: 'row-product', b: -0.4, a: 1.4, kind: 'matrix' },
  { name: 'row-double-sum', b: 0.3, a: 1.4, kind: 'matrix' },
  { name: 'second-diff', b: 0.4, a: 1.5, kind: 'series' },
  { name: 'row-mul-minus', b: 0.6, a: 1.5, kind: 'matrix' },
  { name: 'alt-ops', b: 0.8, a: 1.5, kind: 'series' },
  { name: 'fibonacci', b: 0.9, a: 1.5, kind: 'series' },
  { name: 'geo-diff-poly', b: 1.3, a: 1.6, kind: 'series' },
  { name: 'row-col-arith', b: 1.3, a: 1.5, kind: 'matrix' },
  { name: 'mixed-interleave', b: 1.7, a: 1.6, kind: 'series' },
  { name: 'row-col-combo', b: 2.0, a: 1.6, kind: 'matrix' },
  { name: 'affine-third', b: 2.1, a: 1.6, kind: 'series' },
  { name: 'compound', b: 2.5, a: 1.6, kind: 'series' },
];

function differences(terms: number[]): number[] {
  const diffs: number[] = [];
  for (let i = 1; i < terms.length; i++) diffs.push(terms[i] - terms[i - 1]);
  return diffs;
}

function constantDifference(terms: number[]): number | null {
  if (terms.length < 2) return null;
  const step = terms[1] - terms[0];
  for (let i = 2; i < terms.length; i++) {
    if (terms[i] - terms[i - 1] !== step) return null;
  }
  return step;
}

function pack(...values: Array<number | null>): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (value === null || !Number.isInteger(value) || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function fitPlusK(terms: number[]): number | null {
  if (terms.length < 4) return null;
  const step = constantDifference(terms);
  if (step === null || step < 2 || step > 9) return null;
  return terms[terms.length - 1] + step;
}

function fitMinusK(terms: number[]): number | null {
  if (terms.length < 4) return null;
  const step = constantDifference(terms);
  if (step === null || step > -2 || step < -9) return null;
  return terms[terms.length - 1] + step;
}

function fitDouble(terms: number[]): number | null {
  if (terms.length < 4) return null;
  for (let i = 1; i < terms.length; i++) {
    if (terms[i - 1] === 0 || terms[i] !== terms[i - 1] * 2) return null;
  }
  return terms[terms.length - 1] * 2;
}

function fitTimes3(terms: number[]): number | null {
  if (terms.length < 4) return null;
  for (let i = 1; i < terms.length; i++) {
    if (terms[i - 1] === 0 || terms[i] !== terms[i - 1] * 3) return null;
  }
  return terms[terms.length - 1] * 3;
}

function fitIncreasing(terms: number[]): number | null {
  if (terms.length < 4) return null;
  const diffs = differences(terms);
  if (diffs.length < 3) return null;
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] !== diffs[i - 1] + 1) return null;
  }
  return terms[terms.length - 1] + diffs[diffs.length - 1] + 1;
}

function integerRoot(value: number, power: 2 | 3): number | null {
  if (power === 2) {
    if (value < 0) return null;
    const root = Math.round(Math.sqrt(value));
    return root * root === value ? root : null;
  }
  const root = Math.round(Math.cbrt(value));
  return root * root * root === value ? root : null;
}

function fitSquares(terms: number[]): number | null {
  if (terms.length < 4) return null;
  const roots: number[] = [];
  for (const term of terms) {
    const root = integerRoot(term, 2);
    if (root === null) return null;
    roots.push(root);
  }
  for (let i = 1; i < roots.length; i++) {
    if (roots[i] !== roots[i - 1] + 1) return null;
  }
  const next = roots[roots.length - 1] + 1;
  return next * next;
}

function fitAltAddSub(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const diffs = differences(terms);
  if (diffs.length < 4) return null;
  const add = diffs[0];
  const sub = diffs[1];
  if (!(add > 0 && sub < 0) || add === sub) return null;
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i] !== (i % 2 === 0 ? add : sub)) return null;
  }
  const nextDiff = (terms.length - 1) % 2 === 0 ? add : sub;
  return terms[terms.length - 1] + nextDiff;
}

function fitInterleaved(terms: number[]): number | null {
  if (terms.length < 6) return null;
  const even: number[] = [];
  const odd: number[] = [];
  for (let i = 0; i < terms.length; i++) {
    if (i % 2 === 0) even.push(terms[i]);
    else odd.push(terms[i]);
  }
  if (even.length < 3 || odd.length < 3) return null;
  const evenStep = constantDifference(even);
  const oddStep = constantDifference(odd);
  if (evenStep === null || oddStep === null || evenStep === oddStep) return null;
  if (constantDifference(terms) !== null) return null;
  if (terms.length % 2 === 0) return even[even.length - 1] + evenStep;
  return odd[odd.length - 1] + oddStep;
}

function fitSecondDiff(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const diffs = differences(terms);
  const step = constantDifference(diffs);
  if (step === null || Math.abs(step) < 2) return null;
  return terms[terms.length - 1] + diffs[diffs.length - 1] + step;
}

function fitAltPhase(terms: number[], mulFirst: boolean): number | null {
  if (terms.length < 5) return null;
  const addend = mulFirst ? terms[2] - terms[1] : terms[1] - terms[0];
  if (addend === 0) return null;
  for (let i = 1; i < terms.length; i++) {
    const multiply = mulFirst ? i % 2 === 1 : i % 2 === 0;
    const expected = multiply ? terms[i - 1] * 2 : terms[i - 1] + addend;
    if (terms[i] !== expected) return null;
  }
  const multiplyNext = mulFirst ? terms.length % 2 === 1 : terms.length % 2 === 0;
  return multiplyNext ? terms[terms.length - 1] * 2 : terms[terms.length - 1] + addend;
}

function fitDoublePlusOne(terms: number[]): number | null {
  if (terms.length < 4) return null;
  for (let i = 1; i < terms.length; i++) {
    if (terms[i] !== terms[i - 1] * 2 + 1) return null;
  }
  return terms[terms.length - 1] * 2 + 1;
}

function fitFib(terms: number[]): number | null {
  if (terms.length < 5) return null;
  for (let i = 2; i < terms.length; i++) {
    if (terms[i] !== terms[i - 1] + terms[i - 2]) return null;
  }
  if (terms.every((term) => term === 0)) return null;
  return terms[terms.length - 1] + terms[terms.length - 2];
}

function fitGeoDiff(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const diffs = differences(terms);
  if (diffs.length < 4 || diffs.some((diff) => diff === 0)) return null;
  if (diffs[1] % diffs[0] !== 0) return null;
  const ratio = diffs[1] / diffs[0];
  if (!Number.isInteger(ratio) || Math.abs(ratio) < 2) return null;
  for (let i = 2; i < diffs.length; i++) {
    if (diffs[i] !== diffs[i - 1] * ratio) return null;
  }
  return terms[terms.length - 1] + diffs[diffs.length - 1] * ratio;
}

function fitSquareDiffs(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const diffs = differences(terms);
  if (diffs.length < 4) return null;
  const roots: number[] = [];
  for (const diff of diffs) {
    if (diff <= 0) return null;
    const root = Math.round(Math.sqrt(diff));
    if (root * root !== diff || root < 1) return null;
    roots.push(root);
  }
  for (let i = 1; i < roots.length; i++) {
    if (roots[i] !== roots[i - 1] + 1) return null;
  }
  const nextRoot = roots[roots.length - 1] + 1;
  return terms[terms.length - 1] + nextRoot * nextRoot;
}

function fitCubes(terms: number[]): number | null {
  if (terms.length < 4) return null;
  const roots: number[] = [];
  for (const term of terms) {
    const root = integerRoot(term, 3);
    if (root === null) return null;
    roots.push(root);
  }
  for (let i = 1; i < roots.length; i++) {
    if (roots[i] !== roots[i - 1] + 1) return null;
  }
  const next = roots[roots.length - 1] + 1;
  return next * next * next;
}

function geometricRatio(terms: number[]): number | null {
  if (terms.length < 3 || terms[0] === 0) return null;
  if (terms[1] % terms[0] !== 0) return null;
  const ratio = terms[1] / terms[0];
  if (ratio !== 2 && ratio !== 3) return null;
  for (let i = 1; i < terms.length; i++) {
    if (terms[i - 1] === 0 || terms[i] !== terms[i - 1] * ratio) return null;
  }
  return ratio;
}

function fitMixed(terms: number[]): number | null {
  if (terms.length < 6) return null;
  const even: number[] = [];
  const odd: number[] = [];
  for (let i = 0; i < terms.length; i++) {
    if (i % 2 === 0) even.push(terms[i]);
    else odd.push(terms[i]);
  }
  if (even.length < 3 || odd.length < 3) return null;
  const evenRatio = geometricRatio(even);
  const oddRatio = geometricRatio(odd);
  const evenStep = constantDifference(even);
  const oddStep = constantDifference(odd);
  if (evenRatio && oddStep !== null && evenStep === null && oddStep !== 0) {
    if (terms.length % 2 === 0) return even[even.length - 1] * evenRatio;
    return odd[odd.length - 1] + oddStep;
  }
  if (oddRatio && evenStep !== null && oddStep === null && evenStep !== 0) {
    if (terms.length % 2 === 1) return odd[odd.length - 1] * oddRatio;
    return even[even.length - 1] + evenStep;
  }
  return null;
}

function fitPrimeDiffs(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const diffs = differences(terms);
  for (let start = 0; start + diffs.length < PRIMES.length; start++) {
    let matches = true;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i] !== PRIMES[start + i]) matches = false;
    }
    if (!matches) continue;
    return terms[terms.length - 1] + PRIMES[start + diffs.length];
  }
  return null;
}

function fitFibDiffs(terms: number[]): number | null {
  if (terms.length < 6) return null;
  const diffs = differences(terms);
  if (diffs.length < 5) return null;
  for (let i = 2; i < diffs.length; i++) {
    if (diffs[i] !== diffs[i - 1] + diffs[i - 2]) return null;
  }
  const nextDiff = diffs[diffs.length - 1] + diffs[diffs.length - 2];
  return terms[terms.length - 1] + nextDiff;
}

function fitThird(terms: number[]): number | null {
  if (terms.length < 6) return null;
  const first = differences(terms);
  const second = differences(first);
  const third = differences(second);
  if (third.length < 2) return null;
  const step = third[0];
  if (step === 0 || third.some((value) => value !== step)) return null;
  if (second.every((value) => value === second[0])) return null;
  const nextSecond = second[second.length - 1] + step;
  const nextFirst = first[first.length - 1] + nextSecond;
  return terms[terms.length - 1] + nextFirst;
}

function fitSum3(terms: number[]): number | null {
  if (terms.length < 6) return null;
  for (let i = 3; i < terms.length; i++) {
    if (terms[i] !== terms[i - 1] + terms[i - 2] + terms[i - 3]) return null;
  }
  const n = terms.length;
  return terms[n - 1] + terms[n - 2] + terms[n - 3];
}

function fitAltFactors(terms: number[]): number | null {
  if (terms.length < 6) return null;
  const diffs = differences(terms);
  if (diffs.length < 5 || diffs.some((diff) => diff === 0)) return null;
  if (diffs[1] % diffs[0] !== 0 || diffs[2] % diffs[1] !== 0) return null;
  const firstFactor = diffs[1] / diffs[0];
  const secondFactor = diffs[2] / diffs[1];
  if (!Number.isInteger(firstFactor) || !Number.isInteger(secondFactor)) return null;
  if (Math.abs(firstFactor) < 2 || Math.abs(secondFactor) < 2 || firstFactor === secondFactor) {
    return null;
  }
  for (let i = 0; i < diffs.length - 1; i++) {
    const factor = i % 2 === 0 ? firstFactor : secondFactor;
    if (diffs[i + 1] !== diffs[i] * factor) return null;
  }
  const nextFactor = (diffs.length - 1) % 2 === 0 ? firstFactor : secondFactor;
  return terms[terms.length - 1] + diffs[diffs.length - 1] * nextFactor;
}

function fitPosition(terms: number[]): number | null {
  if (terms.length < 5) return null;
  const offset = terms[1] - terms[0] * 2;
  for (let i = 1; i < terms.length; i++) {
    if (terms[i] !== terms[i - 1] * (i + 1) + offset) return null;
  }
  return terms[terms.length - 1] * (terms.length + 1) + offset;
}

function arithStep(x: number, y: number, z: number): number | null {
  const first = y - x;
  const second = z - y;
  if (first !== second || first === 0) return null;
  return first;
}

function fitRowSum(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [a, b, c, d, e, f, g, h] = shown;
  if (c !== a + b || f !== d + e) return null;
  return g + h;
}

function fitRowProduct(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [a, b, c, d, e, f, g, h] = shown;
  if (c !== a * b || f !== d * e) return null;
  return g * h;
}

function fitRowMulMinus(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [a, b, c, d, e, f, g, h] = shown;
  if (c !== a * b - a || f !== d * e - d) return null;
  return g * h - g;
}

function fitRowDoubleSum(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [a, b, c, d, e, f, g, h] = shown;
  if (c !== (a + b) * 2 || f !== (d + e) * 2) return null;
  return (g + h) * 2;
}

function fitRowColCombo(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [, b, c, d, e, f, g, h] = shown;
  if (e !== 2 * b + d || f !== 2 * c + e || h !== 2 * e + g) return null;
  return 2 * f + h;
}

function fitRowColArith(shown: number[]): number | null {
  if (shown.length !== 8) return null;
  const [a, b, c, d, e, f, g, h] = shown;
  if (arithStep(a, b, c) === null || arithStep(d, e, f) === null) return null;
  if (arithStep(a, d, g) === null || arithStep(b, e, h) === null) return null;
  if (h === g || f === c) return null;
  const fromRow = h + (h - g);
  const fromCol = f + (f - c);
  return fromRow === fromCol ? fromRow : null;
}

function seriesPredictions(name: FamilyName, terms: number[]): number[] {
  switch (name) {
    case 'plus-k':
      return pack(fitPlusK(terms));
    case 'minus-or-double':
      return pack(fitMinusK(terms), fitDouble(terms));
    case 'increasing-diff':
      return pack(fitIncreasing(terms));
    case 'times3-square-alt':
      return pack(fitTimes3(terms), fitSquares(terms), fitAltAddSub(terms));
    case 'interleaved':
      return pack(fitInterleaved(terms));
    case 'second-diff':
      return pack(fitSecondDiff(terms));
    case 'alt-ops':
      return pack(fitAltPhase(terms, true), fitAltPhase(terms, false), fitDoublePlusOne(terms));
    case 'fibonacci':
      return pack(fitFib(terms));
    case 'geo-diff-poly':
      return pack(fitGeoDiff(terms), fitSquareDiffs(terms), fitCubes(terms));
    case 'mixed-interleave':
      return pack(fitMixed(terms), fitPrimeDiffs(terms));
    case 'affine-third':
      return pack(fitFibDiffs(terms), fitThird(terms));
    case 'compound':
      return pack(fitSum3(terms), fitAltFactors(terms), fitPosition(terms));
    default:
      return [];
  }
}

function matrixPredictions(name: FamilyName, terms: number[]): number[] {
  switch (name) {
    case 'row-sum':
      return pack(fitRowSum(terms));
    case 'row-product':
      return pack(fitRowProduct(terms));
    case 'row-mul-minus':
      return pack(fitRowMulMinus(terms));
    case 'row-double-sum':
      return pack(fitRowDoubleSum(terms));
    case 'row-col-arith':
      return pack(fitRowColArith(terms));
    case 'row-col-combo':
      return pack(fitRowColCombo(terms));
    default:
      return [];
  }
}

function predictionsFor(family: Family, terms: number[]): number[] {
  return family.kind === 'matrix' ? matrixPredictions(family.name, terms) : seriesPredictions(family.name, terms);
}

function productAllowed(left: number, right: number): boolean {
  const a = Math.abs(left);
  const b = Math.abs(right);
  if (a === 10 || a === 100 || b === 10 || b === 100) return true;
  return Math.min(a, b) <= 9 && Math.max(a, b) <= 99;
}

function productsInExplanationOk(explanation: string): boolean {
  for (const match of explanation.matchAll(/(\d+)\s*×\s*(\d+)/g)) {
    if (!productAllowed(Number(match[1]), Number(match[2]))) return false;
  }
  return true;
}

function sequenceOk(shown: number[], answer: number): boolean {
  if (shown.length < 5 || shown.length > 8) return false;
  if (!Number.isInteger(answer) || answer < 0 || answer > MAX_ANSWER) return false;
  return shown.every((value) => Number.isInteger(value) && value >= 0 && value <= MAX_SHOWN);
}

function seriesStimulus(shown: number[]): Visual {
  return { type: 'text', text: `${shown.join(', ')}, ?` };
}

function describeAdd(base: number, delta: number, result: number): string {
  if (delta >= 0) return `${base} + ${delta} = ${result}`;
  return `${base} - ${-delta} = ${result}`;
}

function matrixSvg(rows: readonly (readonly number[])[]): string {
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 330">';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * 115;
      const y = row * 115;
      const missing = row === 2 && col === 2;
      const dash = missing ? ' stroke-dasharray="6 4"' : '';
      svg += `<rect x="${x}" y="${y}" width="100" height="100" rx="6" fill="#ffffff" stroke="#e5e7eb"${dash}/>`;
      const label = missing ? '?' : String(rows[row][col]);
      const fill = missing ? '#9ca3af' : '#1f2937';
      svg += `<text x="${x + 50}" y="${y + 50}" fill="${fill}" font-family="system-ui, sans-serif" font-size="34" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    }
  }
  svg += '</svg>';
  return svg;
}

function matrixDraft(rows: readonly (readonly number[])[], explanation: string): Draft {
  const shown = [rows[0][0], rows[0][1], rows[0][2], rows[1][0], rows[1][1], rows[1][2], rows[2][0], rows[2][1]];
  return {
    shown,
    answer: rows[2][2],
    explanation,
    stimulus: { type: 'svg', svg: matrixSvg(rows) },
  };
}

function seriesSeeds(shown: number[], answer: number): number[] {
  const diffs = differences(shown);
  const last = shown[shown.length - 1];
  const lastDiff = diffs[diffs.length - 1] ?? 1;
  const prevDiff = diffs.length >= 2 ? diffs[diffs.length - 2] : lastDiff;
  const chars = String(answer).split('');
  let swapped: number | null = null;
  if (chars.length >= 2 && chars[chars.length - 1] !== chars[chars.length - 2]) {
    const next = chars.slice();
    const lastIndex = next.length - 1;
    [next[lastIndex - 1], next[lastIndex]] = [next[lastIndex], next[lastIndex - 1]];
    if (next[0] !== '0') swapped = Number(next.join(''));
  }
  return [
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
    last + lastDiff,
    last + prevDiff,
    last,
    answer + lastDiff,
    answer - lastDiff,
    last * 2,
    last + last,
    swapped ?? answer + 3,
    answer + 10,
    Math.abs(answer - 10),
    shown[0] + lastDiff,
  ];
}

function matrixSeeds(shown: number[], answer: number): number[] {
  const g = shown[6];
  const h = shown[7];
  const right = shown[2];
  const midRight = shown[5];
  return [
    g + h,
    g * h,
    g * h - g,
    (g + h) * 2,
    Math.abs(g - h),
    h + (h - g),
    midRight + (midRight - right),
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
    g + h + 1,
    g * h + 1,
    right + midRight,
  ];
}

function pickDistractors(rng: Rng, answer: number, banned: ReadonlySet<number>, seeds: number[]): number[] | null {
  const plausible: number[] = [];
  const consider = (value: number, bucket: number[]) => {
    if (!Number.isInteger(value) || value < 0 || value > MAX_ANSWER) return;
    if (value === answer || banned.has(value) || bucket.includes(value) || plausible.includes(value)) return;
    bucket.push(value);
  };
  for (const seed of seeds) consider(seed, plausible);
  const filler: number[] = [];
  for (let delta = 1; delta <= 40; delta++) {
    consider(answer + delta, filler);
    consider(answer - delta, filler);
  }
  const chosen = rng.shuffle(plausible);
  if (chosen.length < 5) {
    for (const extra of rng.shuffle(filler)) {
      if (chosen.length === 5) break;
      if (!chosen.includes(extra)) chosen.push(extra);
    }
  }
  return chosen.length >= 5 ? chosen.slice(0, 5) : null;
}

function acceptsDraft(family: Family, shown: number[], answer: number): Set<number> | null {
  const own = predictionsFor(family, shown);
  if (own.length !== 1 || own[0] !== answer) return null;
  const banned = new Set<number>([answer]);
  for (const other of FAMILIES) {
    if (other.kind !== family.kind || other.name === family.name) continue;
    const predicted = predictionsFor(other, shown);
    if (other.b < family.b && predicted.length > 0) return null;
    for (const value of predicted) banned.add(value);
  }
  return banned;
}

function orderFamilies(rng: Rng, targetB: number): Family[] {
  const ranked = FAMILIES.map((family) => ({
    family,
    distance: Math.round(Math.abs(family.b - targetB) * 1e6) / 1e6,
  }));
  ranked.sort((left, right) => left.distance - right.distance);
  const ordered: Family[] = [];
  for (let index = 0; index < ranked.length; ) {
    let end = index + 1;
    while (end < ranked.length && ranked[end].distance === ranked[index].distance) end++;
    const group = ranked.slice(index, end).map((entry) => entry.family);
    ordered.push(...(group.length === 1 ? group : rng.shuffle(group)));
    index = end;
  }
  return ordered;
}

function finishItem(family: Family, draft: Draft, rng: Rng, usedIds: ReadonlySet<string>): ChoiceItem | null {
  if (!sequenceOk(draft.shown, draft.answer) || !productsInExplanationOk(draft.explanation)) return null;
  const id = `ns-${family.name}-${draft.shown.join('-')}`;
  if (usedIds.has(id)) return null;
  const banned = acceptsDraft(family, draft.shown, draft.answer);
  if (!banned) return null;
  const seeds = family.kind === 'matrix' ? matrixSeeds(draft.shown, draft.answer) : seriesSeeds(draft.shown, draft.answer);
  const wrong = pickDistractors(rng, draft.answer, banned, seeds);
  if (!wrong) return null;
  const values = rng.shuffle([draft.answer, ...wrong]);
  return {
    id,
    domain: 'series',
    b: family.b,
    a: family.a,
    family: family.kind === 'matrix' ? MATRIX_TAG : SERIES_TAG,
    prompt: family.kind === 'matrix' ? MATRIX_PROMPT : SERIES_PROMPT,
    explanation: draft.explanation,
    kind: 'choice',
    stimulus: draft.stimulus,
    options: values.map((value) => ({ type: 'text', text: String(value) })),
    answer: values.indexOf(draft.answer),
  };
}

function draftPlusK(rng: Rng): Draft | null {
  const step = rng.int(2, 9);
  const length = rng.int(5, 8);
  const start = rng.int(0, 40);
  const shown: number[] = [];
  for (let i = 0; i < length; i++) shown.push(start + i * step);
  const answer = start + length * step;
  const last = shown[length - 1];
  return {
    shown,
    answer,
    explanation: `Each term increases by ${step}: ${last} + ${step} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftMinusOrDouble(rng: Rng): Draft | null {
  if (rng.chance(0.5)) {
    const step = rng.int(2, 9);
    const length = rng.int(5, 8);
    const start = rng.int(step * length, step * length + 40);
    const shown: number[] = [];
    for (let i = 0; i < length; i++) shown.push(start - i * step);
    const answer = start - length * step;
    const last = shown[length - 1];
    return {
      shown,
      answer,
      explanation: `Each term decreases by ${step}: ${last} - ${step} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const length = rng.int(5, 7);
  const start = rng.int(1, length === 5 ? 6 : length === 6 ? 3 : 1);
  const shown = [start];
  for (let i = 1; i < length; i++) shown.push(shown[i - 1] * 2);
  const answer = shown[length - 1] * 2;
  if (!sequenceOk(shown, answer) || !productAllowed(shown[length - 1], 2)) return null;
  return {
    shown,
    answer,
    explanation: `Each term is double the previous: ${shown[length - 1]} × 2 = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftIncreasing(rng: Rng): Draft | null {
  const length = rng.int(5, 8);
  const start = rng.int(0, 30);
  const first = rng.int(1, 6);
  const shown = [start];
  let diff = first;
  for (let i = 1; i < length; i++) {
    shown.push(shown[i - 1] + diff);
    diff += 1;
  }
  const answer = shown[length - 1] + diff;
  return {
    shown,
    answer,
    explanation: `The differences increase by 1 each time. ${describeAdd(shown[length - 1], diff, answer)}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftTimes3SquareAlt(rng: Rng): Draft | null {
  const which = rng.int(0, 2);
  if (which === 0) {
    const shown = [1, 3, 9, 27, 81];
    const answer = 243;
    return {
      shown,
      answer,
      explanation: `Each term is three times the previous: 81 × 3 = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  if (which === 1) {
    const length = rng.int(5, 7);
    const root = rng.int(1, 9 - length);
    const shown: number[] = [];
    for (let i = 0; i < length; i++) shown.push((root + i) * (root + i));
    const next = root + length;
    const answer = next * next;
    if (!productAllowed(next, next)) return null;
    return {
      shown,
      answer,
      explanation: `The terms are consecutive squares: ${next} × ${next} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const add = rng.int(2, 9);
  const sub = rng.int(1, 6);
  const length = rng.int(5, 8);
  const start = rng.int(sub * length, sub * length + 30);
  const shown = [start];
  for (let i = 1; i < length; i++) {
    const delta = i % 2 === 1 ? add : -sub;
    shown.push(shown[i - 1] + delta);
  }
  const nextDelta = length % 2 === 1 ? add : -sub;
  const answer = shown[length - 1] + nextDelta;
  if (!sequenceOk(shown, answer)) return null;
  const change = nextDelta > 0 ? `${shown[length - 1]} + ${add}` : `${shown[length - 1]} - ${sub}`;
  return {
    shown,
    answer,
    explanation: `The pattern alternates between adding ${add} and subtracting ${sub}: ${change} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftInterleaved(rng: Rng): Draft | null {
  const length = rng.int(6, 8);
  const startA = rng.int(0, 18);
  const startB = rng.int(0, 18);
  let stepA = rng.int(1, 8);
  let stepB = rng.int(1, 8);
  if (stepB === stepA) stepB = stepA === 8 ? 3 : stepA + 1;
  if (rng.chance(0.25)) stepA = -stepA;
  if (rng.chance(0.25)) stepB = -stepB;
  if (stepA === stepB) return null;
  const shown: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i % 2 === 0) shown.push(startA + (i / 2) * stepA);
    else shown.push(startB + ((i - 1) / 2) * stepB);
  }
  const nextIsA = length % 2 === 0;
  const answer = nextIsA ? startA + (length / 2) * stepA : startB + ((length - 1) / 2) * stepB;
  if (!sequenceOk(shown, answer)) return null;
  const evens: number[] = [];
  const odds: number[] = [];
  for (let i = 0; i < shown.length; i++) {
    if (i % 2 === 0) evens.push(shown[i]);
    else odds.push(shown[i]);
  }
  const step = nextIsA ? stepA : stepB;
  const base = nextIsA ? evens[evens.length - 1] : odds[odds.length - 1];
  return {
    shown,
    answer,
    explanation: `Two arithmetic series alternate: ${evens.join(', ')} and ${odds.join(', ')}. The next term is ${describeAdd(base, step, answer)}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftSecondDiff(rng: Rng): Draft | null {
  const length = rng.int(5, 7);
  const start = rng.int(1, 20);
  const first = rng.int(1, 8);
  const step = rng.pick([2, 3, 4, -2, -3, -4]);
  const shown = [start];
  let diff = first;
  for (let i = 1; i < length; i++) {
    shown.push(shown[i - 1] + diff);
    diff += step;
  }
  const answer = shown[length - 1] + diff;
  if (!sequenceOk(shown, answer)) return null;
  if (fitSquares(shown) !== null) return null;
  const direction = step > 0 ? 'increase' : 'decrease';
  return {
    shown,
    answer,
    explanation: `The differences ${direction} by ${Math.abs(step)} each time. ${describeAdd(shown[length - 1], diff, answer)}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftAltOps(rng: Rng): Draft | null {
  if (rng.chance(0.45)) {
    const length = rng.int(5, 6);
    const start = rng.int(1, length === 5 ? 5 : 2);
    const shown = [start];
    for (let i = 1; i < length; i++) shown.push(shown[i - 1] * 2 + 1);
    const answer = shown[length - 1] * 2 + 1;
    if (!sequenceOk(shown, answer) || !productAllowed(shown[length - 1], 2)) return null;
    return {
      shown,
      answer,
      explanation: `Each term is double the previous plus 1: ${shown[length - 1]} × 2 + 1 = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const mulFirst = rng.chance(0.5);
  const addend = rng.int(1, 6);
  const start = rng.int(1, 6);
  const length = rng.int(5, 6);
  const shown = [start];
  for (let i = 1; i < length; i++) {
    const multiply = mulFirst ? i % 2 === 1 : i % 2 === 0;
    const prev = shown[i - 1];
    shown.push(multiply ? prev * 2 : prev + addend);
  }
  const multiplyNext = mulFirst ? length % 2 === 1 : length % 2 === 0;
  const last = shown[length - 1];
  const answer = multiplyNext ? last * 2 : last + addend;
  if (!sequenceOk(shown, answer) || (multiplyNext && !productAllowed(last, 2))) return null;
  const stepText = multiplyNext ? `${last} × 2` : `${last} + ${addend}`;
  return {
    shown,
    answer,
    explanation: `The pattern alternates between doubling and adding ${addend}: ${stepText} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftFibonacci(rng: Rng): Draft | null {
  const first = rng.int(2, 9);
  const second = rng.int(2, 9);
  const length = rng.int(5, 7);
  const shown = [first, second];
  for (let i = 2; i < length; i++) shown.push(shown[i - 1] + shown[i - 2]);
  const answer = shown[length - 1] + shown[length - 2];
  if (!sequenceOk(shown, answer)) return null;
  return {
    shown,
    answer,
    explanation: `Each term is the sum of the two before it: ${shown[length - 2]} + ${shown[length - 1]} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftGeoDiffPoly(rng: Rng): Draft | null {
  const which = rng.int(0, 5);
  if (which <= 2) {
    const ratio = rng.pick([2, 3]);
    const firstDiff = rng.int(1, ratio === 2 ? 4 : 2);
    const start = rng.int(1, 12);
    const length = rng.int(5, 6);
    const shown = [start];
    let diff = firstDiff;
    for (let i = 1; i < length; i++) {
      shown.push(shown[i - 1] + diff);
      diff *= ratio;
    }
    const operand = diff / ratio;
    const answer = shown[length - 1] + diff;
    if (!sequenceOk(shown, answer) || !Number.isInteger(operand) || !productAllowed(operand, ratio)) return null;
    if (fitDouble(shown) !== null || fitTimes3(shown) !== null || fitDoublePlusOne(shown) !== null) return null;
    const factorWord = ratio === 2 ? 'double' : 'triple';
    return {
      shown,
      answer,
      explanation: `The differences ${factorWord} each time: ${operand} × ${ratio} = ${diff}, so ${shown[length - 1]} + ${diff} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  if (which <= 4) {
    const length = rng.int(5, 6);
    const root = rng.int(1, 9 - length);
    const shown: number[] = [];
    for (let i = 0; i < length; i++) {
      const value = root + i;
      shown.push(value * value * value);
    }
    const next = root + length;
    const answer = next * next * next;
    if (!sequenceOk(shown, answer) || !productAllowed(next, next)) return null;
    return {
      shown,
      answer,
      explanation: `The terms are consecutive cubes: ${next} × ${next} × ${next} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const length = rng.int(5, 7);
  const root = rng.int(1, 10 - length);
  const shown = [rng.int(1, 20)];
  let square = root;
  for (let i = 1; i < length; i++) {
    shown.push(shown[shown.length - 1] + square * square);
    square += 1;
  }
  const nextDiff = square * square;
  const answer = shown[length - 1] + nextDiff;
  if (!sequenceOk(shown, answer) || !productAllowed(square, square)) return null;
  return {
    shown,
    answer,
    explanation: `The differences are consecutive squares. The next difference is ${square} × ${square} = ${nextDiff}, so ${shown[length - 1]} + ${nextDiff} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftMixedInterleave(rng: Rng): Draft | null {
  if (rng.chance(0.45)) {
    const length = rng.int(5, 7);
    const primeStart = rng.int(0, PRIMES.length - length);
    let value = rng.int(1, 18);
    const shown = [value];
    const used: number[] = [];
    for (let i = 0; i < length - 1; i++) {
      const prime = PRIMES[primeStart + i];
      used.push(prime);
      value += prime;
      shown.push(value);
    }
    const nextPrime = PRIMES[primeStart + length - 1];
    const answer = value + nextPrime;
    if (!sequenceOk(shown, answer)) return null;
    return {
      shown,
      answer,
      explanation: `The differences are consecutive primes (${used.join(', ')}). The next prime is ${nextPrime}: ${value} + ${nextPrime} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const geoOnEven = rng.chance(0.5);
  const ratio = rng.pick([2, 3]);
  const geoStart = rng.int(1, 4);
  const arithStart = rng.int(1, 14);
  const arithStep = rng.int(2, 7) * (rng.chance(0.3) ? -1 : 1);
  const length = rng.int(6, 7);
  let geo = geoStart;
  let arith = arithStart;
  const shown: number[] = [];
  for (let i = 0; i < length; i++) {
    const useGeo = geoOnEven ? i % 2 === 0 : i % 2 === 1;
    if (useGeo) {
      shown.push(geo);
      geo *= ratio;
    } else {
      shown.push(arith);
      arith += arithStep;
    }
  }
  const nextIsGeo = geoOnEven ? length % 2 === 0 : length % 2 === 1;
  const answer = nextIsGeo ? geo : arith;
  const previous = shown[length - 2];
  if (!sequenceOk(shown, answer) || (nextIsGeo && !productAllowed(previous, ratio))) return null;
  const how = nextIsGeo ? `${previous} × ${ratio} = ${answer}` : describeAdd(previous, arithStep, answer);
  const stepPhrase = arithStep >= 0 ? `adding ${arithStep}` : `subtracting ${-arithStep}`;
  return {
    shown,
    answer,
    explanation: `Two series alternate, one multiplying by ${ratio} and one ${stepPhrase}. The next term is ${how}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftAffineThird(rng: Rng): Draft | null {
  if (rng.chance(0.5)) {
    const length = rng.int(6, 7);
    const start = rng.int(1, 12);
    const seedA = rng.int(1, 4);
    const seedB = rng.int(1, 4);
    const diffs = [seedA, seedB];
    while (diffs.length < length) diffs.push(diffs[diffs.length - 1] + diffs[diffs.length - 2]);
    const shown = [start];
    for (let i = 0; i < length - 1; i++) shown.push(shown[shown.length - 1] + diffs[i]);
    const nextDiff = diffs[length - 1];
    const answer = shown[length - 1] + nextDiff;
    if (!sequenceOk(shown, answer)) return null;
    return {
      shown,
      answer,
      explanation: `Each difference is the sum of the two differences before it. The next difference is ${diffs[length - 2]} + ${diffs[length - 3]} = ${nextDiff}, so ${describeAdd(shown[length - 1], nextDiff, answer)}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const length = 6;
  const start = rng.int(1, 6);
  const first = rng.int(1, 3);
  const second = rng.int(1, 2);
  const third = rng.pick([1, 2]);
  const shown = [start];
  let diff = first;
  let gap = second;
  for (let i = 1; i < length; i++) {
    shown.push(shown[i - 1] + diff);
    diff += gap;
    gap += third;
  }
  const answer = shown[length - 1] + diff;
  if (!sequenceOk(shown, answer) || fitCubes(shown) !== null || fitSquareDiffs(shown) !== null) return null;
  return {
    shown,
    answer,
    explanation: `The second differences increase by ${third} each time. ${describeAdd(shown[length - 1], diff, answer)}.`,
    stimulus: seriesStimulus(shown),
  };
}

function draftCompound(rng: Rng): Draft | null {
  const which = rng.int(0, 2);
  if (which === 0) {
    const length = rng.int(6, 7);
    const shown = [rng.int(1, 5), rng.int(1, 5), rng.int(1, 5)];
    while (shown.length < length) {
      const n = shown.length;
      shown.push(shown[n - 1] + shown[n - 2] + shown[n - 3]);
    }
    const answer = shown[length - 1] + shown[length - 2] + shown[length - 3];
    if (!sequenceOk(shown, answer)) return null;
    return {
      shown,
      answer,
      explanation: `Each term is the sum of the three before it: ${shown[length - 3]} + ${shown[length - 2]} + ${shown[length - 1]} = ${answer}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  if (which === 1) {
    const factorA = rng.pick([2, 3]);
    const factorB = factorA === 2 ? 3 : 2;
    const start = rng.int(1, 8);
    const firstDiff = rng.int(1, 2);
    const length = 6;
    const shown = [start];
    let diff = firstDiff;
    for (let i = 1; i < length; i++) {
      shown.push(shown[i - 1] + diff);
      diff *= (i - 1) % 2 === 0 ? factorA : factorB;
    }
    const nextFactor = (length - 2) % 2 === 0 ? factorA : factorB;
    const operand = diff / nextFactor;
    const answer = shown[length - 1] + diff;
    if (!sequenceOk(shown, answer) || !Number.isInteger(operand) || !productAllowed(operand, nextFactor)) return null;
    return {
      shown,
      answer,
      explanation: `Each difference is the previous difference multiplied by alternating factors ${factorA} and ${factorB}: ${operand} × ${nextFactor} = ${diff}, so ${describeAdd(shown[length - 1], diff, answer)}.`,
      stimulus: seriesStimulus(shown),
    };
  }
  const seed = rng.int(1, 4);
  const offset = rng.pick([-3, -2, -1, 1]);
  const length = 5;
  const shown = [seed];
  for (let i = 1; i < length; i++) shown.push(shown[i - 1] * (i + 1) + offset);
  const position = length + 1;
  const last = shown[length - 1];
  const answer = last * position + offset;
  if (!sequenceOk(shown, answer) || !productAllowed(last, position)) return null;
  const signed = offset > 0 ? `plus ${offset}` : `minus ${-offset}`;
  const arithmetic = offset > 0 ? `${last} × ${position} + ${offset}` : `${last} × ${position} - ${-offset}`;
  return {
    shown,
    answer,
    explanation: `Each term is the previous term times its position, ${signed}. Position ${position}: ${arithmetic} = ${answer}.`,
    stimulus: seriesStimulus(shown),
  };
}

function rowIsAlso(a: number, b: number, c: number, allowed: 'sum' | 'product' | 'mul-minus' | 'double-sum'): boolean {
  const matches: Array<['sum' | 'product' | 'mul-minus' | 'double-sum', number]> = [
    ['sum', a + b],
    ['product', a * b],
    ['mul-minus', a * b - a],
    ['double-sum', (a + b) * 2],
  ];
  return matches.some(([name, value]) => name !== allowed && value === c);
}

function draftRowSum(rng: Rng): Draft | null {
  const rows: number[][] = [];
  for (let row = 0; row < 3; row++) {
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const a = rng.int(1, 12);
      const b = rng.int(1, 12);
      const c = a + b;
      if (b === 2 * a || rowIsAlso(a, b, c, 'sum')) continue;
      rows.push([a, b, c]);
      placed = true;
    }
    if (!placed) rows.push([3, 4, 7]);
  }
  const answer = rows[2][0] + rows[2][1];
  return matrixDraft(rows, `In each row, the third number is the sum of the first two: ${rows[2][0]} + ${rows[2][1]} = ${answer}.`);
}

function draftRowProduct(rng: Rng): Draft | null {
  const rows: number[][] = [];
  for (let row = 0; row < 3; row++) {
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const a = rng.int(2, 9);
      const b = rng.int(2, 9);
      const c = a * b;
      if (rowIsAlso(a, b, c, 'product')) continue;
      rows.push([a, b, c]);
      placed = true;
    }
    if (!placed) rows.push([3, 5, 15]);
  }
  const answer = rows[2][0] * rows[2][1];
  return matrixDraft(rows, `In each row, the third number is the product of the first two: ${rows[2][0]} × ${rows[2][1]} = ${answer}.`);
}

function draftRowMulMinus(rng: Rng): Draft | null {
  const rows: number[][] = [];
  for (let row = 0; row < 3; row++) {
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const a = rng.int(2, 9);
      const b = rng.int(2, 9);
      const c = a * b - a;
      if (rowIsAlso(a, b, c, 'mul-minus')) continue;
      rows.push([a, b, c]);
      placed = true;
    }
    if (!placed) rows.push([4, 5, 16]);
  }
  const left = rows[2][0];
  const mid = rows[2][1];
  const answer = left * mid - left;
  return matrixDraft(
    rows,
    `In each row, the third number is the first times the second, minus the first: ${left} × ${mid} - ${left} = ${answer}.`,
  );
}

function draftRowDoubleSum(rng: Rng): Draft | null {
  const rows: number[][] = [];
  for (let row = 0; row < 3; row++) {
    let placed = false;
    for (let attempt = 0; attempt < 20 && !placed; attempt++) {
      const a = rng.int(1, 9);
      const b = rng.int(1, 9);
      const c = (a + b) * 2;
      if (rowIsAlso(a, b, c, 'double-sum')) continue;
      rows.push([a, b, c]);
      placed = true;
    }
    if (!placed) rows.push([3, 5, 16]);
  }
  const left = rows[2][0];
  const mid = rows[2][1];
  const sum = left + mid;
  const answer = sum * 2;
  return matrixDraft(rows, `In each row, the third number is twice the sum of the first two: ${sum} × 2 = ${answer}.`);
}

function draftRowColArith(rng: Rng): Draft | null {
  for (let attempt = 0; attempt < 25; attempt++) {
    const a = rng.int(1, 9);
    const stepAcross = rng.int(1, 6);
    const stepDown = rng.int(1, 6);
    const rows = [
      [a, a + stepAcross, a + 2 * stepAcross],
      [a + stepDown, a + stepAcross + stepDown, a + 2 * stepAcross + stepDown],
      [a + 2 * stepDown, a + stepAcross + 2 * stepDown, a + 2 * stepAcross + 2 * stepDown],
    ];
    const shown = [rows[0][0], rows[0][1], rows[0][2], rows[1][0], rows[1][1], rows[1][2], rows[2][0], rows[2][1]];
    const answer = rows[2][2];
    if (fitRowSum(shown) !== null || fitRowProduct(shown) !== null) continue;
    if (fitRowMulMinus(shown) !== null || fitRowDoubleSum(shown) !== null) continue;
    if (fitRowColArith(shown) !== answer) continue;
    const left = rows[2][0];
    const mid = rows[2][1];
    return matrixDraft(
      rows,
      `Each row and each column is an arithmetic sequence. The last row advances by ${mid - left}: ${mid} + ${mid - left} = ${answer}.`,
    );
  }
  return null;
}

function simplerMatrix(shown: number[]): boolean {
  return (
    fitRowSum(shown) !== null ||
    fitRowProduct(shown) !== null ||
    fitRowMulMinus(shown) !== null ||
    fitRowDoubleSum(shown) !== null ||
    fitRowColArith(shown) !== null
  );
}

function draftRowColCombo(rng: Rng): Draft | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = rng.int(1, 6);
    const b = rng.int(1, 6);
    const c = rng.int(1, 6);
    const d = rng.int(1, 6);
    const g = rng.int(1, 6);
    const e = 2 * b + d;
    const f = 2 * c + e;
    const h = 2 * e + g;
    const answer = 2 * f + h;
    const rows = [
      [a, b, c],
      [d, e, f],
      [g, h, answer],
    ];
    const shown = [a, b, c, d, e, f, g, h];
    if (simplerMatrix(shown) || fitRowColCombo(shown) !== answer) continue;
    if (!productAllowed(2, f)) continue;
    return matrixDraft(
      rows,
      `Below the first row, each number is twice the number above it plus the number to its left: 2 × ${f} + ${h} = ${answer}.`,
    );
  }
  return null;
}

const DRAFTERS: Record<FamilyName, (rng: Rng) => Draft | null> = {
  'plus-k': draftPlusK,
  'minus-or-double': draftMinusOrDouble,
  'increasing-diff': draftIncreasing,
  'times3-square-alt': draftTimes3SquareAlt,
  interleaved: draftInterleaved,
  'second-diff': draftSecondDiff,
  'alt-ops': draftAltOps,
  fibonacci: draftFibonacci,
  'geo-diff-poly': draftGeoDiffPoly,
  'mixed-interleave': draftMixedInterleave,
  'affine-third': draftAffineThird,
  compound: draftCompound,
  'row-sum': draftRowSum,
  'row-product': draftRowProduct,
  'row-mul-minus': draftRowMulMinus,
  'row-double-sum': draftRowDoubleSum,
  'row-col-arith': draftRowColArith,
  'row-col-combo': draftRowColCombo,
};

function familyByName(name: FamilyName): Family {
  const family = FAMILIES.find((candidate) => candidate.name === name);
  if (!family) throw new Error(`missing family ${name}`);
  return family;
}

export const seriesGenerator: ItemGenerator = {
  domain: 'series',
  generate(rng, targetB, usedIds) {
    const ordered = orderFamilies(rng, targetB);
    for (const family of ordered) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_FAMILY; attempt++) {
        const draft = DRAFTERS[family.name](rng);
        if (!draft) continue;
        const item = finishItem(family, draft, rng, usedIds);
        if (item) return item;
      }
    }
    const rescue = finishItem(familyByName('plus-k'), {
      shown: [2, 4, 6, 8, 10],
      answer: 12,
      explanation: 'Each term increases by 2: 10 + 2 = 12.',
      stimulus: seriesStimulus([2, 4, 6, 8, 10]),
    }, rng, usedIds);
    if (rescue && !usedIds.has(rescue.id)) return rescue;
    throw new Error(`seriesGenerator could not build an item for target ${targetB}`);
  },
  practice() {
    const values = [14, 11, 10, 12, 16, 13];
    return {
      id: 'ns-plus-k-2-4-6-8-10',
      domain: 'series',
      b: -2.5,
      a: 1.3,
      family: SERIES_TAG,
      prompt: SERIES_PROMPT,
      explanation: 'Each term increases by 2: 10 + 2 = 12.',
      kind: 'choice',
      stimulus: { type: 'text', text: '2, 4, 6, 8, 10, ?' },
      options: values.map((value) => ({ type: 'text', text: String(value) })),
      answer: values.indexOf(12),
    };
  },
};
