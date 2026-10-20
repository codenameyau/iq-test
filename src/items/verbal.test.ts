import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { ChoiceItem, Item, Visual } from '../core/types';
import { verbalBank, verbalGenerator } from './verbal';
import {
  relationById,
  sampleAnalogy,
  sampleOrder,
  sampleSyllogism,
  statementHolds,
  type OrderBuilt,
  type SyllogismBuilt,
} from './verbalProcedural';

const FAMILIES = new Set([
  'vb-analogy',
  'vb-odd-one-out',
  'vb-similarity',
  'vb-vocabulary',
  'vb-deduction',
]);

function asChoice(item: Item): ChoiceItem {
  expect(item.kind).toBe('choice');
  if (item.kind !== 'choice') throw new Error('Expected a choice item.');
  return item;
}

function visualText(visual: Visual): string {
  expect(visual.type).toBe('text');
  if (visual.type !== 'text') throw new Error('Expected text.');
  return visual.text;
}

const TYPE_PREFIX = {
  an: 'vb-an-',
  oo: 'vb-oo-',
  si: 'vb-si-',
  vo: 'vb-vo-',
  de: 'vb-de-',
} as const;

function wholeWords(text: string): string[] {
  return text.toUpperCase().match(/[A-Z]+/g) ?? [];
}

function nearestIds(targetB: number, usedIds: ReadonlySet<string>, count = 3): string[] {
  return verbalBank
    .filter((item) => !usedIds.has(item.id))
    .slice()
    .sort(
      (left, right) =>
        Math.abs(left.b - targetB) - Math.abs(right.b - targetB) || left.id.localeCompare(right.id),
    )
    .slice(0, count)
    .map((item) => item.id);
}

describe('verbal bank', () => {
  it('has at least 120 items, balanced across the five types', () => {
    expect(verbalBank.length).toBeGreaterThanOrEqual(120);
    for (const prefix of Object.values(TYPE_PREFIX)) {
      const count = verbalBank.filter((item) => item.id.startsWith(prefix)).length;
      expect(count, prefix).toBeGreaterThanOrEqual(24);
    }
  });

  it('gives every item a unique id, five distinct options, and a keyed first option', () => {
    const ids = new Set<string>();
    for (const item of verbalBank) {
      expect(ids.has(item.id), item.id).toBe(false);
      ids.add(item.id);
      expect(item.id).toMatch(/^vb-(an|oo|si|vo|de)-\d{3}$/);
      expect(item.options).toHaveLength(5);
      expect(new Set(item.options).size).toBe(5);
      for (const option of item.options) expect(option.trim().length).toBeGreaterThan(0);
      expect(item.stimulus.trim().length).toBeGreaterThan(0);
      expect(item.prompt.trim().length).toBeGreaterThan(0);
      expect(item.explanation.trim().length).toBeGreaterThan(0);
      expect(item.a).toBeGreaterThanOrEqual(1);
      expect(item.a).toBeLessThanOrEqual(1.6);
      expect(item.b).toBeGreaterThanOrEqual(-2.5);
      expect(item.b).toBeLessThanOrEqual(2.7);
      expect(FAMILIES.has(item.family), item.id).toBe(true);
    }
  });

  it('covers every 0.5 difficulty band from -2.5 through 2.5, and above 2.5', () => {
    for (let step = 0; step < 11; step += 1) {
      const lo = -2.5 + step * 0.5;
      const hi = lo + 0.5;
      const count = verbalBank.filter((item) => item.b >= lo && item.b < hi).length;
      expect(count, `[${lo}, ${hi})`).toBeGreaterThanOrEqual(8);
    }
  });

  it('does not leak a stem word into an analogy or vocabulary option', () => {
    for (const item of verbalBank) {
      if (item.id.startsWith(TYPE_PREFIX.an)) {
        expect(item.stimulus).toMatch(/^[A-Z]+ : [A-Z]+ :: [A-Z]+ : \?$/);
        expect(item.prompt).toBe('Complete the analogy.');
        const banned = new Set(wholeWords(item.stimulus));
        for (const option of item.options) {
          for (const word of wholeWords(option)) {
            expect(banned.has(word), `${item.id} option "${option}" contains ${word}`).toBe(false);
          }
        }
      }
      if (item.id.startsWith(TYPE_PREFIX.vo)) {
        const match = item.stimulus.match(/^Which word is closest in meaning to ([A-Z]{3,})\?$/);
        expect(match, item.id).not.toBeNull();
        const target = match?.[1] ?? '';
        for (const option of item.options) {
          expect(option.toUpperCase().includes(target), `${item.id} leaks ${target}`).toBe(false);
        }
      }
      if (item.id.startsWith(TYPE_PREFIX.oo)) {
        const listed = item.stimulus.split(', ');
        expect(new Set(listed)).toEqual(new Set(item.options));
        expect(item.prompt).toBe('Which word does not belong with the others?');
      }
      if (item.id.startsWith(TYPE_PREFIX.si)) {
        expect(item.stimulus.startsWith('In what way are ')).toBe(true);
        expect(item.prompt).toBe('Choose the best answer.');
      }
    }
  });
});

describe('verbalGenerator', () => {
  it('serves a fixed easy analogy as practice', () => {
    const first = asChoice(verbalGenerator.practice());
    const second = asChoice(verbalGenerator.practice());
    expect(verbalGenerator.domain).toBe('verbal');
    expect(first.kind).toBe('choice');
    expect(first.domain).toBe('verbal');
    expect(first.b).toBe(-2.5);
    expect(first.family).toBe('vb-analogy');
    expect(first.stimulus).toEqual({ type: 'text', text: 'HOT : COLD :: UP : ?' });
    expect(first.prompt).toBe('Complete the analogy.');
    expect(first.options.map((option) => visualText(option))).toEqual(['DOWN', 'SKY', 'HIGH', 'WARM', 'LEFT']);
    expect(visualText(first.options[first.answer])).toBe('DOWN');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(verbalBank.some((item) => item.id === first.id)).toBe(false);
    expect(verbalBank.some((item) => item.stimulus.includes('HOT : COLD'))).toBe(false);
  });

  it('is deterministic for the same seed, target and used ids', () => {
    const used = new Set(['vb-an-001', 'vb-vo-010']);
    const first = asChoice(verbalGenerator.generate(createRng(42), 0.4, used));
    const second = asChoice(verbalGenerator.generate(createRng(42), 0.4, used));
    expect(second).toEqual(first);
    expect(first.kind).toBe('choice');
    expect(first.domain).toBe('verbal');
    expect(first.options).toHaveLength(5);
    expect(first.answer).toBeGreaterThanOrEqual(0);
    expect(first.answer).toBeLessThan(5);
  });

  it('draws a bank item from the three unused items nearest the target', () => {
    const targetB = 0.12;
    const pool = new Set(nearestIds(targetB, new Set()));
    expect(pool.size).toBe(3);
    let bankDraws = 0;
    let proceduralDraws = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const item = asChoice(verbalGenerator.generate(createRng(seed), targetB, new Set()));
      expect(FAMILIES.has(item.family ?? ''), item.id).toBe(true);
      if (item.id.startsWith('vb-gen-')) {
        proceduralDraws += 1;
        expect(pool.has(item.id)).toBe(false);
      } else {
        bankDraws += 1;
        expect(pool.has(item.id), item.id).toBe(true);
      }
    }
    expect(bankDraws).toBeGreaterThan(0);
    expect(proceduralDraws).toBeGreaterThan(0);

    const blocked = new Set(nearestIds(targetB, new Set(), 2));
    const retry = asChoice(verbalGenerator.generate(createRng(3), targetB, blocked));
    for (const id of blocked) expect(retry.id).not.toBe(id);
    if (!retry.id.startsWith('vb-gen-')) expect(nearestIds(targetB, blocked)).toContain(retry.id);
  });

  it('respects usedIds across 60 sequential draws', () => {
    const rng = createRng(7);
    const used = new Set<string>(['vb-an-000']);
    const seen: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const targetB = -2.4 + (i % 15) * 0.35;
      const item = asChoice(verbalGenerator.generate(rng, targetB, used));
      expect(used.has(item.id)).toBe(false);
      used.add(item.id);
      seen.push(item.id);
    }
    expect(new Set(seen).size).toBe(60);
  });

  it('respects usedIds across 80 draws at one target', () => {
    const rng = createRng(11);
    const used = new Set<string>();
    for (let i = 0; i < 80; i += 1) {
      const item = asChoice(verbalGenerator.generate(rng, 0.8, used));
      expect(used.has(item.id), item.id).toBe(false);
      expect(item.options).toHaveLength(5);
      expect(new Set(item.options.map((option) => visualText(option))).size).toBe(5);
      used.add(item.id);
    }
    expect(used.size).toBe(80);
  });

  it('shuffles options without losing the keyed text', () => {
    const source = verbalBank.find((item) => item.id === 'vb-de-016');
    expect(source).toBeDefined();
    if (!source) return;
    const used = new Set(verbalBank.filter((item) => item.id !== source.id).map((item) => item.id));
    const positions = new Set<number>();
    const before = JSON.stringify(verbalBank);
    let bankDraws = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const item = asChoice(verbalGenerator.generate(createRng(seed), source.b, used));
      expect(used.has(item.id)).toBe(false);
      if (item.id !== source.id) {
        expect(item.id.startsWith('vb-gen-')).toBe(true);
        continue;
      }
      bankDraws += 1;
      expect(visualText(item.options[item.answer])).toBe(source.options[0]);
      expect(item.options.map((option) => visualText(option)).sort()).toEqual([...source.options].sort());
      positions.add(item.answer);
    }
    expect(bankDraws).toBeGreaterThan(0);
    expect(positions.size).toBeGreaterThan(1);
    expect(JSON.stringify(verbalBank)).toBe(before);
  });

  it('fails clearly when every id is already used', () => {
    const used = { has: () => true } as unknown as ReadonlySet<string>;
    expect(() => verbalGenerator.generate(createRng(1), 0, used)).toThrow(
      'No unused verbal items remain.',
    );
  });
});

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

function ordersMatching(built: OrderBuilt): string[][] {
  return permutations(built.people).filter((order) => {
    const at = new Map(order.map((name, index) => [name, index]));
    for (const [earlier, later] of built.befores) {
      if ((at.get(earlier) ?? 0) >= (at.get(later) ?? 0)) return false;
    }
    for (const name of built.notMost) if (at.get(name) === 0) return false;
    for (const name of built.notLeast) if (at.get(name) === order.length - 1) return false;
    return true;
  });
}

const ORDER_VERBS = [
  ['is older than', 'is younger than'],
  ['is taller than', 'is shorter than'],
  ['finished before', 'finished after'],
  ['sits to the left of', 'sits to the right of'],
] as const;

function bannedOrderText(stimulus: string): Set<string> {
  const banned = new Set<string>();
  for (const raw of stimulus.match(/[^.?]+\./g) ?? []) {
    const sentence = raw.trim();
    banned.add(sentence);
    for (const [cmp, inv] of ORDER_VERBS) {
      for (const phrase of [cmp, inv]) {
        const match = sentence.match(new RegExp(`^(.+) ${phrase} (.+)\\.$`));
        if (!match?.[1] || !match[2]) continue;
        for (const verb of [cmp, inv]) {
          banned.add(`${match[1]} ${verb} ${match[2]}.`);
          banned.add(`${match[2]} ${verb} ${match[1]}.`);
        }
      }
    }
  }
  return banned;
}

function pairDistance(befores: readonly (readonly [string, string])[], start: string, goal: string): number {
  const next = new Map<string, string[]>();
  for (const [left, right] of befores) {
    next.set(left, [...(next.get(left) ?? []), right]);
    next.set(right, [...(next.get(right) ?? []), left]);
  }
  const seen = new Set<string>([start]);
  let layer = [start];
  let distance = 0;
  while (layer.length > 0) {
    if (layer.includes(goal)) return distance;
    distance += 1;
    const following: string[] = [];
    for (const node of layer) {
      for (const neighbor of next.get(node) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        following.push(neighbor);
      }
    }
    layer = following;
  }
  return 99;
}

function expectOrderValid(built: OrderBuilt): void {
  const item = asChoice(built.item);
  expect(item.id).toMatch(/^vb-gen-order-[0-9a-z]+$/);
  expect(item.family).toBe('vb-deduction');
  expect(item.options).toHaveLength(5);
  const models = ordersMatching(built);
  expect(models).toHaveLength(1);
  const order = models[0];
  if (!order) throw new Error('Missing order.');
  const at = new Map(order.map((name, index) => [name, index]));
  const keyed = built.options[item.answer];
  expect(keyed).toBeDefined();
  if (!keyed) return;
  const banned = bannedOrderText(visualText(item.stimulus));
  for (const option of built.options) expect(banned.has(option.text), option.text).toBe(false);
  const holds = (pair: readonly [string, string]): boolean => (at.get(pair[0]) ?? 0) < (at.get(pair[1]) ?? 0);
  if (built.question === 'who') {
    expect(keyed.text).toBe(order[built.askIndex ?? -1]);
    for (const option of built.options) {
      if (option === keyed || option.kind !== 'person') continue;
      expect(option.text).not.toBe(keyed.text);
    }
  } else if (built.question === 'must') {
    expect(keyed.kind).toBe('compare');
    if (!keyed.pair) throw new Error('Must-option lacks a pair.');
    expect(holds(keyed.pair)).toBe(true);
    for (const option of built.options) {
      if (option === keyed || !option.pair) continue;
      expect(holds(option.pair)).toBe(false);
    }
  } else {
    expect(keyed.kind).toBe('compare');
    if (!keyed.pair) throw new Error('Cannot-option lacks a pair.');
    expect(holds(keyed.pair)).toBe(false);
    for (const option of built.options) {
      if (option === keyed || !option.pair) continue;
      expect(holds(option.pair)).toBe(true);
    }
  }
  if (built.question !== 'who') {
    for (const option of built.options) {
      expect(option.pair, option.text).toBeDefined();
      if (!option.pair) continue;
      expect(pairDistance(built.befores, option.pair[0], option.pair[1]), option.text).toBeGreaterThanOrEqual(2);
    }
  }
}

function sameStmt(left: { q: string; s: number; p: number }, right: { q: string; s: number; p: number }): boolean {
  return left.q === right.q && left.s === right.s && left.p === right.p;
}

function isIllicitConversion(
  stmt: { q: string; s: number; p: number },
  source: { q: string; s: number; p: number },
): boolean {
  return stmt.q === source.q && stmt.s === source.p && stmt.p === source.s && (stmt.q === 'all' || stmt.q === 'some-not');
}

function isQuantifierShift(
  stmt: { q: string; s: number; p: number },
  source: { q: string; s: number; p: number },
): boolean {
  if (stmt.s !== source.s || stmt.p !== source.p || stmt.q === source.q) return false;
  if (source.q === 'some' && (stmt.q === 'all' || stmt.q === 'no')) return true;
  if (source.q === 'all' && (stmt.q === 'no' || stmt.q === 'some-not')) return true;
  if (source.q === 'some-not' && stmt.q === 'no') return true;
  if (source.q === 'no' && stmt.q === 'all') return true;
  return false;
}

function expectSyllogismValid(built: SyllogismBuilt): void {
  const item = asChoice(built.item);
  expect(item.id).toMatch(/^vb-gen-syl-[0-9a-z]+$/);
  expect(item.family).toBe('vb-deduction');
  expect(item.options).toHaveLength(5);
  const key = built.options[item.answer];
  expect(key).toBeDefined();
  if (!key) return;
  for (const option of built.options) {
    expect(built.premises.some((premise) => sameStmt(premise, option))).toBe(false);
  }
  const typeCount = 1 << built.k;
  const total = 1 << typeCount;
  let models = 0;
  let keyHits = 0;
  const distractorHits = built.options.map(() => 0);
  for (let bits = 0; bits < total; bits += 1) {
    const present = new Uint8Array(typeCount);
    for (let type = 0; type < typeCount; type += 1) {
      if ((bits & (1 << type)) !== 0) present[type] = 1;
    }
    if (!built.premises.every((premise) => statementHolds(present, premise))) continue;
    models += 1;
    built.options.forEach((stmt, index) => {
      if (!statementHolds(present, stmt)) return;
      if (index === item.answer) keyHits += 1;
      else distractorHits[index] = (distractorHits[index] ?? 0) + 1;
    });
  }
  expect(models).toBeGreaterThan(0);
  if (built.ask === 'must') {
    expect(keyHits).toBe(models);
    distractorHits.forEach((hits, index) => {
      if (index !== item.answer) expect(hits).toBeLessThan(models);
    });
  } else if (built.ask === 'could') {
    expect(keyHits).toBeGreaterThan(0);
    expect(keyHits).toBeLessThan(models);
    distractorHits.forEach((hits, index) => {
      if (index !== item.answer) expect(hits).toBe(0);
    });
  } else {
    expect(keyHits).toBe(0);
    distractorHits.forEach((hits, index) => {
      if (index !== item.answer) expect(hits).toBeGreaterThan(0);
    });
  }
  if (item.b >= 1) {
    const sources = [...built.premises, key];
    const distractors = built.options.filter((_, index) => index !== item.answer);
    expect(
      distractors.some((distractor) =>
        sources.some((source) => isIllicitConversion(distractor, source) || isQuantifierShift(distractor, source)),
      ),
    ).toBe(true);
  }
}

describe('procedural verbal items', () => {
  it('rebuilds the same item from the same seed', () => {
    const used = new Set<string>();
    const orderA = sampleOrder(createRng(4), 1.4, used).item;
    const orderB = sampleOrder(createRng(4), 1.4, used).item;
    expect(orderB).toEqual(orderA);
    const sylA = sampleSyllogism(createRng(4), 1.4, used).item;
    const sylB = sampleSyllogism(createRng(4), 1.4, used).item;
    expect(sylB).toEqual(sylA);
    const anA = sampleAnalogy(createRng(4), 1.4, used).item;
    const anB = sampleAnalogy(createRng(4), 1.4, used).item;
    expect(anB).toEqual(anA);
  });

  it('checks 500 ordering items by brute force', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const targetB = -2.5 + (i % 25) * 0.21;
      const built = sampleOrder(createRng(1000 + i), targetB, seen);
      expectOrderValid(built);
      seen.add(built.item.id);
    }
    expect(seen.size).toBe(500);
  }, 60_000);

  it('checks 500 syllogisms against every set model', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const targetB = -2.5 + (i % 25) * 0.21;
      const built = sampleSyllogism(createRng(2000 + i), targetB, seen);
      expectSyllogismValid(built);
      seen.add(built.item.id);
    }
    expect(seen.size).toBe(500);
  }, 60_000);

  it('checks 500 relation analogies', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const targetB = -2.5 + (i % 25) * 0.21;
      const built = sampleAnalogy(createRng(3000 + i), targetB, new Set());
      const item = asChoice(built.item);
      expect(item.id).toMatch(/^vb-gen-an-[0-9a-z]+$/);
      expect(item.family).toBe('vb-analogy');
      expect(item.stimulus).toEqual({ type: 'text', text: `${built.a} : ${built.b} :: ${built.c} : ?` });
      const relation = relationById(built.relationId);
      expect(relation).toBeDefined();
      if (!relation) return;
      expect(relation.pairs.some((entry) => entry.x === built.a && entry.y === built.b)).toBe(true);
      const right = relation.pairs.find((entry) => entry.x === built.c);
      expect(right?.y).toBe(built.d);
      const options = item.options.map((option) => visualText(option));
      expect(options[item.answer]).toBe(built.d);
      expect(new Set(options).size).toBe(5);
      if (!right) return;
      expect(options).toContain(right.reverse);
      for (const surface of right.surfaces) expect(options).toContain(surface);
      const stemWords = new Set([built.a, built.b, built.c]);
      for (const option of options) expect(stemWords.has(option)).toBe(false);
      seen.add(item.id);
    }
    expect(seen.size).toBeGreaterThan(150);
  }, 60_000);

  it('does not repeat an id that was just drawn', () => {
    const used = new Set<string>();
    const first = sampleOrder(createRng(8), 0.2, used);
    used.add(first.item.id);
    const second = sampleOrder(createRng(8), 0.2, used);
    expect(second.item.id).not.toBe(first.item.id);
  });
});
