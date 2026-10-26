import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import {
  entityMetrics,
  generateMatrices,
  matricesGenerator,
  panelSatisfiesRules,
  panelSignature,
} from './matrices';

const LEVEL_B = [-2.4, -1.8, -1.1, -0.5, 0.1, 0.6, 1.2, 1.7, 2.2, 2.7];

function nearestDistance(target: number): number {
  return Math.min(...LEVEL_B.map((b) => Math.abs(b - target)));
}

function attributeAt(
  panel: ReturnType<typeof generateMatrices>['context'][number][number],
  component: string,
  attr: string,
): number {
  const fig = panel.kind === 'lines'
    ? panel.accent
    : component === 'inner' || component === 'right'
      ? panel.inner
      : panel.outer;
  if (!fig) return -1;
  if (attr === 'shape') return ['triangle', 'square', 'pentagon', 'hexagon', 'circle'].indexOf(fig.shape);
  if (attr === 'size') return fig.size;
  if (attr === 'fill') return fig.fill;
  if (attr === 'count') return fig.count;
  return fig.rotation;
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
}

/** Option that shares the most attribute values with the other options. Ties keep the lowest index. */
function agreementPick(vectors: string[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < vectors.length; i++) {
    let score = 0;
    for (let dim = 0; dim < vectors[i].length; dim++) {
      for (let j = 0; j < vectors.length; j++) {
        if (j !== i && vectors[j][dim] === vectors[i][dim]) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

type Sample = ReturnType<typeof generateMatrices>;
type Panel = Sample['options'][number];

const SYMMETRY: Record<string, number> = { triangle: 120, square: 90, pentagon: 72, hexagon: 60, circle: 0 };
const COMPONENTS = ['single', 'outer', 'inner', 'left', 'right', 'accent'] as const;
const ATTRIBUTES = ['shape', 'size', 'fill', 'count', 'rotation'] as const;

function figureOf(panel: Panel, component: string) {
  if (panel.kind === 'lines') return component === 'accent' ? panel.accent : null;
  if (component === 'accent') return null;
  if (component === 'single') return panel.layout === 'single' ? panel.outer : null;
  if (component === 'outer') return panel.layout === 'nested' ? panel.outer : null;
  if (component === 'left') return panel.layout === 'split' ? panel.outer : null;
  if (component === 'inner') return panel.layout === 'nested' ? panel.inner ?? null : null;
  return panel.layout === 'split' ? panel.inner ?? null : null;
}

/** Degrees two orientations of a shape appear apart, after its rotational symmetry. */
function apparentTurn(shape: string, a: number, b: number): number {
  const period = SYMMETRY[shape];
  if (!period) return 0;
  const turn = (((a - b) % period) + period) % period;
  return Math.min(turn, period - turn);
}

/** Missing-cell values allowed by constant, progression, distribution, or arithmetic readings by rows or columns. */
function independentReadings(grid: number[][], arithmetic: boolean): Set<number> {
  const out = new Set<number>();
  const columns = [0, 1, 2].map((col) => grid.map((row) => row[col]));
  for (const [r0, r1, r2] of [grid, columns]) {
    if (r0.every((v) => v === r0[0]) && r1.every((v) => v === r1[0]) && r2[0] === r2[1]) out.add(r2[0]);
    const step = r0[1] - r0[0];
    if ([r0, r1].every((r) => r[1] - r[0] === step && r[2] - r[1] === step) && r2[1] - r2[0] === step) out.add(r2[1] + step);
    const key = (r: number[]) => [...r].sort((x, y) => x - y).join();
    if (new Set(r0).size === 3 && key(r0) === key(r1)) {
      const missing = r0.filter((v) => v !== r2[0] && v !== r2[1]);
      if (missing.length === 1) out.add(missing[0]);
    }
    if (arithmetic && [r0, r1].every((r) => r[2] === r[0] + r[1])) out.add(r2[0] + r2[1]);
    if (arithmetic && [r0, r1].every((r) => r[2] === r[0] - r[1])) out.add(r2[0] - r2[1]);
  }
  return out;
}

const LINE_OPS: Array<(a: number, b: number) => number> = [
  (a, b) => a | b,
  (a, b) => a ^ b,
  (a, b) => a & b,
  (a, b) => a & ~b,
  (a, b) => b & ~a,
];

function nonFixedRules(sample: Sample) {
  return sample.rules.filter((rule) => rule.kind !== 'fixed');
}

describe('matrices generator', () => {
  it('exposes the matrices domain', () => {
    expect(matricesGenerator.domain).toBe('matrices');
  });

  it('is deterministic for the same seed, target, and used ids', () => {
    const used = new Set<string>(['mx-occupied']);
    for (const seed of [1, 7, 42, 99, 1000, 20241020]) {
      for (const target of [-2, 0, 1.4, 2.2]) {
        const a = matricesGenerator.generate(createRng(seed), target, used);
        const b = matricesGenerator.generate(createRng(seed), target, used);
        expect(a).toEqual(b);
      }
    }
  });

  it('returns a level difficulty near the target', () => {
    for (const target of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      for (const seed of [1, 8, 21]) {
        const item = matricesGenerator.generate(createRng(seed), target, new Set());
        expect(LEVEL_B.some((b) => Math.abs(b - item.b) < 1e-9)).toBe(true);
        expect(Math.abs(item.b - target)).toBeLessThanOrEqual(nearestDistance(target) + 0.11);
        expect(Math.abs(item.b - target)).toBeLessThanOrEqual(0.6 + 1e-9);
        expect(item.a).toBeGreaterThanOrEqual(1.4);
        expect(item.a).toBeLessThanOrEqual(1.8);
      }
    }
  });

  it('builds a choice item whose options are distinct panels', () => {
    const sample = generateMatrices(createRng(3), 0, new Set());
    const { item } = sample;
    expect(item.kind).toBe('choice');
    expect(item.domain).toBe('matrices');
    expect(item.prompt).toBe('Which option completes the pattern?');
    expect(item.answer).toBeGreaterThanOrEqual(0);
    expect(item.answer).toBeLessThan(8);
    expect(item.options).toHaveLength(8);
    expect(sentenceCount(item.explanation)).toBeGreaterThanOrEqual(1);
    expect(sentenceCount(item.explanation)).toBeLessThanOrEqual(3);

    expect(item.stimulus.type).toBe('svg');
    if (item.stimulus.type !== 'svg') return;
    expect(item.stimulus.svg.startsWith('<svg')).toBe(true);
    expect(item.stimulus.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(item.stimulus.svg).toContain('viewBox="0 0 330 330"');
    expect(item.stimulus.svg).not.toMatch(/<svg[^>]*\s(?:width|height)=/);
    expect(item.stimulus.svg).toContain('>?</text>');

    const svgs: string[] = [];
    for (const option of item.options) {
      expect(option.type).toBe('svg');
      if (option.type !== 'svg') continue;
      expect(option.svg.startsWith('<svg')).toBe(true);
      expect(option.svg).toContain('viewBox="0 0 100 100"');
      expect(option.svg).not.toMatch(/<svg[^>]*\s(?:width|height)=/);
      expect(option.svg).not.toContain('?</text>');
      svgs.push(option.svg);
    }
    expect(new Set(svgs).size).toBe(8);
    expect(new Set(sample.optionSignatures).size).toBe(8);
    expect(sample.optionSignatures[item.answer]).toBe(panelSignature(sample.context[2][2]));
  });

  it('bisects each modified attribute across the eight options', () => {
    const rng = createRng(11);
    for (let i = 0; i < 30; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      expect(sample.optionVectors).toHaveLength(8);
      const dims = sample.optionVectors[0]?.length ?? 0;
      expect(dims).toBe(3);
      for (let dim = 0; dim < dims; dim++) {
        const counts = new Map<string, number>();
        for (const vector of sample.optionVectors) {
          const value = vector[dim];
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        expect(counts.size).toBe(2);
        for (const count of counts.values()) expect(count).toBe(4);
      }
    }
  });

  it('does not repeat ids while usedIds accumulates', () => {
    const used = new Set<string>();
    const rng = createRng(123);
    for (let i = 0; i < 40; i++) {
      const item = matricesGenerator.generate(rng, 0.1, used);
      expect(used.has(item.id)).toBe(false);
      expect(item.id.startsWith('mx-')).toBe(true);
      used.add(item.id);
    }
    expect(used.size).toBe(40);
  });

  it('keeps the correct panel from being voted out of the options', () => {
    const rng = createRng(999);
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      if (agreementPick(sample.optionVectors) === sample.item.answer) hits++;
    }
    expect(hits / 300).toBeLessThan(0.35);
  });

  it('accepts only the correct option under the row rules', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 80; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      for (let option = 0; option < sample.options.length; option++) {
        const holds = panelSatisfiesRules(sample.options[option], sample.context, sample.rules);
        expect(holds).toBe(option === sample.item.answer);
      }
    }
  });

  it('tags each item with the family that matches its construction', () => {
    const families = ['mx-attribute', 'mx-overlay', 'mx-composite'];
    const rng = createRng(17);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      const panel = sample.context[0][0];
      const constructed = panel.kind === 'lines' ? 'mx-overlay' : panel.layout === 'single' ? 'mx-attribute' : 'mx-composite';
      expect(families).toContain(sample.item.family);
      expect(sample.item.family).toBe(constructed);
      seen.add(sample.item.family ?? '');
      const level = Number(sample.item.id.split('-')[1]);
      if (level <= 5 || level === 7) expect(sample.item.family).toBe('mx-attribute');
      if (level === 6) expect(sample.item.family).toBe('mx-overlay');
      if (level === 8 || level === 10) expect(sample.item.family).toBe('mx-composite');
    }
    expect([...seen].sort()).toEqual([...families].sort());
    expect(matricesGenerator.practice().family).toBe('mx-attribute');
  });

  it('keeps every entity large enough to tell shape, fill, and size apart', () => {
    const rng = createRng(404);
    let sawSizeSteps = false;
    const check = (panels: Parameters<typeof entityMetrics>[0][]) => {
      const diameters = new Map<string, Map<number, number>>();
      const shapes = new Map<string, Set<string>>();
      const fills = new Map<string, Set<number>>();
      for (const panel of panels) {
        for (const entity of entityMetrics(panel)) {
          expect(entity.diameter).toBeGreaterThanOrEqual(11);
          const known = diameters.get(entity.placement) ?? new Map<number, number>();
          const prior = known.get(entity.size);
          if (prior === undefined) known.set(entity.size, entity.diameter);
          else expect(prior).toBeCloseTo(entity.diameter, 6);
          diameters.set(entity.placement, known);
          const shapeSet = shapes.get(entity.placement) ?? new Set<string>();
          shapeSet.add(entity.shape);
          shapes.set(entity.placement, shapeSet);
          const fillSet = fills.get(entity.placement) ?? new Set<number>();
          fillSet.add(entity.fill);
          fills.set(entity.placement, fillSet);
        }
      }
      for (const [placement, sizes] of diameters) {
        const discriminate = (shapes.get(placement)?.size ?? 0) > 1 || (fills.get(placement)?.size ?? 0) > 1;
        const ordered = [...sizes.entries()].sort((a, b) => a[0] - b[0]);
        for (const [, diameter] of ordered) {
          if (discriminate) expect(diameter).toBeGreaterThanOrEqual(16);
        }
        for (let index = 1; index < ordered.length; index++) {
          sawSizeSteps = true;
          expect(ordered[index][1] / ordered[index - 1][1]).toBeGreaterThanOrEqual(1.4);
        }
      }
    };
    for (let i = 0; i < 500; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      check([...sample.context.flat(), ...sample.options]);
    }
    expect(sawSizeSteps).toBe(true);
  });

  it('uses three distinct row values, and draws high counts large enough to tell shapes apart', () => {
    const rng = createRng(5150);
    let sawConstant = false;
    let sawCrowdedShapes = false;
    for (let i = 0; i < 160; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      for (const rule of sample.rules) {
        if (rule.kind !== 'constant') continue;
        sawConstant = true;
        const values = [0, 1, 2].map((row) => attributeAt(sample.context[row][0], rule.component, rule.attr));
        expect(new Set(values).size).toBe(3);
        for (const matrixRow of sample.context) {
          const across = [0, 1, 2].map((col) => attributeAt(matrixRow[col], rule.component, rule.attr));
          expect(new Set(across).size).toBe(1);
        }
      }
      if (sample.item.explanation.includes('changes from row to row')) {
        expect(sample.rules.some((rule) => rule.kind === 'constant')).toBe(true);
      }
      const panels = [...sample.context.flat(), ...sample.options];
      const shapes = new Set<string>();
      for (const panel of panels) {
        if (panel.kind === 'figure' && panel.layout === 'single') shapes.add(panel.outer.shape);
      }
      if (shapes.size < 2) continue;
      for (const panel of panels) {
        if (panel.kind !== 'figure' || panel.layout !== 'single' || panel.outer.count < 5) continue;
        sawCrowdedShapes = true;
        expect(entityMetrics(panel)[0]?.diameter ?? 0).toBeGreaterThanOrEqual(20);
      }
    }
    expect(sawConstant).toBe(true);
    expect(sawCrowdedShapes).toBe(true);
  });

  it('draws every orientation change at least 30° apart once shape symmetry is removed', () => {
    const rng = createRng(3030);
    let sawRotationRule = false;
    for (let i = 0; i < 600; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      if (sample.rules.some((rule) => rule.kind === 'progression' && rule.attr === 'rotation')) sawRotationRule = true;
      const panels = [...sample.context.flat().slice(0, 8), ...sample.options];
      for (const component of COMPONENTS) {
        const figures = panels.map((panel) => figureOf(panel, component)).filter((fig) => fig !== null);
        for (let a = 0; a < figures.length; a++) {
          for (let b = a + 1; b < figures.length; b++) {
            const [left, right] = [figures[a], figures[b]];
            if (!left || !right || left.shape !== right.shape || left.rotation === right.rotation) continue;
            expect(apparentTurn(left.shape, left.rotation, right.rotation), `${sample.item.id} ${component}`).toBeGreaterThanOrEqual(30);
          }
        }
      }
    }
    expect(sawRotationRule).toBe(true);
  });

  it('admits one value per attribute and one line operation under every standard reading', () => {
    const rng = createRng(6060);
    for (let i = 0; i < 1000; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      const correct = sample.context[2][2];
      if (correct.kind === 'lines') {
        const masks = sample.context.map((row) => row.map((panel) => (panel.kind === 'lines' ? panel.mask : -1)));
        const fitting = new Set(
          LINE_OPS.filter((op) => [0, 1].every((row) => masks[row][2] === op(masks[row][0], masks[row][1])))
            .map((op) => op(masks[2][0], masks[2][1])),
        );
        expect([...fitting], sample.item.id).toEqual([correct.mask]);
      }
      for (const component of COMPONENTS) {
        if (!figureOf(correct, component)) continue;
        for (const attr of ATTRIBUTES) {
          const grid = sample.context.map((row) => row.map((panel) => attributeAt(panel, component, attr)));
          const readings = independentReadings(grid, attr !== 'shape');
          expect([...readings], `${sample.item.id} ${component}.${attr}`).toEqual([grid[2][2]]);
        }
      }
    }
  });

  it('shows every planned rule, with count arithmetic alone only at level 4', () => {
    const minimumRules: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 1, 5: 2, 6: 1, 7: 3, 8: 3, 9: 2, 10: 6 };
    const rng = createRng(8080);
    let sawLoneArithmetic = false;
    for (let i = 0; i < 600; i++) {
      const sample = generateMatrices(rng, LEVEL_B[i % LEVEL_B.length], new Set());
      const level = Number(sample.item.id.split('-')[1]);
      const rules = nonFixedRules(sample);
      expect(rules.length, sample.item.id).toBeGreaterThanOrEqual(minimumRules[level]);
      if (rules.length === 1 && rules[0].kind === 'arithmetic') {
        sawLoneArithmetic = true;
        expect(level, sample.item.id).toBe(4);
      }
    }
    expect(sawLoneArithmetic).toBe(true);
  });

  it('falls back to the nearest free level, not the lowest one', () => {
    const blocked = new Set(['mx-10-', 'mx-9-', 'mx-8-']);
    const usedIds = { has: (id: string) => [...blocked].some((prefix) => id.startsWith(prefix)) } as ReadonlySet<string>;
    for (const seed of [1, 2, 3, 4, 5]) {
      const sample = generateMatrices(createRng(seed), 2.7, usedIds);
      expect(sample.item.id.startsWith('mx-7-'), sample.item.id).toBe(true);
      expect(sample.item.b).toBe(1.2);
    }
  });

  it('returns one fixed easy practice item', () => {
    const a = matricesGenerator.practice();
    const b = matricesGenerator.practice();
    expect(a).toEqual(b);
    expect(a.kind).toBe('choice');
    expect(a.domain).toBe('matrices');
    expect(a.b).toBe(-2.5);
    expect(a.a).toBeGreaterThanOrEqual(1.4);
    expect(a.a).toBeLessThanOrEqual(1.8);
    expect(a.prompt).toBe('Which option completes the pattern?');
    if (a.kind === 'choice') {
      expect(a.answer).toBeGreaterThanOrEqual(0);
      expect(a.answer).toBeLessThan(8);
      expect(a.options).toHaveLength(8);
      expect(a.stimulus.type).toBe('svg');
    }
  });
});
