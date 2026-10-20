import { createRng, type Rng } from '../core/rng';
import type { ChoiceItem, ItemGenerator } from '../core/types';

/**
 * Raven-style progressive matrices.
 *
 * Distractors are an attribute bisection: three binary edits of the correct
 * panel, all 8 combinations shown. Each edited value then appears in exactly
 * half the options, so the key cannot be picked by agreeing with the majority.
 */

const SHAPES = ['triangle', 'square', 'pentagon', 'hexagon', 'circle'] as const;
type ShapeName = (typeof SHAPES)[number];

const FILL = ['#ffffff', '#d1d5db', '#6b7280', '#1f2937'] as const;
const FILL_NAME = ['white', 'light gray', 'dark gray', 'black'] as const;
const INK = '#1f2937';
const ANGLES: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
const ATTRS = ['shape', 'size', 'fill', 'count', 'rotation'] as const;
type Attr = (typeof ATTRS)[number];
type Component = 'single' | 'outer' | 'inner' | 'left' | 'right' | 'accent';
type OverlayOp = 'or' | 'xor' | 'and' | 'diff';

const SHAPE_CODE: Record<ShapeName, string> = {
  triangle: 't',
  square: 'q',
  pentagon: 'p',
  hexagon: 'h',
  circle: 'c',
};

interface Figure {
  shape: ShapeName;
  size: number;
  fill: number;
  count: number;
  rotation: number;
}

interface FigurePanel {
  kind: 'figure';
  layout: 'single' | 'nested' | 'split';
  outer: Figure;
  inner?: Figure;
}

interface LinePanel {
  kind: 'lines';
  mask: number;
  accent: Figure | null;
}

type Panel = FigurePanel | LinePanel;

interface FigureRule {
  kind: 'fixed' | 'constant' | 'progression' | 'distribute3' | 'arithmetic';
  component: Component;
  attr: Attr;
  step?: number;
  op?: 'add' | 'sub';
}

interface OverlayRule {
  kind: 'overlay';
  op: OverlayOp;
}

type Rule = FigureRule | OverlayRule;

interface AttrPlan {
  attr: Attr;
  rule: FigureRule['kind'];
  sameStart?: boolean;
}

type MatrixFamily = 'mx-attribute' | 'mx-overlay' | 'mx-composite';

interface Draft {
  panels: Panel[][];
  rules: Rule[];
  family: MatrixFamily;
}

export interface MatrixSample {
  item: ChoiceItem;
  optionVectors: string[][];
  optionSignatures: string[];
  context: Panel[][];
  options: Panel[];
  rules: Rule[];
}

interface Mod {
  key: string;
  varying: boolean;
  correctLabel: string;
  altLabel: string;
  apply(panel: Panel): Panel;
}

interface Level {
  level: number;
  b: number;
  a: number;
  build(rng: Rng): Draft | null;
}

/** Ink stroke in cell units. White fills use this too, so it stays above 2. */
const STROKE = 2.5;
/** Single centered shape. Adjacent steps are at least 1.4× (26/18, 37/26, 52/37). */
const CENTER_DIAMETER = [18, 26, 37, 52];
/** Count layouts use the same steps, scaled so the small end is still 16 across a 3×3 grid. */
const GRID_SCALE = 16 / 18;
/** Nested outer shapes. The smallest still clears the largest nested inner shape. */
const OUTER_SCALE = 42 / 18;
const ACCENT_DIAMETER = 24;
const GRID: [number, number][] = [0, 1, 2].flatMap((row) =>
  [0, 1, 2].map((col) => [20 + col * 30, 20 + row * 30] as [number, number]),
);
const SPLIT_X = [26, 74];

const POINTS: ReadonlyArray<readonly [number, number]> = [
  [20, 20], [50, 20], [80, 20],
  [20, 50], [50, 50], [80, 50],
  [20, 80], [50, 80], [80, 80],
];

/** Twelve non-collinear segments: frame, midlines, diagonals, inner diamond. */
const SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [0, 2], [6, 8], [0, 6], [2, 8],
  [3, 5], [1, 7],
  [0, 8], [2, 6],
  [1, 3], [1, 5], [3, 7], [5, 7],
];

const PROMPT = 'Which option completes the pattern?';

function latinSquares(): number[][][] {
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const squares: number[][][] = [];
  for (const a of perms) {
    for (const b of perms) {
      for (const c of perms) {
        const columnsOk = [0, 1, 2].every((col) => new Set([a[col], b[col], c[col]]).size === 3);
        if (columnsOk) squares.push([a.slice(), b.slice(), c.slice()]);
      }
    }
  }
  return squares;
}

const LATIN = latinSquares();
if (LATIN.length !== 12) throw new Error(`expected 12 Latin squares, got ${LATIN.length}`);

function fixedGrid(value: number): number[][] {
  return [
    [value, value, value],
    [value, value, value],
    [value, value, value],
  ];
}

/** Three distinct row values, or one value everywhere when the domain has fewer than three. */
function constantRows(rng: Rng, min: number, max: number, component: Component, attr: Attr): { values: number[][]; rule: FigureRule } {
  const domain: number[] = [];
  for (let value = min; value <= max; value++) domain.push(value);
  if (domain.length < 3) {
    return { values: fixedGrid(rng.pick(domain)), rule: { kind: 'fixed', component, attr } };
  }
  const picked = rng.shuffle(domain).slice(0, 3);
  return {
    values: picked.map((value) => [value, value, value]),
    rule: { kind: 'constant', component, attr },
  };
}

function rangeOf(attr: Attr): { min: number; max: number } {
  if (attr === 'shape') return { min: 0, max: 4 };
  if (attr === 'count') return { min: 2, max: 9 };
  return { min: 0, max: 3 };
}

function possibleStarts(min: number, max: number, step: number): number[] {
  const starts: number[] = [];
  for (let start = min; start <= max; start++) {
    const mid = start + step;
    const end = start + 2 * step;
    if (mid >= min && mid <= max && end >= min && end <= max) starts.push(start);
  }
  return starts;
}

function rotationStarts(step: number): number[] {
  return ANGLES.filter((start) => ANGLES.includes(start + step) && ANGLES.includes(start + 2 * step));
}

function pickStartTriple(rng: Rng, starts: number[], sameStart: boolean): [number, number, number] | null {
  if (starts.length === 0) return null;
  if (sameStart) {
    const start = rng.pick(starts);
    return [start, start, start];
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const triple: [number, number, number] = [rng.pick(starts), rng.pick(starts), rng.pick(starts)];
    if (new Set(triple).size > 1) return triple;
  }
  if (starts.length === 1) return [starts[0], starts[0], starts[0]];
  return [starts[0], starts[0], starts[1] ?? starts[0]];
}

function applyLatin(symbols: number[], pattern: number[][]): number[][] {
  return pattern.map((row) => row.map((index) => symbols[index]));
}

function materialize(rng: Rng, plan: AttrPlan, component: Component, sizeMax: number): { values: number[][]; rule: FigureRule } | null {
  if (plan.attr === 'rotation') return materializeRotation(rng, plan, component);
  const { min, max } = plan.attr === 'size' ? { min: 0, max: sizeMax } : rangeOf(plan.attr);
  if (plan.rule === 'constant') return constantRows(rng, min, max, component, plan.attr);
  if (plan.rule === 'progression') {
    const steps = [1, -1, 2, -2].filter((step) => possibleStarts(min, max, step).length > 0);
    if (steps.length === 0) return null;
    const step = rng.pick(steps);
    const starts = pickStartTriple(rng, possibleStarts(min, max, step), plan.sameStart ?? false);
    if (!starts) return null;
    return {
      values: starts.map((start) => [start, start + step, start + 2 * step]),
      rule: { kind: 'progression', component, attr: plan.attr, step },
    };
  }
  if (plan.rule === 'distribute3') {
    const symbols = rng.shuffle(Array.from({ length: max - min + 1 }, (_, i) => min + i)).slice(0, 3);
    if (symbols.length < 3) return null;
    return {
      values: applyLatin(symbols, rng.pick(LATIN)),
      rule: { kind: 'distribute3', component, attr: plan.attr },
    };
  }
  if (plan.rule === 'arithmetic') {
    if (plan.attr !== 'count') return null;
    const op = rng.pick(['add', 'sub'] as const);
    const values: number[][] = [];
    for (let row = 0; row < 3; row++) {
      if (op === 'add') {
        const left = rng.int(2, 4);
        const right = rng.int(2, Math.min(4, 9 - left));
        values.push([left, right, left + right]);
      } else {
        const left = rng.int(5, 9);
        const right = rng.int(2, Math.min(3, left - 2));
        values.push([left, right, left - right]);
      }
    }
    return { values, rule: { kind: 'arithmetic', component, attr: 'count', op } };
  }
  return null;
}

function materializeRotation(rng: Rng, plan: AttrPlan, component: Component): { values: number[][]; rule: FigureRule } | null {
  if (plan.rule === 'progression') {
    const steps = [45, -45, 90, -90].filter((step) => rotationStarts(step).length > 0);
    const step = rng.pick(steps);
    const starts = pickStartTriple(rng, rotationStarts(step), plan.sameStart ?? false);
    if (!starts) return null;
    return {
      values: starts.map((start) => [start, start + step, start + 2 * step]),
      rule: { kind: 'progression', component, attr: 'rotation', step },
    };
  }
  if (plan.rule === 'distribute3') {
    const symbols = rng.shuffle([...ANGLES]).slice(0, 3);
    return {
      values: applyLatin(symbols, rng.pick(LATIN)),
      rule: { kind: 'distribute3', component, attr: 'rotation' },
    };
  }
  if (plan.rule === 'constant') {
    const picked = rng.shuffle([...ANGLES]).slice(0, 3);
    return {
      values: picked.map((value) => [value, value, value]),
      rule: { kind: 'constant', component, attr: 'rotation' },
    };
  }
  return null;
}

function buildAttrs(rng: Rng, plans: AttrPlan[], component: Component, sizeMax: number): { grids: Record<Attr, number[][]>; rules: FigureRule[] } | null {
  const shapeVaries = plans.some((plan) => plan.attr === 'shape');
  const rotationVaries = plans.some((plan) => plan.attr === 'rotation');
  if (shapeVaries && rotationVaries) return null;

  let shapeIndex = 0;
  if (rotationVaries) shapeIndex = SHAPES.indexOf(rng.pick(['triangle', 'pentagon'] as const));
  else if (!shapeVaries) shapeIndex = rng.int(0, 4);

  const grids: Record<Attr, number[][]> = {
    shape: fixedGrid(shapeIndex),
    size: fixedGrid(plans.some((plan) => plan.attr === 'size') ? Math.min(1, sizeMax) : rng.int(0, sizeMax)),
    fill: fixedGrid(plans.some((plan) => plan.attr === 'fill') ? 0 : rng.int(0, 3)),
    count: fixedGrid(1),
    rotation: fixedGrid(0),
  };
  const rules: FigureRule[] = [];
  for (const plan of plans) {
    // Two size steps can show a row change, but not a three-step progression.
    const usable = plan.attr === 'size' && sizeMax < 2 && (plan.rule === 'progression' || plan.rule === 'distribute3')
      ? { ...plan, rule: 'constant' as const }
      : plan;
    const made = materialize(rng, usable, component, sizeMax);
    if (!made) return null;
    grids[plan.attr] = made.values;
    rules.push(made.rule);
  }
  for (const attr of ATTRS) {
    if (!rules.some((rule) => rule.attr === attr)) {
      rules.push({ kind: 'fixed', component, attr });
    }
  }
  return { grids, rules };
}

function cellFigure(grids: Record<Attr, number[][]>, row: number, col: number): Figure {
  return {
    shape: SHAPES[grids.shape[row][col]],
    size: grids.size[row][col],
    fill: grids.fill[row][col],
    count: grids.count[row][col],
    rotation: grids.rotation[row][col],
  };
}

function shapeCrowded(panels: readonly Panel[]): boolean {
  const shapes = new Set<string>();
  let tight = false;
  for (const panel of panels) {
    if (panel.kind !== 'figure' || panel.layout !== 'single') continue;
    shapes.add(panel.outer.shape);
    const diameter = singleDiameter(panel.outer.count, panel.outer.size);
    if (panel.outer.count >= 5 && (diameter === null || diameter < 20)) tight = true;
  }
  return shapes.size > 1 && tight;
}

function buildSingle(rng: Rng, plans: AttrPlan[]): Draft | null {
  const countVaries = plans.some((plan) => plan.attr === 'count');
  const built = buildAttrs(rng, plans, 'single', countVaries ? 1 : 3);
  if (!built) return null;
  const panels: Panel[][] = [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => ({
      kind: 'figure' as const,
      layout: 'single' as const,
      outer: cellFigure(built.grids, row, col),
    })),
  );
  if (shapeCrowded(panels.flat())) {
    const sizeRule = built.rules.find((rule) => rule.kind === 'fixed' && rule.attr === 'size' && rule.component === 'single');
    if (!sizeRule) return null;
    for (const row of panels) {
      for (const panel of row) {
        if (panel.kind === 'figure') panel.outer.size = 1;
      }
    }
  }
  if (!panels.every((row) => row.every(panelLegible)) || shapeCrowded(panels.flat())) return null;
  return { panels, rules: built.rules, family: 'mx-attribute' };
}

function choosePlans(rng: Rng, count: number): AttrPlan[] {
  const pool: Attr[] = rng.chance(0.5) ? ['rotation', 'size', 'fill'] : ['shape', 'size', 'fill'];
  const chosen = rng.shuffle(pool).slice(0, count);
  const kinds = rng.shuffle(['progression', 'distribute3', 'constant'] as const).slice(0, count);
  return chosen.map((attr, index) => ({ attr, rule: kinds[index], sameStart: false }));
}

function buildPair(rng: Rng, outerCount: number, innerCount: number, layout: 'nested' | 'split'): Draft | null {
  const outerComponent: Component = layout === 'nested' ? 'outer' : 'left';
  const innerComponent: Component = layout === 'nested' ? 'inner' : 'right';
  const outerSizeMax = 2;
  const innerSizeMax = layout === 'nested' ? 1 : 2;
  const outer = buildAttrs(rng, choosePlans(rng, outerCount), outerComponent, outerSizeMax);
  const inner = buildAttrs(rng, choosePlans(rng, innerCount), innerComponent, innerSizeMax);
  if (!outer || !inner) return null;
  const panels: Panel[][] = [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => ({
      kind: 'figure' as const,
      layout,
      outer: { ...cellFigure(outer.grids, row, col), count: 1 },
      inner: { ...cellFigure(inner.grids, row, col), count: 1 },
    })),
  );
  if (!panels.every((row) => row.every(panelLegible))) return null;
  return { panels, rules: [...outer.rules, ...inner.rules], family: 'mx-composite' };
}

function popcount(mask: number): number {
  let count = 0;
  let bits = mask;
  while (bits) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
}

function applyOverlay(a: number, b: number, op: OverlayOp): number {
  if (op === 'or') return a | b;
  if (op === 'xor') return a ^ b;
  if (op === 'and') return a & b;
  return a & ~b;
}

function makeOverlayRow(rng: Rng, op: OverlayOp): [number, number, number] | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    let left = 0;
    let right = 0;
    for (let bit = 0; bit < SEGMENTS.length; bit++) {
      const roll = rng.int(0, 3);
      if (roll === 1 || roll === 3) left |= 1 << bit;
      if (roll === 2 || roll === 3) right |= 1 << bit;
    }
    const result = applyOverlay(left, right, op);
    if (popcount(left) < 2 || popcount(right) < 2 || popcount(result) < 2) continue;
    if (op === 'xor' && (left & right) === 0) continue;
    const proper = result !== left && result !== right;
    if (!proper && attempt < 50) continue;
    return [left, right, result];
  }
  return null;
}

function buildLines(rng: Rng, op: OverlayOp, accentPlans: AttrPlan[] | null): Draft | null {
  const rows: [number, number, number][] = [];
  for (let row = 0; row < 3; row++) {
    const made = makeOverlayRow(rng, op);
    if (!made) return null;
    rows.push(made);
  }
  if (rows[0].join() === rows[1].join() && rows[1].join() === rows[2].join()) return null;
  const rules: Rule[] = [{ kind: 'overlay', op }];
  let accent: { grids: Record<Attr, number[][]>; rules: FigureRule[] } | null = null;
  if (accentPlans) {
    accent = buildAttrs(rng, accentPlans, 'accent', 1);
    if (!accent) return null;
    rules.push(...accent.rules);
  }
  const panels: Panel[][] = rows.map((row, r) =>
    row.map((mask, c) => ({
      kind: 'lines' as const,
      mask,
      accent: accent ? { ...cellFigure(accent.grids, r, c), count: 1, size: 1, rotation: 0 } : null,
    })),
  );
  return { panels, rules, family: 'mx-overlay' };
}

function buildLevel1(rng: Rng): Draft | null {
  const attr = rng.pick(['count', 'size', 'fill', 'shape'] as const);
  return buildSingle(rng, [{ attr, rule: 'progression', sameStart: true }]);
}

function buildLevel2(rng: Rng): Draft | null {
  const attr = rng.pick(['shape', 'fill', 'size', 'count'] as const);
  return buildSingle(rng, [{ attr, rule: 'distribute3' }]);
}

function buildLevel3(rng: Rng): Draft | null {
  const pool: Attr[] = ['count', 'size', 'fill', 'shape'];
  const progressing = rng.pick(pool);
  const constant = rng.pick(pool.filter((attr) => attr !== progressing));
  return buildSingle(rng, [
    { attr: progressing, rule: 'progression', sameStart: false },
    { attr: constant, rule: 'constant' },
  ]);
}

function buildLevel4(rng: Rng): Draft | null {
  const pool: Attr[] = ['count', 'size', 'fill', 'shape', 'rotation'];
  const distributed = rng.pick(pool);
  const otherPool = pool.filter((attr) => attr !== distributed && !(attr === 'rotation' && distributed === 'shape') && !(attr === 'shape' && distributed === 'rotation'));
  const other = rng.pick(otherPool);
  return buildSingle(rng, [
    { attr: distributed, rule: 'distribute3' },
    { attr: other, rule: rng.pick(['progression', 'constant'] as const), sameStart: false },
  ]);
}

function buildLevel5(rng: Rng): Draft | null {
  if (rng.chance(0.45)) return buildSingle(rng, [{ attr: 'count', rule: 'arithmetic' }]);
  const pool: Attr[] = rng.chance(0.35) ? ['rotation', 'size', 'fill', 'count'] : ['shape', 'size', 'fill', 'count'];
  const chosen = rng.shuffle(pool).slice(0, 3);
  const kinds = ['progression', 'distribute3', 'constant'] as const;
  return buildSingle(rng, chosen.map((attr, index) => ({ attr, rule: kinds[index], sameStart: false })));
}

function buildLevel6(rng: Rng): Draft | null {
  return buildLines(rng, rng.pick(['or', 'xor'] as const), null);
}

function buildLevel7(rng: Rng): Draft | null {
  if (rng.chance(0.4)) {
    const other = rng.pick(['shape', 'fill', 'size'] as const);
    return buildSingle(rng, [
      { attr: 'count', rule: 'arithmetic' },
      { attr: other, rule: rng.pick(['progression', 'distribute3', 'constant'] as const), sameStart: false },
    ]);
  }
  const pool: Attr[] = rng.chance(0.35) ? ['rotation', 'size', 'fill', 'count'] : ['shape', 'size', 'fill', 'count'];
  const chosen = rng.shuffle(pool).slice(0, 3);
  return buildSingle(rng, [
    { attr: chosen[0], rule: 'distribute3' },
    { attr: chosen[1], rule: 'distribute3' },
    { attr: chosen[2], rule: rng.pick(['progression', 'constant'] as const), sameStart: false },
  ]);
}

function buildLevel8(rng: Rng): Draft | null {
  const layout = rng.pick(['nested', 'split'] as const);
  const outerCount = rng.chance(0.5) ? 2 : 1;
  const innerCount = outerCount === 2 ? 1 : 2;
  return buildPair(rng, outerCount, innerCount, layout);
}

function buildLevel9(rng: Rng): Draft | null {
  if (rng.chance(0.5)) {
    const op = rng.pick(['xor', 'and', 'diff'] as const);
    const attr = rng.pick(['fill', 'shape'] as const);
    const rule = rng.pick(['progression', 'distribute3'] as const);
    return buildLines(rng, op, [{ attr, rule, sameStart: false }]);
  }
  return buildPair(rng, 2, 2, rng.pick(['nested', 'split'] as const));
}

function buildLevel10(rng: Rng): Draft | null {
  return buildPair(rng, 3, 3, rng.pick(['nested', 'split'] as const));
}

const LEVELS: Level[] = [
  { level: 1, b: -2.4, a: 1.45, build: buildLevel1 },
  { level: 2, b: -1.8, a: 1.5, build: buildLevel2 },
  { level: 3, b: -1.1, a: 1.55, build: buildLevel3 },
  { level: 4, b: -0.5, a: 1.6, build: buildLevel4 },
  { level: 5, b: 0.1, a: 1.64, build: buildLevel5 },
  { level: 6, b: 0.6, a: 1.68, build: buildLevel6 },
  { level: 7, b: 1.2, a: 1.72, build: buildLevel7 },
  { level: 8, b: 1.7, a: 1.75, build: buildLevel8 },
  { level: 9, b: 2.2, a: 1.78, build: buildLevel9 },
  { level: 10, b: 2.7, a: 1.8, build: buildLevel10 },
];

function readFigure(fig: Figure, attr: Attr): number {
  if (attr === 'shape') return SHAPES.indexOf(fig.shape);
  if (attr === 'rotation') return fig.rotation;
  return fig[attr];
}

function writeFigure(fig: Figure, attr: Attr, value: number): void {
  if (attr === 'shape') fig.shape = SHAPES[value];
  else if (attr === 'size') fig.size = value;
  else if (attr === 'fill') fig.fill = value;
  else if (attr === 'count') fig.count = value;
  else fig.rotation = value;
}

function getFigure(panel: Panel, component: Component): Figure | null {
  if (component === 'accent') return panel.kind === 'lines' ? panel.accent : null;
  if (panel.kind !== 'figure') return null;
  if (component === 'inner' || component === 'right') return panel.inner ?? null;
  return panel.outer;
}

function readAttr(panel: Panel, rule: FigureRule): number | null {
  const fig = getFigure(panel, rule.component);
  return fig ? readFigure(fig, rule.attr) : null;
}

function withAttr(panel: Panel, component: Component, attr: Attr, value: number): Panel {
  const copy = structuredClone(panel);
  const fig = getFigure(copy, component);
  if (fig) writeFigure(fig, attr, value);
  return copy;
}

export function panelSignature(panel: Panel): string {
  if (panel.kind === 'lines') {
    return `L${panel.mask.toString(16)}:${panel.accent ? figureSignature(panel.accent) : ''}`;
  }
  return `${panel.layout}:${figureSignature(panel.outer)}:${panel.inner ? figureSignature(panel.inner) : ''}`;
}

function figureSignature(fig: Figure): string {
  return `${SHAPE_CODE[fig.shape]}${fig.size}${fig.fill}${fig.count}${fig.rotation / 45}`;
}

function ruleHolds(rule: Rule, panels: Panel[][]): boolean {
  if (rule.kind === 'overlay') {
    for (let row = 0; row < 3; row++) {
      const left = panels[row][0];
      const mid = panels[row][1];
      const right = panels[row][2];
      if (left.kind !== 'lines' || mid.kind !== 'lines' || right.kind !== 'lines') return false;
      if (right.mask !== applyOverlay(left.mask, mid.mask, rule.op)) return false;
    }
    return true;
  }
  const grid: number[][] = [];
  for (let row = 0; row < 3; row++) {
    const values: number[] = [];
    for (let col = 0; col < 3; col++) {
      const value = readAttr(panels[row][col], rule);
      if (value === null) return false;
      values.push(value);
    }
    grid.push(values);
  }
  if (rule.kind === 'fixed') return grid.every((row) => row.every((value) => value === grid[0][0]));
  if (rule.kind === 'constant') return grid.every((row) => row.every((value) => value === row[0]));
  if (rule.kind === 'progression') {
    const step = rule.step ?? 0;
    return grid.every((row) => row[1] - row[0] === step && row[2] - row[1] === step);
  }
  if (rule.kind === 'distribute3') {
    const key = [...grid[0]].sort((a, b) => a - b).join(',');
    if (new Set(grid[0]).size !== 3) return false;
    for (const row of grid) {
      if (new Set(row).size !== 3) return false;
      if ([...row].sort((a, b) => a - b).join(',') !== key) return false;
    }
    for (let col = 0; col < 3; col++) {
      if (new Set([grid[0][col], grid[1][col], grid[2][col]]).size !== 3) return false;
    }
    return true;
  }
  return grid.every((row) => row[2] === (rule.op === 'sub' ? row[0] - row[1] : row[0] + row[1]));
}

export function panelSatisfiesRules(candidate: Panel, context: Panel[][], rules: Rule[]): boolean {
  const grid = context.map((row) => row.slice());
  grid[2][2] = candidate;
  return rules.every((rule) => ruleHolds(rule, grid));
}

function distinctAngles(shape: ShapeName): number[] {
  if (shape === 'circle') return [0];
  if (shape === 'square') return [0, 45];
  if (shape === 'hexagon') return [0, 45, 90, 135];
  return [...ANGLES];
}

function sizeCeiling(panel: Panel, component: Component): number {
  if (panel.kind !== 'figure') return 1;
  if (panel.layout === 'nested') return component === 'inner' ? 1 : 2;
  if (panel.layout === 'split') return 2;
  return panel.outer.count <= 1 ? 3 : 1;
}

function altValue(rng: Rng, fig: Figure, attr: Attr, correct: number, sizeMax: number): number | null {
  if (attr === 'shape') return rng.pick([0, 1, 2, 3, 4].filter((value) => value !== correct));
  if (attr === 'fill') {
    const near = [correct - 1, correct + 1].filter((value) => value >= 0 && value <= 3);
    const pool = near.length > 0 ? near : [0, 1, 2, 3].filter((value) => value !== correct);
    return rng.pick(pool);
  }
  if (attr === 'size') {
    const near = [correct - 1, correct + 1].filter((value) => value >= 0 && value <= sizeMax);
    const pool = near.length > 0 ? near : Array.from({ length: sizeMax + 1 }, (_, value) => value).filter((value) => value !== correct);
    return pool.length > 0 ? rng.pick(pool) : null;
  }
  if (attr === 'count') {
    const pool = [2, 3, 4, 5, 6, 7, 8, 9].filter((value) => value !== correct && singleDiameter(value, fig.size) !== null);
    if (pool.length === 0) return null;
    const near = pool.filter((value) => Math.abs(value - correct) <= 2);
    return rng.pick(near.length > 0 ? near : pool);
  }
  const angles = distinctAngles(fig.shape).filter((angle) => angle !== fig.rotation);
  return angles.length > 0 ? rng.pick(angles) : null;
}

function valueLabel(attr: Attr, value: number): string {
  if (attr === 'shape') return SHAPES[value];
  if (attr === 'rotation') return `${value}deg`;
  return String(value);
}

function figureMod(rng: Rng, panel: Panel, component: Component, attr: Attr, rules: Rule[]): Mod | null {
  const fig = getFigure(panel, component);
  if (!fig) return null;
  const correct = readFigure(fig, attr);
  const alt = altValue(rng, fig, attr, correct, sizeCeiling(panel, component));
  if (alt === null || alt === correct) return null;
  const varying = rules.some((rule) => rule.kind !== 'overlay' && rule.kind !== 'fixed' && rule.component === component && rule.attr === attr);
  return {
    key: `${component}.${attr}`,
    varying,
    correctLabel: valueLabel(attr, correct),
    altLabel: valueLabel(attr, alt),
    apply: (next) => withAttr(next, component, attr, alt),
  };
}

function candidateMods(rng: Rng, panel: Panel, rules: Rule[]): Mod[] {
  if (panel.kind === 'lines') {
    const mods: Mod[] = rng.shuffle(SEGMENTS.map((_, bit) => bit)).map((bit) => {
      const on = (panel.mask >> bit) & 1;
      return {
        key: `bit${bit}`,
        varying: true,
        correctLabel: String(on),
        altLabel: String(1 - on),
        apply(next: Panel) {
          const copy = structuredClone(next);
          if (copy.kind === 'lines') copy.mask ^= 1 << bit;
          return copy;
        },
      };
    });
    if (panel.accent) {
      for (const attr of ['shape', 'fill'] as const) {
        const mod = figureMod(rng, panel, 'accent', attr, rules);
        if (mod) mods.push(mod);
      }
    }
    return mods;
  }
  const components: Component[] = panel.layout === 'single'
    ? ['single']
    : panel.layout === 'nested'
      ? ['outer', 'inner']
      : ['left', 'right'];
  const attrs: Attr[] = panel.layout === 'single'
    ? ['shape', 'size', 'fill', 'count', 'rotation']
    : ['shape', 'size', 'fill', 'rotation'];
  const mods: Mod[] = [];
  for (const component of components) {
    for (const attr of attrs) {
      const mod = figureMod(rng, panel, component, attr, rules);
      if (mod) mods.push(mod);
    }
  }
  return mods;
}

function conflicts(mods: Mod[]): boolean {
  const shapeParts = new Set(mods.filter((mod) => mod.key.endsWith('.shape')).map((mod) => mod.key.split('.')[0]));
  return mods.some((mod) => mod.key.endsWith('.rotation') && shapeParts.has(mod.key.split('.')[0]));
}

function applyMask(panel: Panel, mods: Mod[], mask: number): Panel {
  let next = panel;
  for (let index = 0; index < mods.length; index++) {
    if ((mask & (1 << index)) !== 0) next = mods[index].apply(next);
  }
  return next;
}

function modsOk(mods: Mod[], correct: Panel, rules: Rule[], context: Panel[][]): boolean {
  if (conflicts(mods)) return false;
  if (new Set(mods.map((mod) => mod.key)).size !== mods.length) return false;
  const signatures = new Set<string>();
  const drawings = new Set<string>();
  const options: Panel[] = [];
  for (let mask = 0; mask < 8; mask++) {
    const panel = applyMask(correct, mods, mask);
    const signature = panelSignature(panel);
    const drawing = renderPanel(panel);
    if (!panelLegible(panel) || signatures.has(signature) || drawings.has(drawing)) return false;
    signatures.add(signature);
    drawings.add(drawing);
    options.push(panel);
    if (panelSatisfiesRules(panel, context, rules) !== (mask === 0)) return false;
  }
  return !shapeCrowded([...context.flat(), ...options]);
}

function selectMods(rng: Rng, correct: Panel, rules: Rule[], context: Panel[][]): Mod[] | null {
  const pool = candidateMods(rng, correct, rules);
  const varying = pool.filter((mod) => mod.varying);
  const steady = pool.filter((mod) => !mod.varying);
  const accent = rng.shuffle(varying.filter((mod) => !mod.key.startsWith('bit')));
  const bits = rng.shuffle(varying.filter((mod) => mod.key.startsWith('bit')));
  const ordered = [...accent, ...bits, ...rng.shuffle(steady)];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      for (let k = j + 1; k < ordered.length; k++) {
        const mods = [ordered[i], ordered[j], ordered[k]];
        if (modsOk(mods, correct, rules, context)) return mods;
      }
    }
  }
  return null;
}

function singleDiameter(count: number, size: number): number | null {
  if (size < 0 || size >= CENTER_DIAMETER.length) return null;
  if (count <= 1) return CENTER_DIAMETER[size];
  if (size > 1) return null;
  return CENTER_DIAMETER[size] * GRID_SCALE;
}

function nestedOuterDiameter(size: number): number | null {
  if (size < 0 || size > 2) return null;
  return CENTER_DIAMETER[size] * OUTER_SCALE;
}

function nestedInnerDiameter(size: number): number | null {
  if (size < 0 || size > 1) return null;
  return CENTER_DIAMETER[size] * GRID_SCALE;
}

function splitDiameter(size: number): number | null {
  if (size < 0 || size > 2) return null;
  return CENTER_DIAMETER[size];
}

function fitsPoint(cx: number, cy: number, diameter: number): boolean {
  const reach = diameter / 2 + STROKE / 2;
  return cx - reach >= 0 && cy - reach >= 0 && cx + reach <= 100 && cy + reach <= 100;
}

function marksClear(a: [number, number], b: [number, number], left: number, right: number): boolean {
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return dist >= left / 2 + right / 2 + STROKE;
}

function panelLegible(panel: Panel): boolean {
  if (panel.kind === 'lines') return !panel.accent || fitsPoint(50, 50, ACCENT_DIAMETER);
  if (panel.layout === 'nested' && panel.inner) {
    const outer = nestedOuterDiameter(panel.outer.size);
    const inner = nestedInnerDiameter(panel.inner.size);
    if (outer === null || inner === null) return false;
    return fitsPoint(50, 50, outer) && outer / 2 - inner / 2 >= 6;
  }
  if (panel.layout === 'split' && panel.inner) {
    const left = splitDiameter(panel.outer.size);
    const right = splitDiameter(panel.inner.size);
    if (left === null || right === null) return false;
    return fitsPoint(SPLIT_X[0], 50, left)
      && fitsPoint(SPLIT_X[1], 50, right)
      && marksClear([SPLIT_X[0], 50], [SPLIT_X[1], 50], left, right);
  }
  const count = panel.outer.count;
  const diameter = singleDiameter(count, panel.outer.size);
  if (diameter === null) return false;
  const centers: [number, number][] = count <= 1 ? [[50, 50]] : GRID.slice(0, count);
  if (centers.length !== count) return false;
  if (centers.some(([x, y]) => !fitsPoint(x, y, diameter))) return false;
  return centers.every((center, index) => centers.slice(index + 1).every((other) => marksClear(center, other, diameter, diameter)));
}

export interface EntityMetric {
  placement: 'center' | 'grid' | 'nested-outer' | 'nested-inner' | 'split' | 'accent';
  size: number;
  diameter: number;
  shape: ShapeName;
  fill: number;
}

export function entityMetrics(panel: Panel): EntityMetric[] {
  if (panel.kind === 'lines') {
    if (!panel.accent) return [];
    return [{ placement: 'accent', size: panel.accent.size, diameter: ACCENT_DIAMETER, shape: panel.accent.shape, fill: panel.accent.fill }];
  }
  const metrics: EntityMetric[] = [];
  if (panel.layout === 'nested' && panel.inner) {
    const outer = nestedOuterDiameter(panel.outer.size) ?? 0;
    const inner = nestedInnerDiameter(panel.inner.size) ?? 0;
    metrics.push({ placement: 'nested-outer', size: panel.outer.size, diameter: outer, shape: panel.outer.shape, fill: panel.outer.fill });
    metrics.push({ placement: 'nested-inner', size: panel.inner.size, diameter: inner, shape: panel.inner.shape, fill: panel.inner.fill });
    return metrics;
  }
  if (panel.layout === 'split' && panel.inner) {
    const left = splitDiameter(panel.outer.size) ?? 0;
    const right = splitDiameter(panel.inner.size) ?? 0;
    metrics.push({ placement: 'split', size: panel.outer.size, diameter: left, shape: panel.outer.shape, fill: panel.outer.fill });
    metrics.push({ placement: 'split', size: panel.inner.size, diameter: right, shape: panel.inner.shape, fill: panel.inner.fill });
    return metrics;
  }
  const count = Math.max(1, panel.outer.count);
  const placement = count <= 1 ? 'center' : 'grid';
  const diameter = singleDiameter(count, panel.outer.size) ?? 0;
  for (let index = 0; index < count; index++) {
    metrics.push({ placement, size: panel.outer.size, diameter, shape: panel.outer.shape, fill: panel.outer.fill });
  }
  return metrics;
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function polygonPoints(sides: number, cx: number, cy: number, radius: number, rotation: number, base: number): string {
  const start = ((base + rotation) * Math.PI) / 180;
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = start + (i * 2 * Math.PI) / sides;
    points.push(`${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))}`);
  }
  return points.join(' ');
}

function renderShape(fig: Figure, cx: number, cy: number, radius: number, separate: boolean): string {
  const fill = FILL[fig.fill] ?? FILL[0];
  const stroke = fig.fill === 0 ? Math.max(2, STROKE) : STROKE;
  if (fig.shape === 'circle') {
    const halo = separate
      ? `<circle cx="${cx}" cy="${cy}" r="${radius + 2}" fill="#ffffff" stroke="#ffffff" stroke-width="3"/>`
      : '';
    return `${halo}<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="${fill}" stroke="${INK}" stroke-width="${stroke}"/>`;
  }
  const sides = { triangle: 3, square: 4, pentagon: 5, hexagon: 6 }[fig.shape];
  const base = { triangle: -90, square: 45, pentagon: -90, hexagon: 0 }[fig.shape];
  const points = polygonPoints(sides, cx, cy, radius, fig.rotation, base);
  const halo = separate
    ? `<polygon points="${points}" fill="#ffffff" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/>`
    : '';
  return `${halo}<polygon points="${points}" fill="${fill}" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>`;
}

function renderAt(fig: Figure, centers: readonly (readonly [number, number])[], diameter: number, separate = false): string {
  return centers.map(([cx, cy]) => renderShape(fig, cx, cy, diameter / 2, separate)).join('');
}

function renderPanel(panel: Panel): string {
  if (panel.kind === 'lines') {
    const lines = SEGMENTS.map(([from, to], bit) => {
      if ((panel.mask & (1 << bit)) === 0) return '';
      const [x1, y1] = POINTS[from];
      const [x2, y2] = POINTS[to];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round"/>`;
    }).join('');
    return lines + (panel.accent ? renderAt(panel.accent, [[50, 50]], ACCENT_DIAMETER, true) : '');
  }
  if (panel.layout === 'nested' && panel.inner) {
    const outer = nestedOuterDiameter(panel.outer.size) ?? CENTER_DIAMETER[0] * OUTER_SCALE;
    const inner = nestedInnerDiameter(panel.inner.size) ?? CENTER_DIAMETER[0] * GRID_SCALE;
    return renderAt(panel.outer, [[50, 50]], outer) + renderAt(panel.inner, [[50, 50]], inner);
  }
  if (panel.layout === 'split' && panel.inner) {
    const left = splitDiameter(panel.outer.size) ?? CENTER_DIAMETER[0];
    const right = splitDiameter(panel.inner.size) ?? CENTER_DIAMETER[0];
    return renderAt(panel.outer, [[SPLIT_X[0], 50]], left) + renderAt(panel.inner, [[SPLIT_X[1], 50]], right);
  }
  const diameter = singleDiameter(panel.outer.count, panel.outer.size) ?? CENTER_DIAMETER[0];
  const centers = panel.outer.count <= 1 ? [[50, 50] as [number, number]] : GRID.slice(0, panel.outer.count);
  return renderAt(panel.outer, centers, diameter);
}

function svgDoc(viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}

function renderStimulus(panels: Panel[][]): string {
  const cells: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * 115;
      const y = row * 115;
      if (row === 2 && col === 2) {
        cells.push(
          `<g transform="translate(${x},${y})"><rect width="100" height="100" rx="6" fill="#ffffff" stroke="#e5e7eb" stroke-dasharray="6 4"/>` +
            `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="36">?</text></g>`,
        );
      } else {
        cells.push(
          `<g transform="translate(${x},${y})"><rect width="100" height="100" rx="6" fill="#ffffff" stroke="#e5e7eb"/>${renderPanel(panels[row][col])}</g>`,
        );
      }
    }
  }
  return svgDoc('0 0 330 330', cells.join(''));
}

function renderOption(panel: Panel): string {
  return svgDoc('0 0 100 100', renderPanel(panel));
}

function attrPhrase(attr: Attr): string {
  if (attr === 'count') return 'the number of shapes';
  if (attr === 'size') return 'the size';
  if (attr === 'fill') return 'the shading';
  if (attr === 'shape') return 'the shape';
  return 'the orientation';
}

function englishList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function namedValue(attr: Attr, value: number): string {
  if (attr === 'shape') return SHAPES[value];
  if (attr === 'fill') return FILL_NAME[value];
  if (attr === 'size') return ['small', 'medium', 'large', 'very large'][value] ?? String(value);
  if (attr === 'count') return String(value);
  return `${value} degrees`;
}

function ruleClause(rule: FigureRule, panels: Panel[][]): string | null {
  if (rule.kind === 'fixed') return null;
  if (rule.kind === 'progression') {
    const step = rule.step ?? 1;
    const amount = Math.abs(step) === 1 ? 'one' : 'two';
    if (rule.attr === 'count') return `the number of shapes ${step > 0 ? 'increases' : 'decreases'} by ${amount}`;
    if (rule.attr === 'size') {
      const unit = Math.abs(step) === 1 ? 'step' : 'steps';
      return step > 0 ? `the size grows by ${amount} ${unit}` : `the size shrinks by ${amount} ${unit}`;
    }
    if (rule.attr === 'fill') {
      const unit = Math.abs(step) === 1 ? 'step' : 'steps';
      return step > 0 ? `the shading darkens by ${amount} ${unit}` : `the shading lightens by ${amount} ${unit}`;
    }
    if (rule.attr === 'shape') {
      const unit = Math.abs(step) === 1 ? 'step' : 'steps';
      return `the shape moves ${amount} ${unit} ${step > 0 ? 'forward' : 'backward'} in the order triangle, square, pentagon, hexagon, circle`;
    }
    return `the figure turns ${Math.abs(step)} degrees ${step > 0 ? 'clockwise' : 'counterclockwise'}`;
  }
  if (rule.kind === 'distribute3') {
    const values = [0, 1, 2].map((col) => readAttr(panels[0][col], rule)).filter((value): value is number => value !== null);
    const unique = [...new Set(values)].sort((a, b) => a - b);
    if (rule.attr === 'rotation') {
      return `the orientation cycles through ${englishList(unique.map(String))} degrees in a different order`;
    }
    const names = unique.map((value) => namedValue(rule.attr, value));
    return `${attrPhrase(rule.attr)} cycles through ${englishList(names)} in a different order`;
  }
  if (rule.kind === 'constant') {
    return `${attrPhrase(rule.attr)} stays the same within each row and changes from row to row`;
  }
  return rule.op === 'sub'
    ? "the number of shapes in the third panel is the first panel's count minus the second"
    : 'the number of shapes in the third panel is the sum of the first two panels';
}

function joinClauses(lead: string, clauses: string[]): string {
  if (clauses.length === 1) return `${lead} ${clauses[0]}.`;
  if (clauses.length === 2) return `${lead} ${clauses[0]}, while ${clauses[1]}.`;
  return `${lead} ${clauses[0]}, while ${clauses.slice(1, -1).join(', ')}, and ${clauses[clauses.length - 1]}.`;
}

function buildExplanation(rules: Rule[], panels: Panel[][]): string {
  const sentences: string[] = [];
  const overlay = rules.find((rule) => rule.kind === 'overlay');
  if (overlay && overlay.kind === 'overlay') {
    const text = {
      or: 'the third panel shows every line that appears in the first panel or the second',
      xor: 'a line appears in the third panel only when it is in exactly one of the first two panels',
      and: 'the third panel keeps only the lines shared by the first two panels',
      diff: 'the third panel keeps the lines that are in the first panel but not the second',
    }[overlay.op];
    sentences.push(`Across each row ${text}.`);
  }
  const leads: Record<Component, string> = {
    single: 'Across each row',
    outer: 'On the outer figure,',
    inner: 'On the inner figure,',
    left: 'On the left,',
    right: 'On the right,',
    accent: 'For the center shape,',
  };
  for (const component of ['single', 'outer', 'left', 'inner', 'right', 'accent'] as const) {
    const clauses = rules
      .filter((rule): rule is FigureRule => rule.kind !== 'overlay' && rule.component === component)
      .map((rule) => ruleClause(rule, panels))
      .filter((clause): clause is string => clause !== null);
    if (clauses.length > 0) sentences.push(joinClauses(leads[component], clauses));
  }
  return sentences.slice(0, 3).join(' ');
}

function contentId(level: number, panels: Panel[][]): string {
  const body = panels.map((row) => row.map(panelSignature).join('.')).join('~');
  return `mx-${level}-${body}`;
}

function vectorFor(mask: number, mods: Mod[]): string[] {
  return mods.map((mod, index) => ((mask & (1 << index)) !== 0 ? mod.altLabel : mod.correctLabel));
}

function assemble(rng: Rng, level: Level, draft: Draft): MatrixSample | null {
  const correct = draft.panels[2][2];
  if (!panelSatisfiesRules(correct, draft.panels, draft.rules)) return null;
  const mods = selectMods(rng, correct, draft.rules, draft.panels);
  if (!mods) return null;
  const combos = [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => applyMask(correct, mods, mask));
  const order = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
  const options = order.map((mask) => combos[mask]);
  const explanation = buildExplanation(draft.rules, draft.panels);
  if (!explanation) return null;
  const item: ChoiceItem = {
    kind: 'choice',
    id: contentId(level.level, draft.panels),
    domain: 'matrices',
    b: level.b,
    a: level.a,
    prompt: PROMPT,
    family: draft.family,
    explanation,
    stimulus: { type: 'svg', svg: renderStimulus(draft.panels) },
    options: options.map((panel) => ({ type: 'svg' as const, svg: renderOption(panel) })),
    answer: order.indexOf(0),
  };
  return {
    item,
    optionVectors: order.map((mask) => vectorFor(mask, mods)),
    optionSignatures: options.map(panelSignature),
    context: draft.panels,
    options,
    rules: draft.rules,
  };
}

function nearestLevelIndexes(targetB: number): number[] {
  let best = Number.POSITIVE_INFINITY;
  const indexes: number[] = [];
  LEVELS.forEach((level, index) => {
    const distance = Math.abs(level.b - targetB);
    if (distance < best - 1e-6) {
      best = distance;
      indexes.length = 0;
      indexes.push(index);
    } else if (distance <= best + 1e-6) {
      indexes.push(index);
    }
  });
  return indexes;
}

function tryLevel(rng: Rng, level: Level): MatrixSample | null {
  const draft = level.build(rng);
  if (!draft) return null;
  return assemble(rng, level, draft);
}

export function generateMatrices(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): MatrixSample {
  const near = nearestLevelIndexes(targetB);
  const primary = near.length === 1 ? near[0] : rng.pick(near);
  const order = [primary];
  for (const delta of rng.shuffle([-1, 1])) {
    const index = primary + delta;
    if (index >= 0 && index < LEVELS.length) order.push(index);
  }
  for (let index = 0; index < LEVELS.length; index++) {
    if (!order.includes(index)) order.push(index);
  }
  for (const index of order) {
    const tries = index === primary ? 50 : 15;
    for (let attempt = 0; attempt < tries; attempt++) {
      const sample = tryLevel(rng, LEVELS[index]);
      if (sample && !usedIds.has(sample.item.id)) return sample;
    }
  }
  throw new Error(`Unable to generate a unique matrices item near b=${targetB}`);
}

export const matricesGenerator: ItemGenerator = {
  domain: 'matrices',
  generate(rng, targetB, usedIds) {
    return generateMatrices(rng, targetB, usedIds).item;
  },
  practice() {
    const rng = createRng(0x51c0ffee);
    for (let attempt = 0; attempt < 40; attempt++) {
      const sample = tryLevel(rng, LEVELS[0]);
      if (sample) return { ...sample.item, b: -2.5 };
    }
    throw new Error('Unable to build the matrices practice item');
  },
};
