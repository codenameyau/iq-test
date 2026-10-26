import type { Rng } from '../core/rng';
import type { ChoiceItem, ItemGenerator } from '../core/types';

/**
 * Visual-spatial items: mental rotation, dihedral transformation sequences, and paper folding.
 * Difficulty `b` is the level value on the adult theta scale. Option order comes from `rng`.
 */

interface RotLevel {
  family: 'rot';
  id: number;
  b: number;
  a: number;
  nMin: number;
  nMax: number;
  angles: 'quarter' | 'odd';
  options: number;
  near: number;
}

interface XformLevel {
  family: 'xform';
  id: number;
  b: number;
  a: number;
  n: number;
  steps: number;
  options: number;
}

interface FoldLevel {
  family: 'fold';
  id: number;
  b: number;
  a: number;
  steps: number;
  diagonal: boolean;
  options: number;
}

type Level = RotLevel | XformLevel | FoldLevel;

const QUARTER_TURNS = [90, 180, 270];
const ODD_TURNS = [35, 50, 70, 110, 125, 145, 160, 200, 215, 235, 250, 290, 305, 325, 340];

const LEVELS: Level[] = [
  { family: 'rot', id: 0, b: -2.4, a: 1.15, nMin: 5, nMax: 5, angles: 'quarter', options: 4, near: 0 },
  { family: 'rot', id: 1, b: -0.3, a: 1.25, nMin: 6, nMax: 6, angles: 'odd', options: 4, near: 0 },
  { family: 'rot', id: 2, b: 1.1, a: 1.35, nMin: 7, nMax: 8, angles: 'odd', options: 5, near: 0 },
  { family: 'rot', id: 3, b: 2.4, a: 1.5, nMin: 9, nMax: 10, angles: 'odd', options: 5, near: 2 },
  { family: 'xform', id: 0, b: -2.2, a: 1.2, n: 3, steps: 1, options: 4 },
  { family: 'xform', id: 1, b: 0, a: 1.3, n: 4, steps: 2, options: 4 },
  { family: 'xform', id: 2, b: 1.2, a: 1.4, n: 5, steps: 2, options: 5 },
  { family: 'xform', id: 3, b: 2.4, a: 1.45, n: 5, steps: 3, options: 5 },
  { family: 'fold', id: 0, b: -2.4, a: 1.15, steps: 1, diagonal: false, options: 4 },
  { family: 'fold', id: 1, b: -1.2, a: 1.25, steps: 2, diagonal: false, options: 4 },
  { family: 'fold', id: 2, b: 0.3, a: 1.3, steps: 2, diagonal: false, options: 5 },
  { family: 'fold', id: 3, b: 1.4, a: 1.4, steps: 3, diagonal: true, options: 4 },
  { family: 'fold', id: 4, b: 1.8, a: 1.5, steps: 3, diagonal: true, options: 5 },
];

const QUESTION_FAMILY = {
  rot: 'sp-rotation',
  xform: 'sp-transform',
  fold: 'sp-folding',
} as const;

const LETTERS = 'ABCDE';
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface Cell {
  x: number;
  y: number;
}

interface RotOption {
  cells: Cell[];
  angle: number;
}

type CellState = '.' | '#' | 'o';
type Op = 'rot90cw' | 'rot90ccw' | 'rot180' | 'flipLR' | 'flipTB';
type Half = 'LR' | 'RL' | 'TB' | 'BT';

interface Pt {
  x: number;
  y: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Line =
  | { axis: 'v'; x: number }
  | { axis: 'h'; y: number }
  | { axis: 'd'; b: number }
  | { axis: 'a'; s: number };

interface DrawnFold {
  packet: Pt[];
  shade: Pt[];
  kept: Pt[];
  segment: [Pt, Pt];
}

interface FoldPlan {
  lines: Line[];
  steps: DrawnFold[];
  finalPacket: Pt[];
  punches: Pt[];
}

function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return String(rounded);
}

function svg(viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
}

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function normalizeCells(cells: Cell[]): Cell[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells
    .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

function cellSignature(cells: Cell[]): string {
  return normalizeCells(cells)
    .map((cell) => `${cell.x},${cell.y}`)
    .join('_');
}

function rotate90(cells: Cell[]): Cell[] {
  return cells.map((cell) => ({ x: cell.y, y: -cell.x }));
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
  return cells.map((cell) => ({ x: -cell.x, y: cell.y }));
}

function isChiral(cells: Cell[]): boolean {
  return rotationCanonical(cells) !== rotationCanonical(mirrorCells(cells));
}

function hasHalfTurn(cells: Cell[]): boolean {
  return cellSignature(cells) === cellSignature(rotate90(rotate90(cells)));
}

function isConnected(cells: Cell[]): boolean {
  if (cells.length === 0) return false;
  const occupied = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const stack = [cells[0]];
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) break;
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [dx, dy] of DIRS) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (occupied.has(cellKey(next))) stack.push(next);
    }
  }
  return seen.size === cells.length;
}

function hasHole(cells: Cell[]): boolean {
  const occupied = new Set(cells.map(cellKey));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }
  const x0 = minX - 1;
  const y0 = minY - 1;
  const x1 = maxX + 1;
  const y1 = maxY + 1;
  const outside = new Set<string>();
  const stack: Cell[] = [{ x: x0, y: y0 }];
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell || cell.x < x0 || cell.x > x1 || cell.y < y0 || cell.y > y1) continue;
    const key = cellKey(cell);
    if (outside.has(key) || occupied.has(key)) continue;
    outside.add(key);
    stack.push(
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 },
    );
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`;
      if (!occupied.has(key) && !outside.has(key)) return true;
    }
  }
  return false;
}

function emptyNeighbors(cells: Cell[]): Cell[] {
  const occupied = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const neighbors: Cell[] = [];
  for (const cell of cells) {
    for (const [dx, dy] of DIRS) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      const key = cellKey(next);
      if (!occupied.has(key) && !seen.has(key)) {
        seen.add(key);
        neighbors.push(next);
      }
    }
  }
  return neighbors;
}

function growPolyomino(rng: Rng, n: number): Cell[] {
  const cells: Cell[] = [{ x: 0, y: 0 }];
  while (cells.length < n) cells.push(rng.pick(emptyNeighbors(cells)));
  return cells;
}

/** Long arm plus one cell beside the bottom end. Chiral, simply connected, no half-turn. */
function elbow(n: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < n - 1; y++) cells.push({ x: 0, y });
  cells.push({ x: 1, y: n - 2 });
  return cells;
}

function randomChiral(rng: Rng, nMin: number, nMax: number): Cell[] {
  const n = rng.int(nMin, nMax);
  for (let attempt = 0; attempt < 80; attempt++) {
    const cells = growPolyomino(rng, n);
    if (isChiral(cells) && !hasHalfTurn(cells) && !hasHole(cells)) return normalizeCells(cells);
  }
  const fallback = normalizeCells(elbow(n));
  if (!isChiral(fallback) || hasHalfTurn(fallback) || hasHole(fallback)) {
    throw new Error(`spatial: no chiral polyomino of size ${n}`);
  }
  return fallback;
}

function makeNear(rng: Rng, target: Cell[], count: number): Cell[][] | null {
  const banned = new Set<string>([rotationCanonical(target), rotationCanonical(mirrorCells(target))]);
  const found: Cell[][] = [];
  for (let attempt = 0; attempt < 300 && found.length < count; attempt++) {
    const removeAt = rng.int(0, target.length - 1);
    const remaining = target.filter((_, index) => index !== removeAt);
    if (!isConnected(remaining)) continue;
    const places = emptyNeighbors(remaining);
    if (places.length === 0) continue;
    const next = remaining.concat(rng.pick(places));
    if (hasHole(next) || !isChiral(next) || hasHalfTurn(next)) continue;
    const canon = rotationCanonical(next);
    if (banned.has(canon)) continue;
    banned.add(canon);
    banned.add(rotationCanonical(mirrorCells(next)));
    found.push(normalizeCells(next));
  }
  return found.length === count ? found : null;
}

function renderPolyomino(cells: Cell[], angle: number): string {
  const norm = normalizeCells(cells);
  const width = Math.max(...norm.map((cell) => cell.x)) + 1;
  const height = Math.max(...norm.map((cell) => cell.y)) + 1;
  const cx = width / 2;
  const cy = height / 2;
  // Rotate about the bounding-box center, then scale so the bounding circle stays inside the viewBox.
  const scale = Math.floor((42 / (Math.hypot(width, height) / 2)) * 1000) / 1000;
  const rects = norm
    .map(
      (cell) =>
        `<rect x="${cell.x}" y="${cell.y}" width="0.88" height="0.88" fill="#1f2937" stroke="#1f2937" stroke-width="2" vector-effect="non-scaling-stroke"/>`,
    )
    .join('');
  // SVG applies the list right to left: center the cells, scale, rotate, then move to the viewBox center.
  const transform = `translate(50 50) rotate(${fmt(angle)}) scale(${fmt(scale)}) translate(${fmt(-cx)} ${fmt(-cy)})`;
  return svg('0 0 100 100', `<g transform="${transform}">${rects}</g>`);
}

function letterList(indexes: number[]): string {
  const letters = [...indexes].sort((a, b) => a - b).map((index) => LETTERS[index]);
  if (letters.length <= 1) return letters[0] ?? '';
  if (letters.length === 2) return `${letters[0]} and ${letters[1]}`;
  return `${letters.slice(0, -1).join(', ')} and ${letters[letters.length - 1]}`;
}

function optionClause(indexes: number[], singular: string, plural: string): string {
  return indexes.length === 1
    ? `Option ${letterList(indexes)} ${singular}`
    : `Options ${letterList(indexes)} ${plural}`;
}

function assertRotation(target: Cell[], options: RotOption[], answer: number): void {
  if (!isChiral(target) || hasHalfTurn(target)) throw new Error('spatial: chiral target required');
  const canon = rotationCanonical(target);
  const seen = new Set<string>();
  let matches = 0;
  options.forEach((option, index) => {
    const key = `${cellSignature(option.cells)}@${option.angle}`;
    if (seen.has(key)) throw new Error('spatial: duplicate rotation option');
    seen.add(key);
    if (rotationCanonical(option.cells) === canon) {
      matches += 1;
      if (index !== answer || option.angle % 360 === 0) throw new Error('spatial: bad rotation answer');
    }
  });
  if (matches !== 1) throw new Error('spatial: expected one pure rotation');
}

function rotationItem(
  level: number | 'practice',
  b: number,
  a: number,
  target: Cell[],
  options: RotOption[],
  answer: number,
): ChoiceItem {
  assertRotation(target, options, answer);
  const canon = rotationCanonical(target);
  const mirrorCanon = rotationCanonical(mirrorCells(target));
  const mirrors: number[] = [];
  const nears: number[] = [];
  options.forEach((option, index) => {
    if (index === answer) return;
    const shape = rotationCanonical(option.cells);
    if (shape === mirrorCanon) mirrors.push(index);
    else if (shape !== canon) nears.push(index);
  });
  const sentences = [`Option ${LETTERS[answer]} is the shape rotated ${options[answer].angle}°.`];
  if (mirrors.length > 0) {
    sentences.push(`${optionClause(mirrors, 'is a mirror image', 'are mirror images')}, which no rotation can produce.`);
  }
  if (nears.length > 0) sentences.push(`${optionClause(nears, 'is a different shape', 'are different shapes')}.`);
  const signature = options.map((option) => `${cellSignature(option.cells)}@${option.angle}`).join('~');
  return {
    kind: 'choice',
    id: `sp-rot-${level}-${cellSignature(target)}-${signature}`,
    domain: 'spatial',
    family: QUESTION_FAMILY.rot,
    b,
    a,
    prompt: 'Which option is the same shape as the one on the left, only rotated?',
    explanation: sentences.join(' '),
    stimulus: { type: 'svg', svg: renderPolyomino(target, 0) },
    options: options.map((option) => ({ type: 'svg', svg: renderPolyomino(option.cells, option.angle) })),
    answer,
  };
}

function buildRotation(rng: Rng, level: RotLevel): ChoiceItem | null {
  const target = randomChiral(rng, level.nMin, level.nMax);
  const pool = level.angles === 'quarter' ? QUARTER_TURNS : ODD_TURNS;
  const mirrorCount = level.options - 1 - level.near;
  const mirrorAngles = rng.shuffle(pool).slice(0, mirrorCount);
  if (mirrorAngles.length < mirrorCount) return null;
  const nears = level.near > 0 ? makeNear(rng, target, level.near) : [];
  if (!nears) return null;
  const mirror = normalizeCells(mirrorCells(target));
  const distractors: RotOption[] = [
    ...mirrorAngles.map((angle) => ({ cells: mirror, angle })),
    ...nears.map((cells) => ({ cells, angle: rng.pick(pool) })),
  ];
  const answer = rng.int(0, distractors.length);
  const options = distractors.slice();
  options.splice(answer, 0, { cells: target, angle: rng.pick(pool) });
  return rotationItem(level.id, level.b, level.a, target, options, answer);
}

function buildPractice(): ChoiceItem {
  const target = normalizeCells([
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 },
    { x: 0, y: 3 },
    { x: 1, y: 3 },
  ]);
  const mirror = normalizeCells(mirrorCells(target));
  return rotationItem('practice', -2.5, 1.1, target, [
    { cells: mirror, angle: 180 },
    { cells: target, angle: 90 },
    { cells: mirror, angle: 270 },
    { cells: mirror, angle: 90 },
  ], 1);
}

const practiceItem = buildPractice();

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

function applyOp(grid: CellState[][], op: Op): CellState[][] {
  const n = grid.length;
  const next = Array.from({ length: n }, () => Array<CellState>(n).fill('.'));
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const [nr, nc] = destination(n, row, col, op);
      next[nr][nc] = grid[row][col];
    }
  }
  return next;
}

function applyOps(grid: CellState[][], ops: Op[]): CellState[][] {
  return ops.reduce((current, op) => applyOp(current, op), grid);
}

function gridSignature(grid: CellState[][]): string {
  return grid.map((row) => row.join('')).join('/');
}

function dihedralImages(grid: CellState[][]): CellState[][][] {
  const images: CellState[][][] = [];
  let current = grid;
  for (let turn = 0; turn < 4; turn++) {
    images.push(current, applyOp(current, 'flipLR'));
    current = applyOp(current, 'rot90cw');
  }
  return images;
}

function transformsToIdentity(n: number, ops: Op[]): boolean {
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      let r = row;
      let c = col;
      for (const op of ops) {
        const next = destination(n, r, c, op);
        r = next[0];
        c = next[1];
      }
      if (r !== row || c !== col) return false;
    }
  }
  return true;
}

const OP_TEXT: Record<Op, string> = {
  rot90cw: 'Rotate the figure 90° clockwise',
  rot90ccw: 'Rotate the figure 90° counterclockwise',
  rot180: 'Rotate the figure 180°',
  flipLR: 'Flip it left-to-right',
  flipTB: 'Flip it top-to-bottom',
};

const OP_NOUN: Record<Op, string> = {
  rot90cw: 'a 90° clockwise rotation',
  rot90ccw: 'a 90° counterclockwise rotation',
  rot180: 'a 180° rotation',
  flipLR: 'a left-to-right flip',
  flipTB: 'a top-to-bottom flip',
};

const OPS: Op[] = ['rot90cw', 'rot90ccw', 'rot180', 'flipLR', 'flipTB'];

function operationPrompt(ops: Op[]): string {
  const clauses = ops.map((op, index) => {
    const text = OP_TEXT[op];
    return index === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
  });
  return `${clauses.join(', then ')}. Which option shows the result?`;
}

function renderGrid(grid: CellState[][]): string {
  const n = grid.length;
  const pad = 8;
  const cell = Math.round(((100 - 2 * pad) / n) * 1000) / 1000;
  const parts: string[] = [];
  const extent = pad + n * cell;
  for (let i = 0; i <= n; i++) {
    const pos = pad + i * cell;
    parts.push(
      `<line x1="${fmt(pad)}" y1="${fmt(pos)}" x2="${fmt(extent)}" y2="${fmt(pos)}" stroke="#e5e7eb" stroke-width="1"/>`,
    );
    parts.push(
      `<line x1="${fmt(pos)}" y1="${fmt(pad)}" x2="${fmt(pos)}" y2="${fmt(extent)}" stroke="#e5e7eb" stroke-width="1"/>`,
    );
  }
  const inset = Math.min(1.25, cell * 0.08);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const state = grid[row][col];
      if (state === '#') {
        const x = pad + col * cell + inset;
        const y = pad + row * cell + inset;
        const size = cell - 2 * inset;
        parts.push(
          `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(size)}" height="${fmt(size)}" fill="#6b7280"/>`,
        );
      } else if (state === 'o') {
        parts.push(
          `<circle cx="${fmt(pad + (col + 0.5) * cell)}" cy="${fmt(pad + (row + 0.5) * cell)}" r="${fmt(cell * 0.2)}" fill="#1f2937"/>`,
        );
      }
    }
  }
  return svg('0 0 100 100', parts.join(''));
}

function randomFigure(rng: Rng, n: number): CellState[][] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = rng.shuffle(Array.from({ length: n * n }, (_, index) => index));
    const grid = Array.from({ length: n }, () => Array<CellState>(n).fill('.'));
    const marker = order[0];
    grid[Math.floor(marker / n)][marker % n] = 'o';
    const shadeCount = rng.int(Math.max(2, n - 1), Math.max(2, Math.floor(n * n * 0.5)));
    for (let i = 1; i <= shadeCount && i < order.length; i++) {
      const index = order[i];
      grid[Math.floor(index / n)][index % n] = '#';
    }
    const signatures = new Set(dihedralImages(grid).map(gridSignature));
    if (signatures.size === 8) return grid;
  }
  return null;
}

function chooseOps(rng: Rng, n: number, count: number): Op[] | null {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ops = Array.from({ length: count }, () => rng.pick(OPS));
    // A step undone by the next one leaves fewer transformations than the level counts.
    const cancels = ops.some((op, index) => index > 0 && transformsToIdentity(n, [ops[index - 1], op]));
    if (count === 1 || (!cancels && !transformsToIdentity(n, ops))) return ops;
  }
  return null;
}

function buildTransform(rng: Rng, level: XformLevel): ChoiceItem | null {
  const source = randomFigure(rng, level.n);
  if (!source) return null;
  const ops = chooseOps(rng, level.n, level.steps);
  if (!ops) return null;
  const correct = applyOps(source, ops);
  const correctSig = gridSignature(correct);
  const seen = new Set<string>([correctSig]);
  const pool: CellState[][][] = [];
  for (const image of dihedralImages(source)) {
    const signature = gridSignature(image);
    if (seen.has(signature)) continue;
    seen.add(signature);
    pool.push(image);
  }
  if (pool.length < level.options - 1) return null;
  const distractors = rng.shuffle(pool).slice(0, level.options - 1);
  const answer = rng.int(0, distractors.length);
  const optionGrids = distractors.slice();
  optionGrids.splice(answer, 0, correct);
  if (gridSignature(optionGrids[answer]) !== correctSig) return null;
  const noun = ops.map((op) => OP_NOUN[op]).join(', then ');
  return {
    kind: 'choice',
    id: `sp-xform-${level.id}-${gridSignature(source)}-${ops.join('.')}-${optionGrids.map(gridSignature).join('~')}`,
    domain: 'spatial',
    family: QUESTION_FAMILY.xform,
    b: level.b,
    a: level.a,
    prompt: operationPrompt(ops),
    explanation: `Option ${LETTERS[answer]} is the figure after ${noun}. The other options are different orientations of the same figure.`,
    stimulus: { type: 'svg', svg: renderGrid(source) },
    options: optionGrids.map((grid) => ({ type: 'svg', svg: renderGrid(grid) })),
    answer,
  };
}

/** Sheet is 100 units inside each ~112 panel, with a 6-unit margin and a 12-unit gap. */
const SHEET = 100;
const PANEL = 112;
const SHEET_AT = 6;
const EDGE_MARGIN = 0.12;
const FOLD_CLEARANCE = 0.08;
const HOLE_GAP = 0.12;

function sheetCoord(value: number, origin: number): number {
  return origin + value * SHEET;
}

function coordList(points: Pt[], origin: number): string {
  return points.map((point) => `${fmt(sheetCoord(point.x, origin))},${fmt(sheetCoord(point.y, origin))}`).join(' ');
}

function originalSquare(): string {
  return `<rect x="${SHEET_AT}" y="${SHEET_AT}" width="${SHEET}" height="${SHEET}" fill="none" stroke="#e5e7eb" stroke-width="1.5" stroke-dasharray="3 2"/>`;
}

function polygon(points: Pt[], fill: string, stroke: string): string {
  const strokeAttr = stroke === 'none' ? '' : ` stroke="${stroke}" stroke-width="2"`;
  return `<polygon points="${coordList(points, SHEET_AT)}" fill="${fill}"${strokeAttr}/>`;
}

function snap(point: Pt): Pt {
  return { x: Math.round(point.x * 12) / 12, y: Math.round(point.y * 12) / 12 };
}

function pointKey(point: Pt): string {
  const snapped = snap(point);
  return `${Math.round(snapped.x * 12)},${Math.round(snapped.y * 12)}`;
}

function pointSetKey(points: Pt[]): string {
  return points.map(pointKey).sort().join('|');
}

function sortPoints(points: Pt[]): Pt[] {
  return [...points].sort((a, b) => a.y - b.y || a.x - b.x);
}

function reflect(point: Pt, line: Line): Pt {
  if (line.axis === 'v') return { x: 2 * line.x - point.x, y: point.y };
  if (line.axis === 'h') return { x: point.x, y: 2 * line.y - point.y };
  if (line.axis === 'd') return { x: point.y - line.b, y: point.x + line.b };
  return { x: line.s - point.y, y: line.s - point.x };
}

/** Later folds are undone first, so each fold line reflects every layer the punch went through. */
function unfold(punch: Pt, lines: Line[]): Pt[] {
  let points = [snap(punch)];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const next: Pt[] = [];
    const seen = new Set<string>();
    for (const point of points) {
      for (const image of [point, snap(reflect(point, line))]) {
        const key = pointKey(image);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(image);
      }
    }
    points = next;
  }
  return points;
}

function distToLine(point: Pt, line: Line): number {
  if (line.axis === 'v') return Math.abs(point.x - line.x);
  if (line.axis === 'h') return Math.abs(point.y - line.y);
  if (line.axis === 'd') return Math.abs(point.y - point.x - line.b) / Math.SQRT2;
  return Math.abs(point.x + point.y - line.s) / Math.SQRT2;
}

function fromEdge(point: Pt): number {
  return Math.min(point.x, point.y, 1 - point.x, 1 - point.y);
}

function separated(points: Pt[]): boolean {
  for (let i = 0; i < points.length; i++) {
    if (fromEdge(points[i]) < EDGE_MARGIN - 1e-6) return false;
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.hypot(dx, dy) < HOLE_GAP - 1e-6) return false;
    }
  }
  return true;
}

function onInnerLattice(point: Pt): boolean {
  const snapped = snap(point);
  const i = Math.round(snapped.x * 12);
  const j = Math.round(snapped.y * 12);
  // Centres of the inner 4×4 of a 6×6 grid are the odd twelfths from 3/12 through 9/12.
  return i % 2 === 1 && j % 2 === 1 && i >= 3 && i <= 9 && j >= 3 && j <= 9 &&
    Math.abs(snapped.x * 12 - i) < 1e-6 && Math.abs(snapped.y * 12 - j) < 1e-6;
}

function holesOk(points: Pt[], lines: Line[]): boolean {
  if (points.length === 0 || !separated(points) || !points.every(onInnerLattice)) return false;
  return points.every((point) => lines.every((line) => distToLine(point, line) >= FOLD_CLEARANCE - 1e-6));
}

function rectCorners(rect: Rect): Pt[] {
  return [
    { x: rect.x0, y: rect.y0 },
    { x: rect.x1, y: rect.y0 },
    { x: rect.x1, y: rect.y1 },
    { x: rect.x0, y: rect.y1 },
  ];
}

function halfStep(rect: Rect, dir: Half): { drawn: DrawnFold; line: Line; keptRect: Rect } {
  const vertical = dir === 'LR' || dir === 'RL';
  const mid = vertical ? (rect.x0 + rect.x1) / 2 : (rect.y0 + rect.y1) / 2;
  const line: Line = vertical ? { axis: 'v', x: mid } : { axis: 'h', y: mid };
  const keptRect = { ...rect };
  const shadeRect = { ...rect };
  if (dir === 'LR') {
    keptRect.x0 = mid;
    shadeRect.x1 = mid;
  } else if (dir === 'RL') {
    keptRect.x1 = mid;
    shadeRect.x0 = mid;
  } else if (dir === 'TB') {
    keptRect.y0 = mid;
    shadeRect.y1 = mid;
  } else {
    keptRect.y1 = mid;
    shadeRect.y0 = mid;
  }
  const segment: [Pt, Pt] = vertical
    ? [
        { x: mid, y: rect.y0 },
        { x: mid, y: rect.y1 },
      ]
    : [
        { x: rect.x0, y: mid },
        { x: rect.x1, y: mid },
      ];
  return {
    line,
    keptRect,
    drawn: { packet: rectCorners(rect), shade: rectCorners(shadeRect), kept: rectCorners(keptRect), segment },
  };
}

function diagonalStep(rng: Rng, rect: Rect): { drawn: DrawnFold; line: Line; side: (point: Pt) => boolean; kept: Pt[] } {
  const tl = { x: rect.x0, y: rect.y0 };
  const tr = { x: rect.x1, y: rect.y0 };
  const br = { x: rect.x1, y: rect.y1 };
  const bl = { x: rect.x0, y: rect.y1 };
  // Only the main diagonal. The safe quadrants sit on y = x, so reflections stay on the inner lattice.
  const b = rect.y0 - rect.x0;
  const line: Line = { axis: 'd', b };
  const below = [tl, bl, br];
  const above = [tl, tr, br];
  const keepBelow = rng.chance(0.5);
  const kept = keepBelow ? below : above;
  const shade = keepBelow ? above : below;
  const side = (point: Pt) => (keepBelow ? point.y - point.x - b > 1e-9 : point.x + b - point.y > 1e-9);
  return { line, side, kept, drawn: { packet: rectCorners(rect), shade, kept, segment: [tl, br] } };
}

function innerLattice(): Pt[] {
  const points: Pt[] = [];
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 4; col++) points.push({ x: (col + 0.5) / 6, y: (row + 0.5) / 6 });
  }
  return points;
}

function latticeInside(rect: Rect, side?: (point: Pt) => boolean): Pt[] {
  return innerLattice().filter((point) => {
    if (point.x <= rect.x0 + 1e-9 || point.x >= rect.x1 - 1e-9) return false;
    if (point.y <= rect.y0 + 1e-9 || point.y >= rect.y1 - 1e-9) return false;
    return !side || side(point);
  });
}

function isVertical(dir: Half): boolean {
  return dir === 'LR' || dir === 'RL';
}

/** Two half-folds that land on a quadrant bisected by y = x, so a diagonal fold stays interior. */
const SAFE_DIAGONAL_FOLDS: ReadonlyArray<readonly [Half, Half]> = [
  ['LR', 'TB'],
  ['TB', 'LR'],
  ['RL', 'BT'],
  ['BT', 'RL'],
];

function chooseHalves(rng: Rng, count: number, diagonal: boolean): Half[] {
  if (diagonal) return [...rng.pick(SAFE_DIAGONAL_FOLDS)];
  const dirs: Half[] = ['LR', 'RL', 'TB', 'BT'];
  if (count === 1) return [rng.pick(dirs)];
  const first = rng.pick(dirs);
  const second = rng.pick(dirs.filter((dir) => isVertical(dir) !== isVertical(first)));
  return [first, second];
}

function isSquare(rect: Rect): boolean {
  return Math.abs(rect.x1 - rect.x0 - (rect.y1 - rect.y0)) < 1e-9;
}

function planFolds(rng: Rng, steps: number, diagonal: boolean): FoldPlan | null {
  let rect: Rect = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const drawn: DrawnFold[] = [];
  const lines: Line[] = [];
  for (const dir of chooseHalves(rng, steps, diagonal)) {
    const step = halfStep(rect, dir);
    drawn.push(step.drawn);
    lines.push(step.line);
    rect = step.keptRect;
  }
  let side: ((point: Pt) => boolean) | undefined;
  let finalPacket = rectCorners(rect);
  if (diagonal) {
    if (!isSquare(rect)) return null;
    const diag = diagonalStep(rng, rect);
    drawn.push(diag.drawn);
    lines.push(diag.line);
    side = diag.side;
    finalPacket = diag.kept;
  }
  const punches = latticeInside(rect, side).filter((punch) => {
    const holes = unfold(punch, lines);
    return holes.length === 2 ** lines.length && holesOk(holes, lines);
  });
  if (punches.length === 0) return null;
  return { lines, steps: drawn, finalPacket, punches };
}

interface FoldDistractors {
  options: Pt[][];
  /** The fourth foil leaves the last fold closed instead of punching a different spot. */
  closedFold: boolean;
}

function foldDistractors(rng: Rng, holes: Pt[], punch: Pt, plan: FoldPlan, count: number): FoldDistractors | null {
  const lines = plan.lines;
  const used = new Set<string>([pointSetKey(holes)]);
  const chosen: Pt[][] = [];
  const holeKeys = new Set(holes.map(pointKey));
  const free = innerLattice().filter((point) => !holeKeys.has(pointKey(point)));
  if (free.length < 2) return null;

  const drop = rng.pick(holes);
  if (!take(holes.filter((point) => pointKey(point) !== pointKey(drop)))) return null;
  const extraPoint = rng.pick(free);
  if (!take(holes.concat(extraPoint))) return null;
  const movedFrom = rng.pick(holes);
  const destinations = free.filter((point) => pointKey(point) !== pointKey(extraPoint));
  if (destinations.length === 0) return null;
  const moved = holes.filter((point) => pointKey(point) !== pointKey(movedFrom)).concat(rng.pick(destinations));
  if (!take(moved)) return null;
  if (chosen.length === count) return { options: chosen, closedFold: false };

  // Same hole count and symmetry as the key, so only the punch position gives it away.
  const elsewhere = rng.shuffle(plan.punches.filter((point) => pointKey(point) !== pointKey(punch)));
  for (const other of elsewhere) {
    if (take(unfold(other, lines))) return chosen.length === count ? { options: chosen, closedFold: false } : null;
  }
  const partial = unfold(punch, lines.slice(0, -1));
  if (!take(partial)) return null;
  return chosen.length === count ? { options: chosen, closedFold: true } : null;

  function take(points: Pt[]): boolean {
    if (!separated(points) || !points.every(onInnerLattice)) return false;
    const key = pointSetKey(points);
    if (used.has(key)) return false;
    used.add(key);
    chosen.push(sortPoints(points));
    return true;
  }
}

function centroid(points: Pt[]): Pt {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function arrowMarkup(from: Pt, to: Pt): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const base = { x: to.x - ux * 0.07, y: to.y - uy * 0.07 };
  const left = { x: base.x + px * 0.04, y: base.y + py * 0.04 };
  const right = { x: base.x - px * 0.04, y: base.y - py * 0.04 };
  return `<polyline points="${coordList([from, base], SHEET_AT)}" fill="none" stroke="#1f2937" stroke-width="2.5"/>` +
    `<polygon points="${coordList([to, left, right], SHEET_AT)}" fill="#1f2937"/>`;
}

function holeCircle(point: Pt, origin: number): string {
  return `<circle cx="${fmt(sheetCoord(point.x, origin))}" cy="${fmt(sheetCoord(point.y, origin))}" r="5" fill="#ffffff" stroke="#1f2937" stroke-width="2"/>`;
}

function foldSegment(a: Pt, b: Pt): string {
  return `<line x1="${fmt(sheetCoord(a.x, SHEET_AT))}" y1="${fmt(sheetCoord(a.y, SHEET_AT))}" x2="${fmt(sheetCoord(b.x, SHEET_AT))}" y2="${fmt(sheetCoord(b.y, SHEET_AT))}" stroke="#1f2937" stroke-width="2" stroke-dasharray="4 3"/>`;
}

function renderStep(step: DrawnFold): string {
  const from = centroid(step.shade);
  const toward = centroid(step.kept);
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const dist = Math.min(0.2, len * 0.6);
  const to = { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
  return [
    originalSquare(),
    polygon(step.packet, '#ffffff', 'none'),
    polygon(step.shade, '#d1d5db', 'none'),
    foldSegment(step.segment[0], step.segment[1]),
    polygon(step.packet, 'none', '#1f2937'),
    arrowMarkup(from, to),
  ].join('');
}

function renderPunch(packet: Pt[], punch: Pt): string {
  return `${originalSquare()}${polygon(packet, '#ffffff', '#1f2937')}${holeCircle(punch, SHEET_AT)}`;
}

function foldStimulus(steps: DrawnFold[], packet: Pt[], punch: Pt): string {
  const panels = [...steps.map(renderStep), renderPunch(packet, punch)];
  const body = panels.map((panel, index) => `<g transform="translate(${index * PANEL} 0)">${panel}</g>`).join('');
  return svg(`0 0 ${panels.length * PANEL} ${PANEL}`, body);
}

function holesSvg(points: Pt[]): string {
  const circles = sortPoints(points).map((point) => holeCircle(point, 0)).join('');
  return svg(
    '0 0 100 100',
    `<rect x="0" y="0" width="100" height="100" fill="#ffffff" stroke="#1f2937" stroke-width="2"/>${circles}`,
  );
}

function lineKey(line: Line): string {
  if (line.axis === 'v') return `v${line.x}`;
  if (line.axis === 'h') return `h${line.y}`;
  if (line.axis === 'd') return `d${line.b}`;
  return `a${line.s}`;
}

function buildFold(rng: Rng, level: FoldLevel): ChoiceItem | null {
  const plan = planFolds(rng, level.steps, level.diagonal);
  if (!plan) return null;
  const punch = rng.pick(plan.punches);
  const holes = unfold(punch, plan.lines);
  const distractors = foldDistractors(rng, holes, punch, plan, level.options - 1);
  if (!distractors) return null;
  const answer = rng.int(0, distractors.options.length);
  const optionPoints = distractors.options.slice();
  optionPoints.splice(answer, 0, sortPoints(holes));
  const keys = optionPoints.map(pointSetKey);
  if (new Set(keys).size !== keys.length) return null;
  let other = 'The other options omit a hole, add a hole, or move one.';
  if (level.options === 5) {
    other = distractors.closedFold
      ? 'The other options omit a hole, add a hole, move one, or leave a fold closed.'
      : 'The other options omit a hole, add a hole, move one, or show a punch in a different spot.';
  }
  return {
    kind: 'choice',
    id: `sp-fold-${level.id}-${plan.lines.map(lineKey).join('.')}-p${pointKey(punch)}-${keys.join('~')}`,
    domain: 'spatial',
    family: QUESTION_FAMILY.fold,
    b: level.b,
    a: level.a,
    prompt: 'The paper is folded as shown and a hole is punched. Which option shows it unfolded?',
    explanation: `Option ${LETTERS[answer]} shows the unfolded sheet with ${holes.length} holes. ${other}`,
    stimulus: { type: 'svg', svg: foldStimulus(plan.steps, plan.finalPacket, punch) },
    options: optionPoints.map((points) => ({ type: 'svg', svg: holesSvg(points) })),
    answer,
  };
}

const FAMILIES = ['rot', 'xform', 'fold'] as const;

function levelDistance(level: Level, targetB: number): number {
  return Math.round(Math.abs(level.b - targetB) * 1e6) / 1e6;
}

function nearestOf(rng: Rng, levels: Level[], targetB: number): Level {
  const best = Math.min(...levels.map((level) => levelDistance(level, targetB)));
  return rng.pick(levels.filter((level) => levelDistance(level, targetB) === best));
}

function chooseStartLevel(rng: Rng, targetB: number): Level {
  const eligible = FAMILIES.filter((family) =>
    LEVELS.some((level) => level.family === family && levelDistance(level, targetB) <= 0.4),
  );
  if (eligible.length > 0) {
    const family = rng.pick(eligible);
    return nearestOf(rng, LEVELS.filter((level) => level.family === family), targetB);
  }
  const best = Math.min(...LEVELS.map((level) => levelDistance(level, targetB)));
  const nearest = rng.pick(LEVELS.filter((level) => levelDistance(level, targetB) === best));
  return nearestOf(rng, LEVELS.filter((level) => level.family === nearest.family), targetB);
}

function orderedLevels(rng: Rng, targetB: number): Level[] {
  const start = chooseStartLevel(rng, targetB);
  const groups = new Map<number, Level[]>();
  for (const level of LEVELS) {
    if (level === start) continue;
    const key = levelDistance(level, targetB);
    const group = groups.get(key);
    if (group) group.push(level);
    else groups.set(key, [level]);
  }
  const rest: Level[] = [];
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(key);
    if (group) rest.push(...rng.shuffle(group));
  }
  return [start, ...rest];
}

function buildLevel(rng: Rng, level: Level): ChoiceItem | null {
  if (level.family === 'rot') return buildRotation(rng, level);
  if (level.family === 'xform') return buildTransform(rng, level);
  return buildFold(rng, level);
}

export const spatialGenerator: ItemGenerator = {
  domain: 'spatial',
  generate(rng, targetB, usedIds) {
    const levels = orderedLevels(rng, targetB);
    for (const level of levels) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const item = buildLevel(rng, level);
        if (item && !usedIds.has(item.id)) return item;
      }
    }
    const fallback = levels[0];
    for (let attempt = 0; attempt < 200; attempt++) {
      const item = buildLevel(rng, fallback);
      if (item && !usedIds.has(item.id)) return item;
    }
    throw new Error('spatial: could not generate a fresh item');
  },
  practice() {
    return practiceItem;
  },
};
