import { hashSeed, type Rng } from '../core/rng';
import type { ChoiceItem } from '../core/types';

/** How far a family's nearest level can sit from targetB and still be offered. */
export const PROCEDURAL_WINDOW = 0.65;

const FAMILIES = {
  analogy: 'vb-analogy',
  deduction: 'vb-deduction',
} as const;

const NAMES = [
  'Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gio', 'Hao', 'Ines', 'Jin',
  'Kai', 'Luz', 'Mo', 'Nia', 'Omar', 'Pri', 'Quinn', 'Rae', 'Sol', 'Tao',
  'Uma', 'Vic', 'Wen', 'Yao', 'Zuri', 'Amir', 'Bia', 'Chen', 'Dara', 'Eshe',
  'Hana', 'Idris', 'Jiro', 'Keiko', 'Lila', 'Noor', 'Obi', 'Pia', 'Sora', 'Tariq',
  'Yara', 'Leila', 'Mateo', 'Imani', 'Sven', 'Aiko', 'Farid', 'Rafi',
] as const;

const CATEGORY_NOUNS = [
  'brimps', 'flunes', 'zorps', 'quells', 'mivets', 'daxen', 'plorns', 'velks', 'snibs', 'crends',
  'yalts', 'gorns', 'teppins', 'tharns', 'naxels', 'womps', 'fribbs', 'jorves', 'skents', 'bluvs',
] as const;

export interface LogicStmt {
  q: 'all' | 'some' | 'no' | 'some-not';
  s: number;
  p: number;
}

type SylAsk = 'must' | 'could' | 'cannot';

interface SylForm {
  id: string;
  b: number;
  k: number;
  ask: SylAsk;
  premises: readonly LogicStmt[];
  key: LogicStmt;
  distractors: readonly [LogicStmt, LogicStmt, LogicStmt, LogicStmt];
}

interface Pair {
  x: string;
  y: string;
  reverse: string;
  surfaces: readonly [string, string, string];
}

interface Relation {
  id: string;
  b: number;
  blurb: string;
  pairs: readonly Pair[];
}

interface OrderRelation {
  id: 'older' | 'taller' | 'before' | 'left';
  cmp: string;
  inv: string;
  most: string;
  least: string;
  /** Stem after "the second …". */
  ordinal: string;
}

interface OrderLevel {
  b: number;
  n: number;
  /** Phrase some comparisons in the inverse direction. */
  inverse: boolean;
  /** Redundant "not the tallest / shortest" lines, used only as noise. */
  indirect: boolean;
  ask: 'who' | 'must' | 'cannot';
  /** Rank asked about when ask is 'who'. 0 is the most extreme. */
  index: number;
  /** Comparison options must skip at least this many places in the order. */
  minGap: number;
}

export interface OrderOption {
  text: string;
  kind: 'person' | 'undetermined' | 'compare';
  /** For a compare option, the person who would be on the "more" side. */
  pair?: readonly [string, string];
}

export interface OrderBuilt {
  item: ChoiceItem;
  people: readonly string[];
  befores: readonly (readonly [string, string])[];
  notMost: readonly string[];
  notLeast: readonly string[];
  question: 'who' | 'must' | 'cannot';
  /** Set when question is 'who'. */
  askIndex?: number;
  options: readonly OrderOption[];
}

export interface SyllogismBuilt {
  item: ChoiceItem;
  k: number;
  names: readonly string[];
  premises: readonly LogicStmt[];
  options: readonly LogicStmt[];
  ask: SylAsk;
}

export interface AnalogyBuilt {
  item: ChoiceItem;
  relationId: string;
  a: string;
  b: string;
  c: string;
  d: string;
}

const ORDER_RELATIONS: readonly OrderRelation[] = [
  { id: 'older', cmp: 'is older than', inv: 'is younger than', most: 'the oldest', least: 'the youngest', ordinal: 'oldest' },
  { id: 'taller', cmp: 'is taller than', inv: 'is shorter than', most: 'the tallest', least: 'the shortest', ordinal: 'tallest' },
  { id: 'before', cmp: 'finished before', inv: 'finished after', most: 'the first to finish', least: 'the last to finish', ordinal: 'to finish' },
  { id: 'left', cmp: 'sits to the left of', inv: 'sits to the right of', most: 'the leftmost', least: 'the rightmost', ordinal: 'from the left' },
];

// b tracks chain length, headcount, inverse wording, and indirect noise — not a fixed ladder.
const ORDER_LEVELS: readonly OrderLevel[] = [
  { b: -2.15, n: 3, inverse: false, indirect: false, ask: 'who', index: 0, minGap: 2 },
  { b: -1.55, n: 3, inverse: false, indirect: false, ask: 'who', index: 1, minGap: 2 },
  { b: -0.85, n: 4, inverse: false, indirect: false, ask: 'who', index: 1, minGap: 2 },
  { b: -0.3, n: 4, inverse: true, indirect: false, ask: 'who', index: 3, minGap: 2 },
  { b: 0.3, n: 5, inverse: true, indirect: false, ask: 'who', index: 2, minGap: 2 },
  { b: 0.8, n: 5, inverse: true, indirect: true, ask: 'who', index: 3, minGap: 2 },
  { b: 1.25, n: 5, inverse: true, indirect: true, ask: 'must', index: 0, minGap: 2 },
  { b: 1.75, n: 6, inverse: true, indirect: true, ask: 'who', index: 2, minGap: 2 },
  { b: 2.15, n: 6, inverse: true, indirect: true, ask: 'must', index: 0, minGap: 3 },
  { b: 2.5, n: 6, inverse: true, indirect: true, ask: 'cannot', index: 0, minGap: 3 },
];

const SYLLOGISM_FORMS: readonly SylForm[] = [
  {
    id: 'barbara',
    b: -2.05,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
    ],
    key: { q: 'all', s: 0, p: 2 },
    distractors: [
      { q: 'all', s: 2, p: 0 },
      { q: 'all', s: 1, p: 0 },
      { q: 'no', s: 0, p: 2 },
      { q: 'some-not', s: 0, p: 2 },
    ],
  },
  {
    id: 'darii',
    b: -1.35,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'some', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
    ],
    key: { q: 'some', s: 0, p: 2 },
    distractors: [
      { q: 'all', s: 0, p: 2 },
      { q: 'all', s: 2, p: 0 },
      { q: 'no', s: 0, p: 2 },
      { q: 'some-not', s: 0, p: 1 },
    ],
  },
  {
    id: 'celarent',
    b: -0.65,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'no', s: 0, p: 1 },
      { q: 'all', s: 2, p: 0 },
    ],
    key: { q: 'no', s: 2, p: 1 },
    distractors: [
      { q: 'all', s: 2, p: 1 },
      { q: 'some', s: 2, p: 1 },
      { q: 'all', s: 0, p: 2 },
      { q: 'some', s: 1, p: 0 },
    ],
  },
  {
    id: 'ferio',
    b: -0.1,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'no', s: 0, p: 1 },
      { q: 'some', s: 2, p: 0 },
    ],
    key: { q: 'some-not', s: 2, p: 1 },
    distractors: [
      { q: 'no', s: 2, p: 1 },
      { q: 'some', s: 2, p: 1 },
      { q: 'all', s: 2, p: 0 },
      { q: 'no', s: 2, p: 0 },
    ],
  },
  {
    id: 'some-conversion',
    b: 0.4,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'some', s: 0, p: 1 },
      { q: 'some', s: 1, p: 2 },
    ],
    key: { q: 'some', s: 1, p: 0 },
    distractors: [
      { q: 'some', s: 0, p: 2 },
      { q: 'all', s: 1, p: 0 },
      { q: 'all', s: 0, p: 2 },
      { q: 'no', s: 0, p: 2 },
    ],
  },
  {
    id: 'illicit-particular',
    b: 0.95,
    k: 4,
    ask: 'must',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
      { q: 'some', s: 2, p: 3 },
    ],
    key: { q: 'all', s: 0, p: 2 },
    distractors: [
      { q: 'some', s: 0, p: 3 },
      { q: 'all', s: 3, p: 2 },
      { q: 'all', s: 2, p: 0 },
      { q: 'some', s: 3, p: 0 },
    ],
  },
  {
    id: 'short-chain',
    b: 1.2,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'no', s: 1, p: 2 },
    ],
    key: { q: 'no', s: 0, p: 2 },
    distractors: [
      { q: 'all', s: 1, p: 0 },
      { q: 'some', s: 0, p: 2 },
      { q: 'all', s: 0, p: 2 },
      { q: 'some-not', s: 2, p: 1 },
    ],
  },
  {
    id: 'three-step-some',
    b: 1.5,
    k: 4,
    ask: 'must',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
      { q: 'some', s: 3, p: 0 },
    ],
    key: { q: 'some', s: 3, p: 2 },
    distractors: [
      { q: 'all', s: 3, p: 2 },
      { q: 'all', s: 1, p: 0 },
      { q: 'all', s: 2, p: 1 },
      { q: 'no', s: 3, p: 1 },
    ],
  },
  {
    id: 'contingent',
    b: 1.85,
    k: 4,
    ask: 'could',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
      { q: 'some-not', s: 2, p: 3 },
      { q: 'no', s: 3, p: 0 },
    ],
    key: { q: 'some-not', s: 1, p: 0 },
    distractors: [
      { q: 'some-not', s: 0, p: 2 },
      { q: 'some', s: 0, p: 3 },
      { q: 'no', s: 0, p: 1 },
      { q: 'all', s: 2, p: 3 },
    ],
  },
  {
    id: 'middle-term',
    b: 2.2,
    k: 3,
    ask: 'must',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 2, p: 1 },
      { q: 'some-not', s: 0, p: 2 },
    ],
    key: { q: 'some-not', s: 1, p: 2 },
    distractors: [
      { q: 'all', s: 1, p: 0 },
      { q: 'all', s: 1, p: 2 },
      { q: 'no', s: 0, p: 2 },
      { q: 'some', s: 2, p: 0 },
    ],
  },
  {
    id: 'cannot-chain',
    b: 2.5,
    k: 4,
    ask: 'cannot',
    premises: [
      { q: 'all', s: 0, p: 1 },
      { q: 'all', s: 1, p: 2 },
      { q: 'no', s: 2, p: 3 },
      { q: 'some-not', s: 3, p: 1 },
    ],
    key: { q: 'some', s: 0, p: 3 },
    distractors: [
      { q: 'all', s: 1, p: 0 },
      { q: 'no', s: 0, p: 3 },
      { q: 'some-not', s: 3, p: 2 },
      { q: 'some-not', s: 1, p: 0 },
    ],
  },
];

function pair(x: string, y: string, reverse: string, s1: string, s2: string, s3: string): Pair {
  return { x, y, reverse, surfaces: [s1, s2, s3] };
}

const RELATIONS: readonly Relation[] = [
  {
    id: 'antonym',
    b: -2.2,
    blurb: 'is the opposite of',
    pairs: [
      pair('HOT', 'COLD', 'WARM', 'HEAT', 'SUN', 'FIRE'),
      pair('UP', 'DOWN', 'HIGH', 'SKY', 'ROOF', 'LIFT'),
      pair('OPEN', 'CLOSED', 'AJAR', 'DOOR', 'GATE', 'LID'),
      pair('WET', 'DRY', 'DAMP', 'WATER', 'RAIN', 'PUDDLE'),
      pair('BIG', 'SMALL', 'MEDIUM', 'HUGE', 'TALL', 'WIDE'),
      pair('FAST', 'SLOW', 'QUICK', 'SPEED', 'RACE', 'CHASE'),
      pair('HAPPY', 'SAD', 'GLAD', 'SMILE', 'JOY', 'LAUGH'),
      pair('FULL', 'EMPTY', 'HALF', 'TANK', 'GLASS', 'LEVEL'),
    ],
  },
  {
    id: 'young-adult',
    b: -1.6,
    blurb: 'is the adult of',
    pairs: [
      pair('PUPPY', 'DOG', 'CUB', 'BONE', 'LEASH', 'BARK'),
      pair('KITTEN', 'CAT', 'KIT', 'YARN', 'MILK', 'FUR'),
      pair('CALF', 'COW', 'VEAL', 'GRASS', 'BARN', 'HERD'),
      pair('FOAL', 'HORSE', 'COLT', 'HAY', 'SADDLE', 'MANE'),
      pair('CUB', 'BEAR', 'PUP', 'DEN', 'CAVE', 'CLAW'),
      pair('CHICK', 'HEN', 'EGG', 'NEST', 'FEATHER', 'GRAIN'),
      pair('LAMB', 'SHEEP', 'KID', 'WOOL', 'FLOCK', 'MEADOW'),
      pair('DUCKLING', 'DUCK', 'DRAKE', 'POND', 'BILL', 'PADDLE'),
    ],
  },
  {
    id: 'category-member',
    b: -1.1,
    blurb: 'is a member of the category',
    pairs: [
      pair('FRUIT', 'APPLE', 'FOOD', 'ORCHARD', 'JUICE', 'PIE'),
      pair('METAL', 'IRON', 'ELEMENT', 'MINE', 'RUST', 'STEEL'),
      pair('BIRD', 'SPARROW', 'ANIMAL', 'NEST', 'WING', 'BEAK'),
      pair('FISH', 'SALMON', 'CREATURE', 'SCALE', 'GILL', 'OCEAN'),
      pair('TREE', 'OAK', 'PLANT', 'LEAF', 'FOREST', 'ACORN'),
      pair('FLOWER', 'ROSE', 'BLOOM', 'PETAL', 'GARDEN', 'THORN'),
      pair('TOOL', 'HAMMER', 'OBJECT', 'HANDLE', 'NAIL', 'BENCH'),
      pair('INSECT', 'ANT', 'CREATURE', 'LEG', 'COLONY', 'ANTENNA'),
    ],
  },
  {
    id: 'part-whole',
    b: -0.6,
    blurb: 'has as a part',
    pairs: [
      pair('FINGER', 'HAND', 'NAIL', 'PALM', 'GLOVE', 'RING'),
      pair('PAGE', 'BOOK', 'WORD', 'COVER', 'SHELF', 'CHAPTER'),
      pair('WHEEL', 'CAR', 'SPOKE', 'TYRE', 'ROAD', 'ENGINE'),
      pair('KEY', 'KEYBOARD', 'LETTER', 'SCREEN', 'MOUSE', 'CABLE'),
      pair('LEAF', 'TREE', 'VEIN', 'BRANCH', 'FOREST', 'SHADE'),
      pair('BRICK', 'WALL', 'DUST', 'CEMENT', 'HOUSE', 'MORTAR'),
      pair('PETAL', 'FLOWER', 'TIP', 'SCENT', 'GARDEN', 'POLLEN'),
      pair('ROOM', 'HOUSE', 'FLOOR', 'DOOR', 'ROOF', 'STREET'),
    ],
  },
  {
    id: 'container',
    b: -0.15,
    blurb: 'is held in',
    pairs: [
      pair('BOTTLE', 'WATER', 'FLASK', 'CORK', 'LABEL', 'DRINK'),
      pair('LIBRARY', 'BOOK', 'BUILDING', 'SHELF', 'READER', 'CATALOGUE'),
      pair('QUIVER', 'ARROW', 'CASE', 'BOW', 'ARCHER', 'TARGET'),
      pair('WALLET', 'COIN', 'PURSE', 'CARD', 'POCKET', 'LEATHER'),
      pair('VASE', 'FLOWER', 'GLASS', 'TABLE', 'STEM', 'BOUQUET'),
      pair('ENVELOPE', 'LETTER', 'PACKET', 'STAMP', 'SEAL', 'ADDRESS'),
      pair('CAGE', 'BIRD', 'PEN', 'PERCH', 'SEED', 'BAR'),
      pair('TANK', 'FISH', 'POND', 'NET', 'CORAL', 'GLASS'),
    ],
  },
  {
    id: 'tool-user',
    b: 0.3,
    blurb: 'uses',
    pairs: [
      pair('PEN', 'WRITER', 'INK', 'PAPER', 'DESK', 'SCRIPT'),
      pair('SCALPEL', 'SURGEON', 'BLADE', 'PATIENT', 'HOSPITAL', 'STITCH'),
      pair('BRUSH', 'PAINTER', 'BRISTLE', 'CANVAS', 'EASEL', 'FRAME'),
      pair('OVEN', 'BAKER', 'TRAY', 'BREAD', 'FLOUR', 'KITCHEN'),
      pair('HAMMER', 'CARPENTER', 'CLAW', 'NAIL', 'WOOD', 'BENCH'),
      pair('NEEDLE', 'TAILOR', 'POINT', 'THREAD', 'CLOTH', 'BUTTON'),
      pair('PLOW', 'FARMER', 'BLADE', 'SOIL', 'FIELD', 'HARVEST'),
      pair('CAMERA', 'PHOTOGRAPHER', 'SHUTTER', 'LENS', 'TRIPOD', 'FLASH'),
    ],
  },
  {
    id: 'action-result',
    b: 0.7,
    blurb: 'results from',
    pairs: [
      pair('BAKE', 'BREAD', 'FLOUR', 'OVEN', 'KITCHEN', 'DOUGH'),
      pair('SEW', 'SHIRT', 'FABRIC', 'NEEDLE', 'THREAD', 'BUTTON'),
      pair('DIG', 'HOLE', 'DIRT', 'SPADE', 'SOIL', 'GARDEN'),
      pair('WRITE', 'LETTER', 'INK', 'PEN', 'PAPER', 'DESK'),
      pair('CHOP', 'WOOD', 'CHIP', 'AXE', 'TREE', 'LOG'),
      pair('FREEZE', 'ICE', 'FROST', 'COLD', 'WINTER', 'CUBE'),
      pair('WEAVE', 'CLOTH', 'YARN', 'LOOM', 'THREAD', 'PATTERN'),
      pair('PRINT', 'PAGE', 'TYPE', 'INK', 'PRESS', 'COPY'),
    ],
  },
  {
    id: 'degree',
    b: 1.05,
    blurb: 'is a stronger degree of',
    pairs: [
      pair('WARM', 'HOT', 'TEPID', 'BOIL', 'OVEN', 'SUMMER'),
      pair('COOL', 'COLD', 'CHILLY', 'ICE', 'WINTER', 'FREEZE'),
      pair('BREEZE', 'GALE', 'DRAFT', 'LEAF', 'SAIL', 'FLAG'),
      pair('DRIZZLE', 'DOWNPOUR', 'MIST', 'RAIN', 'CLOUD', 'PUDDLE'),
      pair('WHISPER', 'SHOUT', 'MURMUR', 'VOICE', 'ECHO', 'SPEECH'),
      pair('STROLL', 'SPRINT', 'JOG', 'WALK', 'PATH', 'SHOE'),
      pair('DISLIKE', 'HATE', 'ANNOY', 'ANGER', 'ENEMY', 'QUARREL'),
      pair('LIKE', 'LOVE', 'ENJOY', 'FONDNESS', 'HEART', 'FRIEND'),
    ],
  },
  {
    id: 'creator',
    b: 1.4,
    blurb: 'is created by',
    pairs: [
      pair('POET', 'POEM', 'PEN', 'RHYME', 'VERSE', 'STANZA'),
      pair('COMPOSER', 'SYMPHONY', 'BATON', 'ORCHESTRA', 'NOTE', 'CONCERT'),
      pair('SCULPTOR', 'STATUE', 'CLAY', 'STONE', 'CHISEL', 'MARBLE'),
      pair('ARCHITECT', 'BUILDING', 'RULER', 'PLAN', 'BRICK', 'STREET'),
      pair('CHEF', 'MEAL', 'KNIFE', 'KITCHEN', 'RECIPE', 'PAN'),
      pair('AUTHOR', 'NOVEL', 'PEN', 'CHAPTER', 'PAGE', 'PLOT'),
      pair('PAINTER', 'PORTRAIT', 'EASEL', 'CANVAS', 'BRUSH', 'FRAME'),
      pair('CARTOGRAPHER', 'MAP', 'PENCIL', 'COMPASS', 'SCALE', 'LEGEND'),
    ],
  },
  {
    id: 'cause',
    b: 1.75,
    blurb: 'is caused by',
    pairs: [
      pair('RAIN', 'FLOOD', 'CLOUD', 'UMBRELLA', 'PUDDLE', 'STORM'),
      pair('FIRE', 'SMOKE', 'SPARK', 'FLAME', 'ASH', 'HEAT'),
      pair('VIRUS', 'ILLNESS', 'GERM', 'FEVER', 'COUGH', 'DOCTOR'),
      pair('DROUGHT', 'FAMINE', 'SUN', 'CROP', 'DESERT', 'THIRST'),
      pair('JOKE', 'LAUGHTER', 'SMILE', 'CROWD', 'COMIC', 'STAGE'),
      pair('WIND', 'EROSION', 'GUST', 'DUST', 'SAND', 'SOIL'),
      pair('STUDY', 'KNOWLEDGE', 'READING', 'BOOK', 'SCHOOL', 'TEST'),
      pair('FRICTION', 'HEAT', 'RUB', 'SURFACE', 'WARMTH', 'MOTION'),
    ],
  },
  {
    id: 'representation',
    b: 2.05,
    blurb: 'is represented by',
    pairs: [
      pair('MAP', 'TERRITORY', 'COMPASS', 'SCALE', 'BORDER', 'NORTH'),
      pair('PORTRAIT', 'PERSON', 'FRAME', 'PAINT', 'LIKENESS', 'SITTER'),
      pair('SCRIPT', 'PLAY', 'ACTOR', 'STAGE', 'SCENE', 'DIALOGUE'),
      pair('SCORE', 'MUSIC', 'NOTE', 'ORCHESTRA', 'PAGE', 'TEMPO'),
      pair('BLUEPRINT', 'BUILDING', 'RULER', 'PLAN', 'WALL', 'SITE'),
      pair('MENU', 'MEAL', 'WAITER', 'DISH', 'PRICE', 'COURSE'),
      pair('DIAGRAM', 'MACHINE', 'LABEL', 'PART', 'ARROW', 'MANUAL'),
      pair('REPLICA', 'ORIGINAL', 'COPY', 'DISPLAY', 'VERSION', 'SCALE'),
    ],
  },
  {
    id: 'symptom',
    b: 2.35,
    blurb: 'is indicated by',
    pairs: [
      pair('FEVER', 'ILLNESS', 'CHILL', 'THERMOMETER', 'SWEAT', 'BED'),
      pair('COUGH', 'INFECTION', 'SNEEZE', 'THROAT', 'TISSUE', 'CHEST'),
      pair('RASH', 'ALLERGY', 'ITCH', 'SKIN', 'HIVE', 'POLLEN'),
      pair('LIMP', 'INJURY', 'PAIN', 'LEG', 'BANDAGE', 'CRUTCH'),
      pair('WILT', 'DROUGHT', 'DROOP', 'LEAF', 'PLANT', 'SOIL'),
      pair('SMOKE', 'FIRE', 'ASH', 'FLAME', 'ALARM', 'SIREN'),
      pair('TREMBLE', 'FEAR', 'SHAKE', 'HAND', 'NERVE', 'DANGER'),
      pair('BLISTER', 'BURN', 'SORE', 'SCAR', 'HEAT', 'SUN'),
    ],
  },
];

function signature(text: string): string {
  return `${hashSeed(text).toString(36)}${hashSeed('verbal', text).toString(36)}`;
}

function closest<T extends { b: number }>(levels: readonly T[], targetB: number): T {
  let best = levels[0];
  if (!best) throw new Error('Procedural family has no difficulty levels.');
  let bestDistance = Math.abs(best.b - targetB);
  for (const level of levels) {
    const distance = Math.abs(level.b - targetB);
    if (distance < bestDistance || (distance === bestDistance && level.b < best.b)) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

export function nearestProceduralDistance(targetB: number): number {
  const levels = [
    ...ORDER_LEVELS.map((level) => level.b),
    ...SYLLOGISM_FORMS.map((form) => form.b),
    ...RELATIONS.map((relation) => relation.b),
  ];
  return Math.min(...levels.map((b) => Math.abs(b - targetB)));
}

export function proceduralNear(targetB: number): boolean {
  return nearestProceduralDistance(targetB) <= PROCEDURAL_WINDOW;
}

function permutations(people: readonly string[]): string[][] {
  if (people.length <= 1) return [people.slice()];
  const out: string[][] = [];
  for (let i = 0; i < people.length; i += 1) {
    const head = people[i];
    if (!head) continue;
    const rest = people.slice(0, i).concat(people.slice(i + 1));
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

function modelsOf(
  people: readonly string[],
  befores: readonly (readonly [string, string])[],
  notMost: readonly string[],
  notLeast: readonly string[],
): string[][] {
  return permutations(people).filter((order) => {
    const at = new Map(order.map((name, index) => [name, index]));
    for (const [earlier, later] of befores) {
      if ((at.get(earlier) ?? 0) >= (at.get(later) ?? 0)) return false;
    }
    for (const name of notMost) if (at.get(name) === 0) return false;
    for (const name of notLeast) if (at.get(name) === order.length - 1) return false;
    return true;
  });
}

function rankPhrase(relation: OrderRelation, index: number, n: number): string {
  if (index === 0) return relation.most;
  if (index === n - 1) return relation.least;
  const ord = ['second', 'third', 'fourth', 'fifth', 'sixth'][index - 1] ?? `${index + 1}th`;
  return `the ${ord} ${relation.ordinal}`;
}

function compareText(relation: OrderRelation, earlier: string, later: string): string {
  return `${earlier} ${relation.cmp} ${later}.`;
}

function choiceItem(fields: {
  id: string;
  family: string;
  b: number;
  a: number;
  prompt: string;
  stimulus: string;
  options: readonly string[];
  answer: number;
  explanation: string;
}): ChoiceItem {
  return {
    id: fields.id,
    domain: 'verbal',
    kind: 'choice',
    family: fields.family,
    b: fields.b,
    a: fields.a,
    prompt: fields.prompt,
    explanation: fields.explanation,
    stimulus: { type: 'text', text: fields.stimulus },
    options: fields.options.map((text) => ({ type: 'text', text })),
    answer: fields.answer,
  };
}

function edgeKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function premiseBans(relation: OrderRelation, befores: readonly (readonly [string, string])[]): Set<string> {
  const banned = new Set<string>();
  for (const [earlier, later] of befores) {
    banned.add(`${earlier} ${relation.cmp} ${later}.`);
    banned.add(`${later} ${relation.cmp} ${earlier}.`);
    banned.add(`${earlier} ${relation.inv} ${later}.`);
    banned.add(`${later} ${relation.inv} ${earlier}.`);
  }
  return banned;
}

function comparisonChoices(
  relation: OrderRelation,
  order: readonly string[],
  minGap: number,
  direct: ReadonlySet<string>,
  banned: ReadonlySet<string>,
): { text: string; pair: [string, string]; holds: boolean; gap: number }[] {
  const found: { text: string; pair: [string, string]; holds: boolean; gap: number }[] = [];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = 0; j < order.length; j += 1) {
      const gap = Math.abs(i - j);
      if (gap < minGap) continue;
      const earlier = order[i];
      const later = order[j];
      if (!earlier || !later || direct.has(edgeKey(earlier, later))) continue;
      const text = compareText(relation, earlier, later);
      if (banned.has(text)) continue;
      found.push({ text, pair: [earlier, later], holds: i < j, gap });
    }
  }
  return found;
}

function finishOrder(rng: Rng, level: OrderLevel): OrderBuilt {
  const relation = rng.pick(ORDER_RELATIONS);
  const people = rng.shuffle(NAMES).slice(0, level.n);
  const order = rng.shuffle(people);
  const befores: [string, string][] = [];
  for (let i = 0; i < order.length - 1; i += 1) {
    const earlier = order[i];
    const later = order[i + 1];
    if (earlier && later) befores.push([earlier, later]);
  }
  const notMost: string[] = [];
  const notLeast: string[] = [];
  if (level.indirect) {
    const first = order[0];
    const last = order[order.length - 1];
    if (last) notMost.push(last);
    if (first) notLeast.push(first);
  }
  const lines = befores.map(([earlier, later]) =>
    level.inverse && rng.chance(0.5)
      ? `${later} ${relation.inv} ${earlier}.`
      : `${earlier} ${relation.cmp} ${later}.`,
  );
  for (const name of notMost) lines.push(`${name} is not ${relation.most}.`);
  for (const name of notLeast) lines.push(`${name} is not ${relation.least}.`);
  const premiseText = rng.shuffle(lines).join(' ');
  const direct = new Set(befores.map(([earlier, later]) => edgeKey(earlier, later)));
  const banned = premiseBans(relation, befores);

  const models = modelsOf(people, befores, notMost, notLeast);
  if (models.length !== 1) throw new Error('Ordering premises did not fix a single order.');
  const solved = models[0];
  if (!solved) throw new Error('Ordering model missing.');

  let prompt = 'Answer the question.';
  let questionText = '';
  let raw: OrderOption[] = [];
  let explanation = '';
  const listed = solved.join(', ');

  if (level.ask === 'who') {
    const answer = solved[level.index];
    if (!answer) throw new Error('Ordering rank is out of range.');
    questionText = `Who is ${rankPhrase(relation, level.index, solved.length)}?`;
    const others = [solved[level.index - 1], solved[level.index + 1], solved[0], ...solved].filter(
      (name): name is string => Boolean(name) && name !== answer,
    );
    const uniqueOthers = [...new Set(others)];
    const hedges =
      solved.length < 4
        ? [`Either ${uniqueOthers[0]} or ${uniqueOthers[1]}`, 'It cannot be determined']
        : ['It cannot be determined'];
    const nameDistractors = uniqueOthers.slice(0, 4 - hedges.length);
    raw = [
      { text: answer, kind: 'person' },
      ...nameDistractors.map((text) => ({ text, kind: 'person' as const })),
      ...hedges.map((text) => ({ text, kind: 'undetermined' as const })),
    ];
    explanation = `From ${relation.most.replace('the ', '')} to ${relation.least.replace('the ', '')} the only order is ${listed}. That places ${answer} at the rank asked for.`;
  } else {
    const comparisons = comparisonChoices(relation, solved, level.minGap, direct, banned);
    const truths = comparisons.filter((choice) => choice.holds).sort((left, right) => right.gap - left.gap);
    const falsehoods = comparisons.filter((choice) => !choice.holds).sort((left, right) => right.gap - left.gap);
    const keyPool = level.ask === 'must' ? truths : falsehoods;
    const foilPool = level.ask === 'must' ? falsehoods : truths;
    const key = keyPool[0];
    const foils = foilPool.slice(0, 4);
    if (!key || foils.length < 4) throw new Error('Ordering comparison needs five non-adjacent pairs.');
    prompt = level.ask === 'must' ? 'Which statement must be true?' : 'Which statement cannot be true?';
    questionText = prompt;
    raw = [key, ...foils].map((choice) => ({ text: choice.text, kind: 'compare' as const, pair: choice.pair }));
    explanation =
      level.ask === 'must'
        ? `The only order is ${listed}, and each premise links neighbours. ${key.text.replace(/\.$/, '')} takes ${key.gap} of those steps; the other claims reverse a chain.`
        : `The only order is ${listed}, and each premise links neighbours. ${key.text.replace(/\.$/, '')} reverses ${key.gap} of those steps, while the other claims follow the order.`;
  }

  if (raw.length !== 5) throw new Error(`Ordering item produced ${raw.length} options.`);
  const shuffled = rng.shuffle(raw);
  const answer = shuffled.findIndex((option) => option.text === raw[0]?.text);
  const stimulus = `${premiseText} ${questionText}`;
  const item = choiceItem({
    id: `vb-gen-order-${signature(`${relation.id}|${premiseText}|${questionText}|${raw[0]?.text ?? ''}`)}`,
    family: FAMILIES.deduction,
    b: level.b,
    a: 1.4,
    prompt,
    stimulus,
    options: shuffled.map((option) => option.text),
    answer,
    explanation,
  });
  return {
    item,
    people,
    befores,
    notMost,
    notLeast,
    question: level.ask,
    askIndex: level.ask === 'who' ? level.index : undefined,
    options: shuffled,
  };
}

export function sampleOrder(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): OrderBuilt {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const built = finishOrder(rng, closest(ORDER_LEVELS, targetB));
    if (!usedIds.has(built.item.id)) return built;
  }
  throw new Error('No unused verbal items remain.');
}

function renderStmt(names: readonly string[], stmt: LogicStmt): string {
  const subject = names[stmt.s];
  const predicate = names[stmt.p];
  if (!subject || !predicate) throw new Error('Syllogism category index is out of range.');
  if (stmt.q === 'all') return `All ${subject} are ${predicate}.`;
  if (stmt.q === 'some') return `Some ${subject} are ${predicate}.`;
  if (stmt.q === 'no') return `No ${subject} are ${predicate}.`;
  return `Some ${subject} are not ${predicate}.`;
}

const SYL_PROMPT: Record<SylAsk, string> = {
  must: 'Which statement must be true?',
  could: 'Which statement could be true?',
  cannot: 'Which statement cannot be true?',
};

function finishSyllogism(rng: Rng, form: SylForm): SyllogismBuilt {
  const names = rng.shuffle(CATEGORY_NOUNS).slice(0, form.k);
  const statements = [form.key, ...form.distractors];
  const rendered = statements.map((stmt) => ({ stmt, text: renderStmt(names, stmt) }));
  const shuffled = rng.shuffle(rendered);
  const answer = shuffled.findIndex((option) => option.stmt === form.key);
  const stimulus = form.premises.map((stmt) => renderStmt(names, stmt)).join(' ');
  const keyText = renderStmt(names, form.key);
  const explanation =
    form.ask === 'could'
      ? `"${keyText}" is possible under the premises and is not required by them. Each other statement contradicts the premises.`
      : form.ask === 'cannot'
        ? `"${keyText}" contradicts the premises in every arrangement that fits them. Each other statement holds in at least one such arrangement.`
        : `"${keyText}" holds in every arrangement that fits the premises. Each other statement fails in at least one.`;
  const item = choiceItem({
    id: `vb-gen-syl-${signature(`${form.id}|${names.join(',')}|${stimulus}`)}`,
    family: FAMILIES.deduction,
    b: form.b,
    a: 1.4,
    prompt: SYL_PROMPT[form.ask],
    stimulus,
    options: shuffled.map((option) => option.text),
    answer,
    explanation,
  });
  return {
    item,
    k: form.k,
    names,
    premises: form.premises,
    options: shuffled.map((option) => option.stmt),
    ask: form.ask,
  };
}

export function sampleSyllogism(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): SyllogismBuilt {
  const form = closest(SYLLOGISM_FORMS, targetB);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const built = finishSyllogism(rng, form);
    if (!usedIds.has(built.item.id)) return built;
  }
  throw new Error('No unused verbal items remain.');
}

function analogyCompatible(left: Pair, right: Pair): boolean {
  const banned = new Set([left.x, left.y, right.x, right.y]);
  const distractors = [right.reverse, ...right.surfaces];
  return new Set(distractors).size === 4 && distractors.every((word) => !banned.has(word));
}

function finishAnalogy(rng: Rng, relation: Relation): AnalogyBuilt {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [left, right] = rng.shuffle(relation.pairs).slice(0, 2);
    if (!left || !right || !analogyCompatible(left, right)) continue;
    const correct = right.y;
    const raw = [correct, right.reverse, ...right.surfaces];
    const shuffled = rng.shuffle(raw);
    const stimulus = `${left.x} : ${left.y} :: ${right.x} : ?`;
    const item = choiceItem({
      id: `vb-gen-an-${signature(`${relation.id}|${stimulus}`)}`,
      family: FAMILIES.analogy,
      b: relation.b,
      a: 1.4,
      prompt: 'Complete the analogy.',
      stimulus,
      options: shuffled,
      answer: shuffled.indexOf(correct),
      explanation: `${left.y} ${relation.blurb} ${left.x}, so the word that ${relation.blurb} ${right.x} is ${correct}. The other choices copy a surface link or run the relation backwards.`,
    });
    return { item, relationId: relation.id, a: left.x, b: left.y, c: right.x, d: correct };
  }
  throw new Error(`No compatible pairs in relation ${relation.id}.`);
}

export function sampleAnalogy(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): AnalogyBuilt {
  const relation = closest(RELATIONS, targetB);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const built = finishAnalogy(rng, relation);
    if (!usedIds.has(built.item.id)) return built;
  }
  throw new Error('No unused verbal items remain.');
}

export function relationById(id: string): Relation | undefined {
  return RELATIONS.find((relation) => relation.id === id);
}

export function tryProcedural(
  rng: Rng,
  targetB: number,
  usedIds: ReadonlySet<string>,
): ChoiceItem | null {
  if (!proceduralNear(targetB)) return null;
  const family = rng.pick(['order', 'syllogism', 'analogy'] as const);
  if (family === 'order') return sampleOrder(rng, targetB, usedIds).item;
  if (family === 'syllogism') return sampleSyllogism(rng, targetB, usedIds).item;
  return sampleAnalogy(rng, targetB, usedIds).item;
}

function bitCount(present: Uint8Array, subject: number, predicate: number): { subj: number; both: number; subjNot: number } {
  let subj = 0;
  let both = 0;
  let subjNot = 0;
  for (let mask = 0; mask < present.length; mask += 1) {
    if (!present[mask]) continue;
    const inSubject = (mask & (1 << subject)) !== 0;
    const inPredicate = (mask & (1 << predicate)) !== 0;
    if (!inSubject) continue;
    subj += 1;
    if (inPredicate) both += 1;
    else subjNot += 1;
  }
  return { subj, both, subjNot };
}

/** Existential import on "all": the subject class is non-empty. "No" does not require it. */
export function statementHolds(present: Uint8Array, stmt: LogicStmt): boolean {
  const { subj, both, subjNot } = bitCount(present, stmt.s, stmt.p);
  if (stmt.q === 'all') return subj > 0 && subjNot === 0;
  if (stmt.q === 'no') return both === 0;
  if (stmt.q === 'some') return both > 0;
  return subjNot > 0;
}

function sameStmt(left: LogicStmt, right: LogicStmt): boolean {
  return left.q === right.q && left.s === right.s && left.p === right.p;
}

function isIllicitConversion(stmt: LogicStmt, source: LogicStmt): boolean {
  return (
    stmt.q === source.q &&
    stmt.s === source.p &&
    stmt.p === source.s &&
    (stmt.q === 'all' || stmt.q === 'some-not')
  );
}

function isQuantifierShift(stmt: LogicStmt, source: LogicStmt): boolean {
  if (stmt.s !== source.s || stmt.p !== source.p || stmt.q === source.q) return false;
  if (source.q === 'some' && (stmt.q === 'all' || stmt.q === 'no')) return true;
  if (source.q === 'all' && (stmt.q === 'no' || stmt.q === 'some-not')) return true;
  if (source.q === 'some-not' && stmt.q === 'no') return true;
  if (source.q === 'no' && stmt.q === 'all') return true;
  return false;
}

function auditSyllogisms(): void {
  for (const form of SYLLOGISM_FORMS) {
    if (form.premises.some((premise) => sameStmt(premise, form.key))) {
      throw new Error(`Syllogism ${form.id} key restates a premise.`);
    }
    if (form.distractors.some((distractor) => form.premises.some((premise) => sameStmt(premise, distractor)))) {
      throw new Error(`Syllogism ${form.id} distractor restates a premise.`);
    }
    if (
      form.b >= 1 &&
      !form.distractors.some((distractor) =>
        [form.key, ...form.premises].some((source) => isIllicitConversion(distractor, source) || isQuantifierShift(distractor, source)),
      )
    ) {
      throw new Error(`Syllogism ${form.id} has no illicit conversion or quantifier shift.`);
    }
    const typeCount = 1 << form.k;
    const total = 1 << typeCount;
    let models = 0;
    let keyHits = 0;
    const distractorHits = [0, 0, 0, 0];
    for (let bits = 0; bits < total; bits += 1) {
      const present = new Uint8Array(typeCount);
      for (let type = 0; type < typeCount; type += 1) if ((bits & (1 << type)) !== 0) present[type] = 1;
      if (!form.premises.every((premise) => statementHolds(present, premise))) continue;
      models += 1;
      if (statementHolds(present, form.key)) keyHits += 1;
      form.distractors.forEach((distractor, index) => {
        if (statementHolds(present, distractor)) distractorHits[index] = (distractorHits[index] ?? 0) + 1;
      });
    }
    if (models === 0) throw new Error(`Syllogism ${form.id} has no models.`);
    if (form.ask === 'must' && keyHits !== models) throw new Error(`Syllogism ${form.id} key is not necessary.`);
    if (form.ask === 'could' && (keyHits === 0 || keyHits === models)) {
      throw new Error(`Syllogism ${form.id} key is not contingent.`);
    }
    if (form.ask === 'cannot' && keyHits !== 0) throw new Error(`Syllogism ${form.id} key can be true.`);
    distractorHits.forEach((hits, index) => {
      if (form.ask === 'could' && hits !== 0) throw new Error(`Syllogism ${form.id} distractor ${index} can be true.`);
      if (form.ask === 'must' && hits === models) throw new Error(`Syllogism ${form.id} distractor ${index} must be true.`);
      if (form.ask === 'cannot' && hits === 0) throw new Error(`Syllogism ${form.id} distractor ${index} cannot be true.`);
    });
  }
}

function auditRelations(): void {
  if (RELATIONS.length < 12) throw new Error('Need at least 12 analogy relations.');
  for (const relation of RELATIONS) {
    if (relation.pairs.length < 8) throw new Error(`Relation ${relation.id} needs 8 pairs.`);
    const seen = new Set<string>();
    for (const entry of relation.pairs) {
      if (seen.has(entry.x)) throw new Error(`Duplicate pair stem ${entry.x} in ${relation.id}.`);
      seen.add(entry.x);
      if (seen.has(`y:${entry.y}`)) throw new Error(`Duplicate pair answer ${entry.y} in ${relation.id}.`);
      seen.add(`y:${entry.y}`);
      const words = [entry.x, entry.y, entry.reverse, ...entry.surfaces];
      if (new Set(words).size !== words.length) {
        throw new Error(`Pair ${entry.x}:${entry.y} in ${relation.id} repeats a word.`);
      }
    }
  }
}

auditSyllogisms();
auditRelations();
