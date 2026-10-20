import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { ChoiceItem, Item, Visual } from '../core/types';
import { spatialGenerator } from './spatial';

/**
 * Independent geometry. These helpers are checked against hand-worked shapes
 * below, then used to grade generated items from their SVG — not from the generator's model.
 */

interface Cell {
  x: number;
  y: number;
}

function cellSignature(cells: Cell[]): string {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells
    .map((c) => ({ x: c.x - minX, y: c.y - minY }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((c) => `${c.x},${c.y}`)
    .join('_');
}

function rotate90(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ x: c.y, y: -c.x }));
}

function rotationCanonical(cells: Cell[]): string {
  let best = cellSignature(cells);
  let current = cells;
  for (let turn = 0; turn < 3; turn++) {
    current = rotate90(current);
    const signature = cellSignature(current);
    if (signature < best) best = signature;
  }
  return best;
}

function mirrorCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ x: -c.x, y: c.y }));
}

function isChiral(cells: Cell[]): boolean {
  return rotationCanonical(cells) !== rotationCanonical(mirrorCells(cells));
}

function hasHalfTurn(cells: Cell[]): boolean {
  return cellSignature(cells) === cellSignature(rotate90(rotate90(cells)));
}

function parsePolyomino(markup: string): { cells: Cell[]; angle: number } {
  const angleMatch = /rotate\(([-\d.]+)\)/.exec(markup);
  if (!angleMatch) throw new Error('missing rotation');
  const cells: Cell[] = [];
  const rects = /<rect x="(-?\d+)" y="(-?\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = rects.exec(markup))) {
    cells.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  if (cells.length < 4) throw new Error('polyomino rects');
  return { cells, angle: Number(angleMatch[1]) };
}

function polyominoSignature(markup: string): string {
  const { cells, angle } = parsePolyomino(markup);
  return `${cellSignature(cells)}@${angle}`;
}

type Op = 'rot90cw' | 'rot90ccw' | 'rot180' | 'flipLR' | 'flipTB';

function destination(n: number, row: number, col: number, op: Op): [number, number] {
  switch (op) {
    case 'rot90cw':
      return [col, n - 1 - row];
    case 'rot90ccw':
      return [n - 1 - col, row];
    case 'rot180':
      return [n - 1 - row, n - 1 - col];
    case 'flipLR':
      return [row, n - 1 - col];
    case 'flipTB':
      return [n - 1 - row, col];
  }
}

function applyOp(grid: string[][], op: Op): string[][] {
  const n = grid.length;
  const next = Array.from({ length: n }, () => Array<string>(n).fill('.'));
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const [nr, nc] = destination(n, row, col, op);
      next[nr][nc] = grid[row][col];
    }
  }
  return next;
}

function applyOps(grid: string[][], ops: Op[]): string[][] {
  return ops.reduce((current, op) => applyOp(current, op), grid);
}

function gridSignature(grid: string[][]): string {
  return grid.map((row) => row.join('')).join('/');
}

function dihedralSignatures(grid: string[][]): Set<string> {
  const signatures = new Set<string>();
  let current = grid;
  for (let turn = 0; turn < 4; turn++) {
    signatures.add(gridSignature(current));
    signatures.add(gridSignature(applyOp(current, 'flipLR')));
    current = applyOp(current, 'rot90cw');
  }
  return signatures;
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]) > 0.2) out.push(value);
  }
  return out;
}

function parseGrid(markup: string): string[][] {
  const xs: number[] = [];
  const ys: number[] = [];
  const lines = /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(markup))) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    if (Math.abs(x1 - x2) < 0.05) xs.push((x1 + x2) / 2);
    else if (Math.abs(y1 - y2) < 0.05) ys.push((y1 + y2) / 2);
  }
  const vertical = uniqueSorted(xs);
  const horizontal = uniqueSorted(ys);
  const n = vertical.length - 1;
  if (n < 2 || horizontal.length - 1 !== n) throw new Error('grid lines');
  const x0 = vertical[0];
  const y0 = horizontal[0];
  const cell = (vertical[n] - x0) / n;
  const grid = Array.from({ length: n }, () => Array<string>(n).fill('.'));
  const rects = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"[^>]*fill="#6b7280"/g;
  while ((match = rects.exec(markup))) {
    const cx = Number(match[1]) + Number(match[3]) / 2;
    const cy = Number(match[2]) + Number(match[4]) / 2;
    const col = Math.round((cx - x0) / cell - 0.5);
    const row = Math.round((cy - y0) / cell - 0.5);
    grid[row][col] = '#';
  }
  const circles = [...markup.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g)];
  if (circles.length !== 1) throw new Error('marker');
  const col = Math.round((Number(circles[0][1]) - x0) / cell - 0.5);
  const row = Math.round((Number(circles[0][2]) - y0) / cell - 0.5);
  if (grid[row][col] === '#') throw new Error('marker on a shaded cell');
  grid[row][col] = 'o';
  return grid;
}

function parseOps(prompt: string): Op[] {
  const head = prompt.split('. Which option shows the result?')[0];
  if (!head || head === prompt) throw new Error('transform prompt');
  return head.split(', then ').map((clause) => {
    const text = clause.trim().toLowerCase();
    if (text.includes('counterclockwise')) return 'rot90ccw';
    if (text.includes('clockwise')) return 'rot90cw';
    if (text.includes('180')) return 'rot180';
    if (text.includes('left-to-right')) return 'flipLR';
    if (text.includes('top-to-bottom')) return 'flipTB';
    throw new Error(`unknown operation ${clause}`);
  });
}

interface Pt {
  x: number;
  y: number;
}

type Line =
  | { axis: 'v'; x: number }
  | { axis: 'h'; y: number }
  | { axis: 'd'; b: number }
  | { axis: 'a'; s: number };

function reflect(point: Pt, line: Line): Pt {
  if (line.axis === 'v') return { x: 2 * line.x - point.x, y: point.y };
  if (line.axis === 'h') return { x: point.x, y: 2 * line.y - point.y };
  if (line.axis === 'd') return { x: point.y - line.b, y: point.x + line.b };
  return { x: line.s - point.y, y: line.s - point.x };
}

function quantize(point: Pt): string {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
}

/** Punch reflections in reverse fold order: each fold doubles the holes. */
function unfold(punch: Pt, lines: Line[]): Pt[] {
  let points = [punch];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    points = points.flatMap((point) => [point, reflect(point, line)]);
  }
  return points;
}

function samePoints(a: Pt[], b: Pt[]): boolean {
  const left = new Set(a.map(quantize));
  const right = new Set(b.map(quantize));
  if (left.size !== right.size || left.size !== a.length) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toUnit(px: number, py: number, frame: Frame): Pt {
  return { x: (px - frame.x) / frame.w, y: (py - frame.y) / frame.h };
}

function parseFrame(panel: string): Frame {
  const match = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="none" stroke="#e5e7eb"/.exec(panel);
  if (!match) throw new Error('paper frame');
  return { x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) };
}

function parseFoldLine(panel: string, frame: Frame): Line {
  const match = /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-dasharray/.exec(panel);
  if (!match) throw new Error('fold line');
  const p1 = toUnit(Number(match[1]), Number(match[2]), frame);
  const p2 = toUnit(Number(match[3]), Number(match[4]), frame);
  if (Math.abs(p1.x - p2.x) < 1e-3) return { axis: 'v', x: (p1.x + p2.x) / 2 };
  if (Math.abs(p1.y - p2.y) < 1e-3) return { axis: 'h', y: (p1.y + p2.y) / 2 };
  const b1 = p1.y - p1.x;
  const b2 = p2.y - p2.x;
  if (Math.abs(b1 - b2) < 1e-3) return { axis: 'd', b: (b1 + b2) / 2 };
  const s1 = p1.x + p1.y;
  const s2 = p2.x + p2.y;
  if (Math.abs(s1 - s2) < 1e-3) return { axis: 'a', s: (s1 + s2) / 2 };
  throw new Error('unrecognized fold line');
}

function splitPanels(markup: string): string[] {
  const panels: string[] = [];
  const groups = /<g transform="translate\(([\d.]+) 0\)">([\s\S]*?)<\/g>/g;
  let match: RegExpExecArray | null;
  while ((match = groups.exec(markup))) panels.push(match[2]);
  if (panels.length < 2) throw new Error('fold panels');
  return panels;
}

function parseHoles(markup: string): Pt[] {
  const frameMatch = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(markup);
  if (!frameMatch) throw new Error('sheet');
  const frame: Frame = {
    x: Number(frameMatch[1]),
    y: Number(frameMatch[2]),
    w: Number(frameMatch[3]),
    h: Number(frameMatch[4]),
  };
  return [...markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map((circle) =>
    toUnit(Number(circle[1]), Number(circle[2]), frame),
  );
}

function holeSignature(markup: string): string {
  return parseHoles(markup)
    .map(quantize)
    .sort()
    .join('|');
}

function foldSolution(markup: string): { lines: Line[]; holes: Pt[] } {
  const panels = splitPanels(markup);
  const punchPanel = panels[panels.length - 1];
  const frame = parseFrame(punchPanel);
  const circles = [...punchPanel.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)];
  if (circles.length !== 1) throw new Error('punch');
  const punch = toUnit(Number(circles[0][1]), Number(circles[0][2]), frame);
  const lines = panels.slice(0, -1).map((panel) => parseFoldLine(panel, parseFrame(panel)));
  return { lines, holes: unfold(punch, lines) };
}

function assertSvg(markup: string): void {
  expect(markup.startsWith('<svg')).toBe(true);
  expect(markup).toContain('viewBox=');
  const tag = markup.slice(0, markup.indexOf('>') + 1);
  expect(tag).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(tag).not.toMatch(/\swidth=/);
  expect(tag).not.toMatch(/\sheight=/);
  expect(markup).not.toContain('<text');
}

function svgOf(visual: Visual): string {
  if (visual.type !== 'svg') throw new Error('expected svg');
  return visual.svg;
}

function asChoice(item: Item): ChoiceItem {
  expect(item.kind).toBe('choice');
  if (item.kind !== 'choice') throw new Error('expected a choice item');
  return item;
}

function sentenceCount(text: string): number {
  return text.split(/[.!?]/).filter((part) => part.trim()).length;
}

function sheetHoles(markup: string): { points: Pt[]; size: number } {
  const frameMatch = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(markup);
  if (!frameMatch) throw new Error('sheet');
  const originX = Number(frameMatch[1]);
  const originY = Number(frameMatch[2]);
  const size = Number(frameMatch[3]);
  const points = [...markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="([^"]+)"/g)].map((circle) => {
    if (circle[4] !== '#ffffff') throw new Error('hole fill');
    const radius = Number(circle[3]);
    if (radius < 4.5 || radius > 5.5) throw new Error(`hole radius ${radius}`);
    return { x: Number(circle[1]) - originX, y: Number(circle[2]) - originY };
  });
  return { points, size };
}

function onSixBySixLattice(value: number, size: number): boolean {
  const twelfths = (value / size) * 12;
  const n = Math.round(twelfths);
  return Math.abs(twelfths - n) < 0.05 && n % 2 === 1 && n >= 1 && n <= 11;
}

function lineDistance(point: Pt, line: Line): number {
  if (line.axis === 'v') return Math.abs(point.x - line.x);
  if (line.axis === 'h') return Math.abs(point.y - line.y);
  if (line.axis === 'd') return Math.abs(point.y - point.x - line.b) / Math.SQRT2;
  return Math.abs(point.x + point.y - line.s) / Math.SQRT2;
}

function assertFoldLayout(item: ChoiceItem): void {
  const stimulus = svgOf(item.stimulus);
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(stimulus);
  if (!viewBox) throw new Error(`${item.id} viewBox`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  expect(height, item.id).toBe(112);
  expect(width / height, item.id).toBeLessThanOrEqual(4);
  expect(width / 112, item.id).toBeLessThanOrEqual(4);
  const solved = foldSolution(stimulus);
  expect(solved.lines.length, item.id).toBeLessThanOrEqual(3);
  const correct = sheetHoles(svgOf(item.options[item.answer]));
  expect(correct.size, item.id).toBe(100);
  const patterns = item.options.map((option) => sheetHoles(svgOf(option)));
  for (const pattern of patterns) {
    expect(pattern.points.length, item.id).toBeGreaterThan(0);
    for (const point of pattern.points) {
      expect(Math.min(point.x, point.y, pattern.size - point.x, pattern.size - point.y), item.id).toBeGreaterThanOrEqual(12 - 0.5);
      expect(onSixBySixLattice(point.x, pattern.size), item.id).toBe(true);
      expect(onSixBySixLattice(point.y, pattern.size), item.id).toBe(true);
    }
    for (let i = 0; i < pattern.points.length; i++) {
      for (let j = i + 1; j < pattern.points.length; j++) {
        const dx = pattern.points[i].x - pattern.points[j].x;
        const dy = pattern.points[i].y - pattern.points[j].y;
        expect(Math.hypot(dx, dy), item.id).toBeGreaterThanOrEqual(12 - 0.5);
      }
    }
  }
  for (const point of correct.points) {
    const unit = { x: point.x / correct.size, y: point.y / correct.size };
    for (const line of solved.lines) {
      expect(lineDistance(unit, line) * correct.size, item.id).toBeGreaterThanOrEqual(8 - 0.6);
    }
  }
}

describe('spatial geometry checks', () => {
  it('knows which polyominoes are chiral', () => {
    const elbow = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 1, y: 3 },
    ];
    const tee = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
    ];
    const zee = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    expect(isChiral(elbow)).toBe(true);
    expect(hasHalfTurn(elbow)).toBe(false);
    expect(isChiral(tee)).toBe(false);
    expect(isChiral(zee)).toBe(true);
    expect(hasHalfTurn(zee)).toBe(true);
  });

  it('rotates and flips a figure clockwise on the screen', () => {
    const grid = [
      ['o', '.', '.'],
      ['#', '.', '.'],
      ['.', '.', '.'],
    ];
    expect(applyOp(grid, 'rot90cw')).toEqual([
      ['.', '#', 'o'],
      ['.', '.', '.'],
      ['.', '.', '.'],
    ]);
    expect(applyOp(grid, 'flipLR')).toEqual([
      ['.', '.', 'o'],
      ['.', '.', '#'],
      ['.', '.', '.'],
    ]);
    expect(applyOp(grid, 'flipTB')).toEqual([
      ['.', '.', '.'],
      ['#', '.', '.'],
      ['o', '.', '.'],
    ]);
    expect(applyOps(grid, ['rot90cw', 'flipLR'])).toEqual(applyOp(applyOp(grid, 'rot90cw'), 'flipLR'));
  });

  it('reflects a punch back through fold lines', () => {
    expect(reflect({ x: 0.75, y: 0.25 }, { axis: 'v', x: 0.5 })).toEqual({ x: 0.25, y: 0.25 });
    expect(reflect({ x: 0.75, y: 0.25 }, { axis: 'h', y: 0.5 })).toEqual({ x: 0.75, y: 0.75 });
    expect(reflect({ x: 0.75, y: 0.125 }, { axis: 'd', b: 0 })).toEqual({ x: 0.125, y: 0.75 });
    expect(reflect({ x: 0.75, y: 0.125 }, { axis: 'a', s: 1 })).toEqual({ x: 0.875, y: 0.25 });
    const holes = unfold({ x: 0.75, y: 0.625 }, [
      { axis: 'v', x: 0.5 },
      { axis: 'h', y: 0.5 },
    ]);
    expect(new Set(holes.map(quantize))).toEqual(
      new Set(['0.7500,0.6250', '0.7500,0.3750', '0.2500,0.6250', '0.2500,0.3750']),
    );
  });
});

describe('spatialGenerator', () => {
  it('is deterministic for the same seed, target, and used ids', () => {
    for (const target of [-2.5, -2.1, -1, 0, 0.3, 1.5, 2.5]) {
      const used = new Set<string>(['sp-held']);
      const a = spatialGenerator.generate(createRng(11), target, used);
      const b = spatialGenerator.generate(createRng(11), target, used);
      expect(a).toEqual(b);
    }
  });

  it('returns a difficulty within 0.6 of targets from -2.5 to 2.5', () => {
    for (let target = -2.5; target <= 2.5 + 1e-9; target += 0.5) {
      for (let seed = 1; seed <= 8; seed++) {
        const item = spatialGenerator.generate(createRng(seed + Math.round(target * 20)), target, new Set());
        expect(Math.abs(item.b - target)).toBeLessThanOrEqual(0.6);
        expect(item.a).toBeGreaterThanOrEqual(1.1);
        expect(item.a).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('repeats one fixed easy practice item', () => {
    const first = asChoice(spatialGenerator.practice());
    const second = asChoice(spatialGenerator.practice());
    expect(second).toEqual(first);
    expect(first.b).toBe(-2.5);
    expect(first.domain).toBe('spatial');
    expect(first.prompt).toBe('Which option is the same shape as the one on the left, only rotated?');
    expect(first.id.startsWith('sp-rot-practice-')).toBe(true);
    expect(first.family).toBe('sp-rotation');
    const stimulus = parsePolyomino(svgOf(first.stimulus));
    expect(stimulus.angle).toBe(0);
    expect(stimulus.cells).toHaveLength(5);
    expect(isChiral(stimulus.cells)).toBe(true);
    const canon = rotationCanonical(stimulus.cells);
    const matches = first.options.map((option) => rotationCanonical(parsePolyomino(svgOf(option)).cells) === canon);
    expect(matches.filter(Boolean)).toHaveLength(1);
    expect(matches[first.answer]).toBe(true);
    expect(parsePolyomino(svgOf(first.options[first.answer])).angle).toBe(90);
  });

  it('skips used ids until it has 40 distinct items', () => {
    const used = new Set<string>();
    const rng = createRng(99);
    for (let i = 0; i < 40; i++) {
      const item = spatialGenerator.generate(rng, 0.2, used);
      expect(used.has(item.id)).toBe(false);
      used.add(item.id);
    }
    expect(used.size).toBe(40);
  });

  it('mixes families at low, average, and high targets', () => {
    for (const target of [-2, 0, 2]) {
      const rng = createRng(70 + target);
      const counts = { 'sp-rotation': 0, 'sp-transform': 0, 'sp-folding': 0 };
      for (let draw = 0; draw < 300; draw++) {
        const item = asChoice(spatialGenerator.generate(rng, target, new Set()));
        expect(item.family).toBeDefined();
        counts[item.family as keyof typeof counts]++;
      }
      for (const count of Object.values(counts)) expect(count / 300).toBeGreaterThanOrEqual(0.15);
    }
  });

  it('keeps punched holes on an interior lattice across 500 folding items', () => {
    const rng = createRng(4242);
    let checked = 0;
    let guard = 0;
    while (checked < 500) {
      const target = -2.4 + (guard % 49) * 0.1;
      const item = asChoice(spatialGenerator.generate(rng, target, new Set()));
      guard++;
      if (guard > 8000) throw new Error('not enough folding items');
      if (item.family !== 'sp-folding') continue;
      checked++;
      assertFoldLayout(item);
    }
  });

  it('verifies exactly one answer for 500 items across every family', () => {
    const rng = createRng(20261020);
    const counts = { rot: 0, xform: 0, fold: 0, hardRot: 0, hardFold: 0, hardXform: 0 };
    for (let i = 0; i < 500; i++) {
      const target = -2.5 + (i % 51) * 0.1;
      const item = asChoice(spatialGenerator.generate(rng, target, new Set()));
      expect(item.domain, item.id).toBe('spatial');
      expect(['sp-rotation', 'sp-transform', 'sp-folding'], item.id).toContain(item.family);
      if (item.id.startsWith('sp-rot-')) expect(item.family, item.id).toBe('sp-rotation');
      if (item.id.startsWith('sp-xform-')) expect(item.family, item.id).toBe('sp-transform');
      if (item.id.startsWith('sp-fold-')) expect(item.family, item.id).toBe('sp-folding');
      expect(item.options.length, item.id).toBeGreaterThanOrEqual(4);
      expect(item.options.length, item.id).toBeLessThanOrEqual(5);
      expect(item.answer, item.id).toBeGreaterThanOrEqual(0);
      expect(item.answer, item.id).toBeLessThan(item.options.length);
      expect(item.a, item.id).toBeGreaterThanOrEqual(1.1);
      expect(item.a, item.id).toBeLessThanOrEqual(1.5);
      expect(sentenceCount(item.explanation), item.id).toBeGreaterThanOrEqual(1);
      expect(sentenceCount(item.explanation), item.id).toBeLessThanOrEqual(3);
      expect(item.explanation, item.id).toContain(`Option ${'ABCDE'[item.answer]}`);
      assertSvg(svgOf(item.stimulus));
      for (const option of item.options) {
        expect(option.type).toBe('svg');
        assertSvg(svgOf(option));
      }

      if (item.id.startsWith('sp-rot-')) {
        counts.rot++;
        expect(item.prompt).toBe('Which option is the same shape as the one on the left, only rotated?');
        const stimulus = parsePolyomino(svgOf(item.stimulus));
        expect(stimulus.angle, item.id).toBe(0);
        expect(isChiral(stimulus.cells), item.id).toBe(true);
        expect(hasHalfTurn(stimulus.cells), item.id).toBe(false);
        const canon = rotationCanonical(stimulus.cells);
        const mirrorCanon = rotationCanonical(mirrorCells(stimulus.cells));
        const parsed = item.options.map((option) => parsePolyomino(svgOf(option)));
        const signatures = item.options.map((option) => polyominoSignature(svgOf(option)));
        expect(new Set(signatures).size, item.id).toBe(parsed.length);
        const matches = parsed.map((option) => rotationCanonical(option.cells) === canon);
        expect(matches.filter(Boolean), item.id).toHaveLength(1);
        expect(matches[item.answer], item.id).toBe(true);
        expect(parsed[item.answer].angle % 360, item.id).not.toBe(0);
        for (const option of parsed) {
          expect(isChiral(option.cells), item.id).toBe(true);
          expect(hasHalfTurn(option.cells), item.id).toBe(false);
        }
        if (item.b < -2) {
          expect(stimulus.cells, item.id).toHaveLength(5);
          expect([90, 180, 270], item.id).toContain(parsed[item.answer].angle);
          expect(parsed.every((option) => rotationCanonical(option.cells) === canon || rotationCanonical(option.cells) === mirrorCanon)).toBe(true);
        }
        if (item.b > 2) {
          counts.hardRot++;
          expect(stimulus.cells.length, item.id).toBeGreaterThanOrEqual(9);
          expect(parsed[item.answer].angle % 90, item.id).not.toBe(0);
          expect(parsed.some((option) => {
            const shape = rotationCanonical(option.cells);
            return shape !== canon && shape !== mirrorCanon;
          }), item.id).toBe(true);
        }
      } else if (item.id.startsWith('sp-xform-')) {
        counts.xform++;
        const stimulus = parseGrid(svgOf(item.stimulus));
        expect(dihedralSignatures(stimulus).size, item.id).toBe(8);
        const ops = parseOps(item.prompt);
        expect(ops.length, item.id).toBeGreaterThanOrEqual(1);
        expect(ops.length, item.id).toBeLessThanOrEqual(3);
        const expected = gridSignature(applyOps(stimulus, ops));
        const options = item.options.map((option) => gridSignature(parseGrid(svgOf(option))));
        expect(new Set(options).size, item.id).toBe(options.length);
        const matches = options.map((signature) => signature === expected);
        expect(matches.filter(Boolean), item.id).toHaveLength(1);
        expect(matches[item.answer], item.id).toBe(true);
        if (item.b < -1.5) {
          expect(stimulus, item.id).toHaveLength(3);
          expect(ops, item.id).toHaveLength(1);
        }
        if (item.b > 1.5) {
          counts.hardXform++;
          expect(stimulus, item.id).toHaveLength(5);
          expect(ops, item.id).toHaveLength(3);
        }
      } else if (item.id.startsWith('sp-fold-')) {
        counts.fold++;
        expect(item.prompt).toBe('The paper is folded as shown and a hole is punched. Which option shows it unfolded?');
        const solved = foldSolution(svgOf(item.stimulus));
        expect(solved.lines.length, item.id).toBeGreaterThanOrEqual(1);
        expect(solved.lines.length, item.id).toBeLessThanOrEqual(3);
        expect(new Set(solved.holes.map(quantize)).size, item.id).toBe(2 ** solved.lines.length);
        const options = item.options.map((option) => parseHoles(svgOf(option)));
        const signatures = item.options.map((option) => holeSignature(svgOf(option)));
        expect(new Set(signatures).size, item.id).toBe(options.length);
        const matches = options.map((holes) => samePoints(holes, solved.holes));
        expect(matches.filter(Boolean), item.id).toHaveLength(1);
        expect(matches[item.answer], item.id).toBe(true);
        if (item.b > 2) {
          counts.hardFold++;
          expect(solved.lines.length, item.id).toBe(3);
        }
      } else {
        throw new Error(`unexpected id ${item.id}`);
      }
    }
    expect(counts.rot).toBeGreaterThan(100);
    expect(counts.xform).toBeGreaterThan(100);
    expect(counts.fold).toBeGreaterThan(100);
    expect(counts.hardRot).toBeGreaterThan(0);
    expect(counts.hardXform).toBeGreaterThan(0);
    expect(counts.hardFold).toBeGreaterThan(0);
  });
});
