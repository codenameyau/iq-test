import type { ChoiceItem, Item, RecallItem } from '../core/types';
import { escapeHtml, letter, renderVisual, svgScaleStyle } from './dom';

export interface ItemViewOptions {
  onSubmit(response: number | string): void;
  submitLabel?: string;
  /** Scale the question to fit the available viewport so the user never has to scroll. */
  fit?: boolean;
}

/** Renders an item into `container`. Returns a cleanup function that removes listeners and timers. */
export function mountItem(container: HTMLElement, item: Item, options: ItemViewOptions): () => void {
  return item.kind === 'choice'
    ? mountChoice(container, item, options)
    : mountRecall(container, item, options);
}

function mountChoice(container: HTMLElement, item: ChoiceItem, { onSubmit, submitLabel = 'Next', fit = false }: ItemViewOptions): () => void {
  const textOptions = item.options.every((o) => o.type === 'text');
  const longText = textOptions && item.options.some((o) => o.type === 'text' && o.text.length > 14);
  const layout = longText ? 'list' : `grid-${item.options.length <= 4 ? item.options.length : item.options.length === 5 ? 5 : item.options.length === 6 ? 3 : 4}`;
  const isText = item.stimulus.type === 'text';

  const stimulusHtml = renderVisual(item.stimulus, isText ? 'stimulus stimulus--text' : 'stimulus');
  const optionsHtml = item.options
    .map(
      (opt, i) => `
            <button type="button" class="option ${opt.type === 'text' ? 'option--text' : 'option--svg'}" role="radio" aria-checked="false" data-index="${i}" aria-label="Option ${letter(i)}${opt.type === 'text' ? `: ${escapeHtml(opt.text)}` : ''}">
              <span class="option-key" aria-hidden="true">${letter(i)}</span>
              ${opt.type === 'text' ? `<span class="option-text">${escapeHtml(opt.text)}</span>` : `<span class="option-figure" style="${svgScaleStyle(opt.svg)}">${opt.svg}</span>`}
            </button>`,
    )
    .join('');
  const actionsHtml = `
      <div class="item-actions">
        <span class="hint">Choose with <kbd>${letter(0)}</kbd>–<kbd>${letter(item.options.length - 1)}</kbd> or <kbd>1</kbd>–<kbd>${item.options.length}</kbd>, confirm with <kbd>Enter</kbd></span>
        <button type="button" class="btn btn--primary" id="submit" disabled>${escapeHtml(submitLabel)}</button>
      </div>`;

  if (fit) {
    container.innerHTML = `
    <div class="item item--choice item--fit">
      <p class="item-prompt" id="item-prompt">${escapeHtml(item.prompt)}</p>
      <div class="item-viewport">
        <div class="item-fit item-fit--row">
          <div class="stimulus-col">${stimulusHtml}</div>
          <div class="options options--fit" role="radiogroup" aria-labelledby="item-prompt">${optionsHtml}</div>
        </div>
      </div>
      ${actionsHtml}
    </div>`;
  } else {
    container.innerHTML = `
    <div class="item item--choice">
      <p class="item-prompt" id="item-prompt">${escapeHtml(item.prompt)}</p>
      ${stimulusHtml}
      <div class="options options--${layout}" role="radiogroup" aria-labelledby="item-prompt">${optionsHtml}</div>
      ${actionsHtml}
    </div>`;
  }

  const fitCleanup = fit ? fitChoiceToViewport(container, item, textOptions, longText) : null;

  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.option'));
  const submit = container.querySelector<HTMLButtonElement>('#submit')!;
  let selected: number | null = null;
  let submitted = false;

  const select = (index: number) => {
    selected = index;
    buttons.forEach((b, i) => {
      b.classList.toggle('is-selected', i === index);
      b.setAttribute('aria-checked', String(i === index));
    });
    submit.disabled = false;
  };
  const confirm = () => {
    if (selected === null || submitted) return;
    submitted = true;
    onSubmit(selected);
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    b.addEventListener('dblclick', () => {
      select(i);
      confirm();
    });
  });
  submit.addEventListener('click', confirm);

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toUpperCase();
    const byLetter = key.length === 1 ? key.charCodeAt(0) - 65 : -1;
    const byDigit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const index = byLetter >= 0 && byLetter < buttons.length ? byLetter : byDigit;
    if (index >= 0 && index < buttons.length) {
      e.preventDefault();
      select(index);
      buttons[index].focus();
    } else if (e.key === 'Enter' && selected !== null) {
      e.preventDefault();
      confirm();
    }
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    fitCleanup?.();
  };
}

/**
 * Scales the whole question block (stimulus + options together, so their relative sizes are
 * preserved) to fit the available height and width, trying a few layouts and keeping the one
 * that stays largest while still fitting. Keeps every question above the fold without scrolling.
 */
function fitChoiceToViewport(
  container: HTMLElement,
  item: ChoiceItem,
  textOptions: boolean,
  longText: boolean,
): () => void {
  const viewport = container.querySelector<HTMLElement>('.item-viewport')!;
  const block = container.querySelector<HTMLElement>('.item-fit')!;
  const options = container.querySelector<HTMLElement>('.options')!;
  const n = item.options.length;

  const colCandidates = textOptions
    ? longText
      ? [1]
      : [n, Math.ceil(n / 2), 2]
    : n <= 4
      ? [2, n]
      : n === 5
        ? [5, 3, 2]
        : n === 6
          ? [3, 2]
          : [4, 2];
  const cols = [...new Set(colCandidates.filter((c) => c >= 1))];
  const orientations: Array<'row' | 'column'> = ['row', 'column'];
  const maxScale = textOptions ? 1.05 : 1.4;

  const apply = (orient: 'row' | 'column', col: number) => {
    block.classList.toggle('item-fit--row', orient === 'row');
    block.classList.toggle('item-fit--col', orient === 'column');
    options.style.setProperty('--opt-cols', String(col));
  };

  let scheduled = 0;
  const run = () => {
    scheduled = 0;
    block.style.transform = 'none';
    const availW = viewport.clientWidth;
    const availH = viewport.clientHeight;
    if (availW === 0 || availH === 0) return;
    let best: { orient: 'row' | 'column'; col: number; scale: number } | null = null;
    for (const orient of orientations) {
      // A row layout next to a text stimulus only helps on wider viewports.
      if (orient === 'row' && availW < 640) continue;
      for (const col of cols) {
        apply(orient, col);
        const natW = block.offsetWidth;
        const natH = block.offsetHeight;
        if (natW === 0 || natH === 0) continue;
        const scale = Math.min(availW / natW, availH / natH, maxScale);
        if (!best || scale > best.scale) best = { orient, col, scale };
      }
    }
    if (!best) best = { orient: 'column', col: cols[0], scale: 1 };
    apply(best.orient, best.col);
    block.style.transform = `scale(${best.scale})`;
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(run);
  };

  run();
  // Re-fit once fonts/SVGs have settled, and whenever the viewport resizes.
  const raf = requestAnimationFrame(run);
  const ro = new ResizeObserver(schedule);
  ro.observe(viewport);
  return () => {
    cancelAnimationFrame(raf);
    if (scheduled) cancelAnimationFrame(scheduled);
    ro.disconnect();
  };
}

const READY_MS = 1500;
const GAP_MS = 250;

function mountRecall(container: HTMLElement, item: RecallItem, { onSubmit, submitLabel = 'Next', fit = false }: ItemViewOptions): () => void {
  container.innerHTML = `
    <div class="item item--recall${fit ? ' item--fit' : ''}">
      <p class="item-prompt">${escapeHtml(item.prompt)}</p>
      <div class="recall-stage" aria-live="assertive" aria-atomic="true">
        <span class="recall-status">Get ready…</span>
      </div>
      <p class="recall-meta muted">${item.sequence.length} items · shown one at a time</p>
      <form class="recall-form" hidden>
        <label for="recall-input" class="sr-only">Your answer</label>
        <input id="recall-input" class="input input--recall" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="${item.sequence.some((t) => /[A-Z]/.test(t)) ? 'text' : 'numeric'}" placeholder="Type your answer" />
        <button type="submit" class="btn btn--primary">${escapeHtml(submitLabel)}</button>
      </form>
    </div>`;

  const stage = container.querySelector<HTMLElement>('.recall-stage')!;
  const form = container.querySelector<HTMLFormElement>('.recall-form')!;
  const input = container.querySelector<HTMLInputElement>('#recall-input')!;
  const meta = container.querySelector<HTMLElement>('.recall-meta')!;
  const timers: number[] = [];
  let submitted = false;

  let at = READY_MS;
  item.sequence.forEach((token, i) => {
    timers.push(window.setTimeout(() => {
      stage.innerHTML = `<span class="recall-token" data-n="${i + 1}">${escapeHtml(token)}</span>`;
    }, at));
    at += item.tokenMs - GAP_MS;
    timers.push(window.setTimeout(() => (stage.innerHTML = ''), at));
    at += GAP_MS;
  });
  timers.push(window.setTimeout(() => {
    stage.innerHTML = '<span class="recall-status">Your answer</span>';
    meta.textContent = 'Spaces and commas are ignored.';
    form.hidden = false;
    input.focus();
  }, at));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submitted || !input.value.trim()) return;
    submitted = true;
    onSubmit(input.value);
  });

  return () => timers.forEach((t) => clearTimeout(t));
}
