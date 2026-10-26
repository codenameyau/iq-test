import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { ChoiceItem, Item } from '../core/types';
import { seriesGenerator } from './series';

/**
 * Independent rule recognizers. These re-derive the next term from the shown
 * values; they do not call the generator's own ambiguity helper.
 */

const SERIES_B = {
  'plus-k': -2.4,
  'minus-or-double': -1.8,
  'increasing-diff': -1.1,
  'times3-square-alt': -0.6,
  interleaved: 0.3,
  'second-diff': 0.4,
  'alt-ops': 0.8,
  fibonacci: 0.9,
  'geo-diff-poly': 1.3,
  'mixed-interleave': 1.7,
  'affine-third': 2.1,
  compound: 2.5,
} as const;

const MATRIX_B = {
  'row-sum': -1.2,
  'row-product': -0.4,
  'row-double-sum': 0.3,
  'row-mul-minus': 0.6,
  'row-col-arith': -1.6,
  'row-col-combo': 2.0,
} as const;

const FAMILY_B: Record<string, number> = { ...SERIES_B, ...MATRIX_B };

const FAMILY_NAMES = Object.keys(FAMILY_B).sort((a, b) => b.length - a.length);

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];

function asChoice(item: Item): ChoiceItem {
  expect(item.kind).toBe('choice');
  return item as ChoiceItem;
}

function optionTexts(item: ChoiceItem): string[] {
  return item.options.map((option) => {
    expect(option.type).toBe('text');
    return option.type === 'text' ? option.text : '';
  });
}

function parseId(id: string): { name: string; terms: number[] } {
  expect(id.startsWith('ns-')).toBe(true);
  const rest = id.slice(3);
  const name = FAMILY_NAMES.find((family) => rest.startsWith(`${family}-`));
  expect(name, id).toBeTruthy();
  const terms = rest
    .slice((name ?? '').length + 1)
    .split('-')
    .map(Number);
  expect(terms.every((term) => Number.isInteger(term))).toBe(true);
  return { name: name ?? '', terms };
}

function seriesTerms(item: ChoiceItem): number[] {
  expect(item.stimulus.type).toBe('text');
  if (item.stimulus.type !== 'text') return [];
  const parts = item.stimulus.text.split(',').map((part) => part.trim());
  expect(parts[parts.length - 1]).toBe('?');
  return parts.slice(0, -1).map(Number);
}

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

function seriesPredictions(name: string, terms: number[]): number[] {
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

function matrixPredictions(name: string, terms: number[]): number[] {
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

function familyKind(name: string): 'series' | 'matrix' {
  return name in MATRIX_B ? 'matrix' : 'series';
}

function predictionsFor(name: string, terms: number[]): number[] {
  return familyKind(name) === 'matrix' ? matrixPredictions(name, terms) : seriesPredictions(name, terms);
}

function allFamilyNames(kind: 'series' | 'matrix'): string[] {
  return Object.keys(kind === 'matrix' ? MATRIX_B : SERIES_B);
}

type Alternative = { name: string; plain: boolean; next: (terms: number[]) => number | null };

function nextByConstantDifferences(terms: number[], order: number): number | null {
  const levels = [terms];
  for (let i = 0; i < order; i++) levels.push(differences(levels[i]));
  const deepest = levels[order];
  if (deepest.length < 2 || deepest.some((value) => value !== deepest[0])) return null;
  return levels.reduce((sum, level) => sum + level[level.length - 1], 0);
}

function strands(terms: number[]): [number[], number[]] {
  return [terms.filter((_, i) => i % 2 === 0), terms.filter((_, i) => i % 2 === 1)];
}

/** Simple rules a test-taker might fit instead of the family rule. `plain` ones must never disagree with the key. */
const SERIES_ALTERNATIVES: Alternative[] = [
  { name: 'constant difference', plain: true, next: (t) => nextByConstantDifferences(t, 1) },
  { name: 'constant second difference', plain: true, next: (t) => nextByConstantDifferences(t, 2) },
  {
    name: 'constant ratio',
    plain: true,
    next: (t) => {
      if (t.some((term) => term === 0)) return null;
      const ratio = t[1] / t[0];
      if (t.some((term, i) => i > 0 && Math.abs(term / t[i - 1] - ratio) > 1e-9)) return null;
      return t[t.length - 1] * ratio;
    },
  },
  {
    name: 'two interleaved arithmetic sequences',
    plain: true,
    next: (t) => {
      const [even, odd] = strands(t);
      if (even.length < 3 || odd.length < 3) return null;
      const evenStep = constantDifference(even);
      const oddStep = constantDifference(odd);
      if (evenStep === null || oddStep === null) return null;
      return t.length % 2 === 0 ? even[even.length - 1] + evenStep : odd[odd.length - 1] + oddStep;
    },
  },
  {
    name: 'two interleaved arithmetic sequences, one only two terms long',
    plain: false,
    next: (t) => {
      const [even, odd] = strands(t);
      const evenStep = constantDifference(even);
      const oddStep = constantDifference(odd);
      if (evenStep === null || oddStep === null) return null;
      return t.length % 2 === 0 ? even[even.length - 1] + evenStep : odd[odd.length - 1] + oddStep;
    },
  },
  {
    name: 'Fibonacci-like',
    plain: true,
    next: (t) => (t.every((term, i) => i < 2 || term === t[i - 1] + t[i - 2]) ? t[t.length - 1] + t[t.length - 2] : null),
  },
  {
    name: 'alternating two additions',
    plain: true,
    next: (t) => {
      const diffs = differences(t);
      if (diffs.length < 4 || diffs.some((diff, i) => i >= 2 && diff !== diffs[i - 2])) return null;
      return t[t.length - 1] + diffs[diffs.length - 2];
    },
  },
  ...[2, 3].flatMap((factor) =>
    [0, 1].map((phase): Alternative => ({
      name: `alternating ×${factor} and an addition`,
      plain: false,
      next: (t) => {
        let addend: number | null = null;
        for (let i = 1; i < t.length; i++) {
          if ((i + phase) % 2 === 1) {
            if (t[i] !== t[i - 1] * factor) return null;
          } else {
            addend ??= t[i] - t[i - 1];
            if (t[i] !== t[i - 1] + addend) return null;
          }
        }
        if (addend === null) return null;
        return (t.length + phase) % 2 === 1 ? t[t.length - 1] * factor : t[t.length - 1] + addend;
      },
    })),
  ),
];

const CELL_OPERATIONS: Array<[string, (x: number, y: number) => number]> = [
  ['sum', (x, y) => x + y],
  ['product', (x, y) => x * y],
  ['difference', (x, y) => x - y],
  ['reverse difference', (x, y) => y - x],
  ['double sum', (x, y) => 2 * (x + y)],
  ['product minus first', (x, y) => x * y - x],
  ['product minus second', (x, y) => x * y - y],
];

const MATRIX_ALTERNATIVES: Alternative[] = [
  ...CELL_OPERATIONS.flatMap(([name, op]): Alternative[] => [
    { name: `row ${name}`, plain: true, next: ([a, b, c, d, e, f, g, h]) => (c === op(a, b) && f === op(d, e) ? op(g, h) : null) },
    { name: `column ${name}`, plain: true, next: ([a, b, c, d, e, f, g, h]) => (g === op(a, d) && h === op(b, e) ? op(c, f) : null) },
  ]),
  { name: 'rows step evenly', plain: true, next: ([a, b, c, d, e, f, g, h]) => (b - a === c - b && e - d === f - e ? 2 * h - g : null) },
  { name: 'columns step evenly', plain: true, next: ([a, b, c, d, e, f, g, h]) => (d - a === g - d && e - b === h - e ? 2 * f - c : null) },
];

function familyItems(name: string, count: number): ChoiceItem[] {
  const items: ChoiceItem[] = [];
  for (let seed = 1; items.length < count && seed < count * 20; seed++) {
    const item = asChoice(seriesGenerator.generate(createRng(seed * 7919), FAMILY_B[name], new Set()));
    if (parseId(item.id).name === name) items.push(item);
  }
  return items;
}

describe('seriesGenerator', () => {
  it('exposes the series domain', () => {
    expect(seriesGenerator.domain).toBe('series');
  });

  it('is deterministic for the same seed, target, and used ids', () => {
    const used = new Set<string>(['ns-plus-k-2-4-6-8-10']);
    for (const seed of [1, 42, 99, 2026, 55555]) {
      for (const target of [-2.5, -1, 0, 0.3, 1.4, 2.5]) {
        const left = seriesGenerator.generate(createRng(seed), target, used);
        const right = seriesGenerator.generate(createRng(seed), target, used);
        expect(left).toEqual(right);
      }
    }
  });

  it('stays within 0.6 of targets from -2.5 to 2.5, on a real family', () => {
    const levels = Object.values(FAMILY_B);
    for (const seed of [1, 8, 21]) {
      for (let target = -2.5; target <= 2.5 + 1e-9; target += 0.5) {
        const item = asChoice(seriesGenerator.generate(createRng(seed), target, new Set()));
        const roundedTarget = Math.round(target * 2) / 2;
        const { name } = parseId(item.id);
        const distance = Math.abs(item.b - roundedTarget);
        const nearest = Math.min(...levels.map((level) => Math.abs(level - roundedTarget)));
        expect(distance <= 0.6 || Math.abs(distance - nearest) < 1e-6, item.id).toBe(true);
        expect(item.b, item.id).toBe(FAMILY_B[name]);
        expect(item.a, item.id).toBeGreaterThanOrEqual(1.3);
        expect(item.a, item.id).toBeLessThanOrEqual(1.6);
        expect(item.domain).toBe('series');
      }
    }
  });

  it('offers six distinct options and the answer its family rule computes', () => {
    const rng = createRng(77);
    for (let i = 0; i < 60; i++) {
      const target = -2.5 + (i % 11) * 0.5;
      const item = asChoice(seriesGenerator.generate(rng, target, new Set()));
      const texts = optionTexts(item);
      expect(texts, item.id).toHaveLength(6);
      expect(new Set(texts).size, item.id).toBe(6);
      expect(item.answer, item.id).toBeGreaterThanOrEqual(0);
      expect(item.answer, item.id).toBeLessThan(6);
      const chosen = Number(texts[item.answer]);
      expect(Number.isInteger(chosen), item.id).toBe(true);
      expect(chosen, item.id).toBeGreaterThanOrEqual(0);
      expect(chosen, item.id).toBeLessThanOrEqual(1999);

      const { name, terms } = parseId(item.id);
      expect(item.family, item.id).toBe(familyKind(name) === 'matrix' ? 'ns-matrix' : 'ns-series');
      const predicted = predictionsFor(name, terms);
      expect(predicted, item.id).toEqual([chosen]);
      expect(item.explanation, item.id).toMatch(new RegExp(`\\b${chosen}\\b`));
      expect(item.explanation, item.id).not.toMatch(/undefined|NaN/);

      if (familyKind(name) === 'series') {
        expect(item.prompt).toBe('Which number comes next?');
        expect(item.stimulus.type).toBe('text');
        expect(seriesTerms(item), item.id).toEqual(terms);
        if (item.stimulus.type === 'text') {
          expect(item.stimulus.text).toMatch(/^(?:0|[1-9]\d*)(?:, (?:0|[1-9]\d*))*, \?$/);
        }
      } else {
        expect(item.prompt).toBe('Which number replaces the question mark?');
        expect(item.stimulus.type).toBe('svg');
        expect(terms, item.id).toHaveLength(8);
      }
    }
  });

  it('keeps a unique consistent answer across 500 items', () => {
    const rng = createRng(20261020);
    for (let i = 0; i < 500; i++) {
      const target = -2.5 + (i % 51) * 0.1;
      const item = asChoice(seriesGenerator.generate(rng, target, new Set()));
      const texts = optionTexts(item);
      const answer = Number(texts[item.answer]);
      const { name, terms } = parseId(item.id);
      const kind = familyKind(name);
      const own = predictionsFor(name, terms);
      expect(own, `${item.id} own rule`).toEqual([answer]);

      for (const other of allFamilyNames(kind)) {
        const predicted = predictionsFor(other, terms);
        if (other !== name && FAMILY_B[other] < FAMILY_B[name]) {
          expect(predicted, `${item.id} fits easier ${other}`).toEqual([]);
        }
        for (const value of predicted) {
          if (value !== answer) {
            expect(texts, `${item.id} distractor matches ${other}`).not.toContain(String(value));
          }
        }
      }
    }
  });

  it('returns 40 unique items when previous ids are excluded', () => {
    const rng = createRng(7);
    const used = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const item = seriesGenerator.generate(rng, 0, used);
      expect(used.has(item.id), item.id).toBe(false);
      used.add(item.id);
    }
    expect(used.size).toBe(40);
  });

  it('renders number matrices as viewBox svgs', () => {
    const item = asChoice(seriesGenerator.generate(createRng(3), -1.2, new Set()));
    expect(item.family).toBe('ns-matrix');
    expect(item.stimulus.type).toBe('svg');
    if (item.stimulus.type !== 'svg') return;
    const svg = item.stimulus.svg;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 330 330"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    const open = svg.slice(0, svg.indexOf('>'));
    expect(open).not.toMatch(/\bwidth=/);
    expect(open).not.toMatch(/\bheight=/);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#e5e7eb"');
    expect(svg).toContain('rx="6"');
    expect(svg).toContain('font-family="system-ui, sans-serif"');
    expect(svg).toContain('fill="#9ca3af"');
    const labels = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
    expect(labels).toHaveLength(9);
    expect(labels[8]).toBe('?');
    const { terms } = parseId(item.id);
    expect(labels.slice(0, 8).map(Number)).toEqual(terms);
    const answer = Number(optionTexts(item)[item.answer]);
    expect(fitRowSum(terms)).toBe(answer);
  });

  it('practice is a fixed easy series with no rng', () => {
    const first = asChoice(seriesGenerator.practice());
    expect(seriesGenerator.practice()).toEqual(first);
    expect(first.b).toBe(-2.5);
    expect(first.a).toBeGreaterThanOrEqual(1.3);
    expect(first.a).toBeLessThanOrEqual(1.6);
    expect(first.domain).toBe('series');
    expect(first.family).toBe('ns-series');
    expect(first.prompt).toBe('Which number comes next?');
    expect(first.stimulus).toEqual({ type: 'text', text: '2, 4, 6, 8, 10, ?' });
    expect(first.id).toBe('ns-plus-k-2-4-6-8-10');
    const texts = optionTexts(first);
    expect(new Set(texts).size).toBe(6);
    expect(texts[first.answer]).toBe('12');
    expect(first.explanation).toMatch(/\b12\b/);
  });

  it('keeps mental arithmetic and question-type tags across 1000 items', () => {
    const rng = createRng(4242);
    const multiply = /(\d+)\s*×\s*(\d+)/g;
    for (let i = 0; i < 1000; i++) {
      const target = -2.5 + (i % 51) * 0.1;
      const item = asChoice(seriesGenerator.generate(rng, target, new Set()));
      const { name, terms } = parseId(item.id);
      expect(terms.length, item.id).toBeGreaterThanOrEqual(5);
      for (const term of terms) {
        expect(term, item.id).toBeGreaterThanOrEqual(0);
        expect(term, item.id).toBeLessThanOrEqual(999);
      }
      const answer = Number(optionTexts(item)[item.answer]);
      expect(answer, item.id).toBeGreaterThanOrEqual(0);
      expect(answer, item.id).toBeLessThanOrEqual(1999);
      for (const match of item.explanation.matchAll(multiply)) {
        const left = Number(match[1]);
        const right = Number(match[2]);
        const low = Math.min(left, right);
        const high = Math.max(left, right);
        const byTen = left === 10 || left === 100 || right === 10 || right === 100;
        expect(byTen || (low <= 9 && high <= 99), item.explanation).toBe(true);
      }
      expect(item.family, item.id).toBe(familyKind(name) === 'matrix' ? 'ns-matrix' : 'ns-series');
    }
  });

  it('has no second answer under simple alternative rules, in 200 items per family', () => {
    for (const name of Object.keys(FAMILY_B)) {
      const items = familyItems(name, 200);
      expect(items.length, name).toBe(200);
      const alternatives = familyKind(name) === 'matrix' ? MATRIX_ALTERNATIVES : SERIES_ALTERNATIVES;
      for (const item of items) {
        const texts = optionTexts(item);
        const answer = Number(texts[item.answer]);
        const { terms } = parseId(item.id);
        for (const alternative of alternatives) {
          const value = alternative.next(terms);
          if (value === null || value === answer || value < 0) continue;
          expect(alternative.plain, `${item.id}: ${alternative.name} gives ${value}`).toBe(false);
          expect(texts, `${item.id}: distractor ${value} follows ${alternative.name}`).not.toContain(String(value));
        }
      }
    }
  });

  it('shows the rule at least twice and never as a repeating pair or a counting grid', () => {
    for (const name of Object.keys(FAMILY_B)) {
      for (const item of familyItems(name, 100)) {
        const { terms } = parseId(item.id);
        if (familyKind(name) === 'matrix') {
          expect(terms.slice(0, 3), `${item.id} repeats its first row`).not.toEqual(terms.slice(3, 6));
          expect(constantDifference(terms), `${item.id} counts in reading order`).toBeNull();
        } else {
          expect(terms.every((term, i) => i < 2 || term === terms[i - 2]), `${item.id} only alternates two values`).toBe(false);
        }
      }
    }
  });
});
