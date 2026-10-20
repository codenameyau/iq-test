import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { RecallItem } from '../core/types';
import { memoryGenerator, normalizeRecall } from './memory';

describe('memory generator', () => {
  it('is deterministic for a seed', () => {
    const a = memoryGenerator.generate(createRng(7), 0, new Set());
    const b = memoryGenerator.generate(createRng(7), 0, new Set());
    expect(a).toEqual(b);
  });

  it('tracks the target difficulty', () => {
    for (const target of [-2.5, -1, 0, 1, 2.5]) {
      for (let seed = 0; seed < 20; seed++) {
        const item = memoryGenerator.generate(createRng(seed), target, new Set());
        expect(Math.abs(item.b - target)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('computes answers per task', () => {
    for (let seed = 0; seed < 200; seed++) {
      const item = memoryGenerator.generate(createRng(seed), 0.5, new Set()) as RecallItem;
      const seq = item.sequence;
      if (item.id.startsWith('wm-backward')) expect(item.answer).toBe(seq.slice().reverse().join(''));
      if (item.id.startsWith('wm-sequencing')) expect(item.answer).toBe(seq.slice().sort().join(''));
      if (item.id.startsWith('wm-letterNumber')) expect(item.answer).toMatch(/^\d+[A-Z]+$/);
      expect(seq.every((t, i) => t !== seq[i - 1])).toBe(true);
    }
  });

  it('avoids used ids', () => {
    const used = new Set<string>();
    const rng = createRng(3);
    for (let i = 0; i < 40; i++) {
      const item = memoryGenerator.generate(rng, 0, used);
      expect(used.has(item.id)).toBe(false);
      used.add(item.id);
    }
  });

  it('normalizes typed responses', () => {
    expect(normalizeRecall(' 3, 5 a b ')).toBe('35AB');
  });
});
