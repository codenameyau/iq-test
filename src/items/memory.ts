import type { ItemGenerator, RecallItem } from '../core/types';
import type { Rng } from '../core/rng';

type Task = 'backward' | 'sequencing' | 'letterNumber';

interface TaskSpec {
  prompt: string;
  /** Difficulty by sequence length (theta scale). */
  b: Record<number, number>;
  answer(sequence: string[]): string;
  describe(sequence: string[], answer: string): string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
// Excludes letters easily confused with digits or each other (I, O, Q, S, Z).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'T', 'U', 'V', 'W', 'X', 'Y'];
const TOKEN_MS = 1000;
const DISCRIMINATION = 1.3;

// Calibrated so an average adult has ~50% success at a backward span of 6.
const TASKS: Record<Task, TaskSpec> = {
  backward: {
    prompt: 'Type the digits in reverse order.',
    b: { 3: -2.6, 4: -1.7, 5: -0.8, 6: 0.1, 7: 1.0, 8: 1.9, 9: 2.7 },
    answer: (seq) => seq.slice().reverse().join(''),
    describe: (seq, answer) => `The digits ${seq.join(' ')} reversed are ${spaced(answer)}.`,
  },
  sequencing: {
    prompt: 'Type the digits in order from smallest to largest.',
    b: { 3: -2.8, 4: -1.9, 5: -1.0, 6: -0.1, 7: 0.8, 8: 1.7, 9: 2.5 },
    answer: (seq) => seq.slice().sort().join(''),
    describe: (seq, answer) => `Sorted from smallest to largest, ${seq.join(' ')} becomes ${spaced(answer)}.`,
  },
  letterNumber: {
    prompt: 'Type the numbers in ascending order, then the letters in alphabetical order.',
    b: { 3: -2.1, 4: -1.2, 5: -0.4, 6: 0.4, 7: 1.2, 8: 2.0, 9: 2.7 },
    answer: (seq) => {
      const nums = seq.filter((t) => /\d/.test(t)).sort();
      const letters = seq.filter((t) => /[A-Z]/.test(t)).sort();
      return nums.join('') + letters.join('');
    },
    describe: (seq, answer) =>
      `From ${seq.join(' ')}, the numbers in order come first, then the letters alphabetically: ${spaced(answer)}.`,
  },
};

function spaced(answer: string): string {
  return answer.split('').join(' ');
}

function buildSequence(rng: Rng, task: Task, length: number): string[] {
  if (task === 'letterNumber') {
    const numberCount = Math.ceil(length / 2);
    const tokens = [
      ...rng.shuffle(DIGITS).slice(0, numberCount),
      ...rng.shuffle(LETTERS).slice(0, length - numberCount),
    ];
    return rng.shuffle(tokens);
  }
  if (task === 'sequencing') {
    // Digits may repeat, but never back-to-back, so each token is visibly distinct.
    const seq: string[] = [];
    while (seq.length < length) {
      const d = rng.pick(DIGITS);
      if (d !== seq[seq.length - 1]) seq.push(d);
    }
    return seq;
  }
  return rng.shuffle(DIGITS).slice(0, length);
}

function makeItem(task: Task, sequence: string[]): RecallItem {
  const spec = TASKS[task];
  const answer = spec.answer(sequence);
  return {
    kind: 'recall',
    id: `wm-${task}-${sequence.join('')}`,
    domain: 'memory',
    family: `wm-${task}`,
    a: DISCRIMINATION,
    b: spec.b[sequence.length],
    prompt: spec.prompt,
    sequence,
    answer,
    tokenMs: TOKEN_MS,
    explanation: spec.describe(sequence, answer),
  };
}

/** Accepts spaces, commas and lowercase in typed answers. */
export function normalizeRecall(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export const memoryGenerator: ItemGenerator = {
  domain: 'memory',
  generate(rng, targetB, usedIds) {
    const task = rng.pick(Object.keys(TASKS) as Task[]);
    const lengths = Object.entries(TASKS[task].b).map(([len, b]) => ({ len: Number(len), b }));
    const { len } = lengths.reduce((best, cur) =>
      Math.abs(cur.b - targetB) < Math.abs(best.b - targetB) ? cur : best,
    );
    for (let attempt = 0; attempt < 50; attempt++) {
      const item = makeItem(task, buildSequence(rng, task, len));
      if (!usedIds.has(item.id)) return item;
    }
    throw new Error(`Could not generate an unused ${task} item of length ${len}`);
  },
  practice() {
    return { ...makeItem('backward', ['4', '9', '2']), b: -3 };
  },
};
