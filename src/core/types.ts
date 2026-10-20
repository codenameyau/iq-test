import type { Rng } from './rng';

export type Domain = 'matrices' | 'series' | 'verbal' | 'spatial' | 'memory';

/** Something renderable. SVG strings are generated internally (never from user input). */
export type Visual =
  | { type: 'text'; text: string }
  | { type: 'svg'; svg: string };

interface ItemBase {
  /** Unique and deterministic for the generated content; used to avoid repeats. */
  id: string;
  domain: Domain;
  /** IRT difficulty on the theta scale (mean 0, SD 1 in the adult population). */
  b: number;
  /** IRT discrimination. Typical range 0.8 – 2.2. */
  a: number;
  /** One-line instruction shown above the stimulus. */
  prompt: string;
  /** Why the correct answer is correct, shown in the results review. */
  explanation: string;
  /** Question type key from QUESTION_TYPES in config.ts, used for the per-type breakdown. */
  family?: string;
}

export interface ChoiceItem extends ItemBase {
  kind: 'choice';
  stimulus: Visual;
  options: Visual[];
  /** Index into options. Exactly one option is correct. */
  answer: number;
}

export interface RecallItem extends ItemBase {
  kind: 'recall';
  /** Tokens presented one at a time. */
  sequence: string[];
  /** Exact expected response, tokens concatenated without separators. */
  answer: string;
  /** Milliseconds each token is shown. */
  tokenMs: number;
}

export type Item = ChoiceItem | RecallItem;

export interface ItemGenerator {
  domain: Domain;
  /**
   * Returns an item whose difficulty `b` is as close as practical to `targetB`.
   * Must not return an item whose id is in `usedIds`.
   * Must be deterministic for a given rng state, targetB and usedIds.
   */
  generate(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): Item;
  /** A fixed, easy, untimed example shown before the section. */
  practice(): Item;
}
