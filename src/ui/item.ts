import type { ChoiceItem, Item, RecallItem } from '../core/types';
import { escapeHtml, letter, renderVisual, svgScaleStyle } from './dom';

export interface ItemViewOptions {
  onSubmit(response: number | string): void;
  submitLabel?: string;
}

/** Renders an item into `container`. Returns a cleanup function that removes listeners and timers. */
export function mountItem(container: HTMLElement, item: Item, options: ItemViewOptions): () => void {
  return item.kind === 'choice'
    ? mountChoice(container, item, options)
    : mountRecall(container, item, options);
}

function mountChoice(container: HTMLElement, item: ChoiceItem, { onSubmit, submitLabel = 'Next' }: ItemViewOptions): () => void {
  const textOptions = item.options.every((o) => o.type === 'text');
  const longText = textOptions && item.options.some((o) => o.type === 'text' && o.text.length > 14);
  const layout = longText ? 'list' : `grid-${item.options.length <= 4 ? item.options.length : item.options.length === 5 ? 5 : item.options.length === 6 ? 3 : 4}`;
  const isText = item.stimulus.type === 'text';

  container.innerHTML = `
    <div class="item">
      <p class="item-prompt" id="item-prompt">${escapeHtml(item.prompt)}</p>
      ${renderVisual(item.stimulus, isText ? 'stimulus stimulus--text' : 'stimulus')}
      <div class="options options--${layout}" role="radiogroup" aria-labelledby="item-prompt">
        ${item.options
          .map(
            (opt, i) => `
            <button type="button" class="option ${opt.type === 'text' ? 'option--text' : 'option--svg'}" role="radio" aria-checked="false" data-index="${i}" aria-label="Option ${letter(i)}${opt.type === 'text' ? `: ${escapeHtml(opt.text)}` : ''}">
              <span class="option-key" aria-hidden="true">${letter(i)}</span>
              ${opt.type === 'text' ? `<span class="option-text">${escapeHtml(opt.text)}</span>` : `<span class="option-figure" style="${svgScaleStyle(opt.svg)}">${opt.svg}</span>`}
            </button>`,
          )
          .join('')}
      </div>
      <div class="item-actions">
        <span class="hint">Choose with <kbd>${letter(0)}</kbd>–<kbd>${letter(item.options.length - 1)}</kbd> or <kbd>1</kbd>–<kbd>${item.options.length}</kbd>, confirm with <kbd>Enter</kbd></span>
        <button type="button" class="btn btn--primary" id="submit" disabled>${escapeHtml(submitLabel)}</button>
      </div>
    </div>`;

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
  return () => document.removeEventListener('keydown', onKey);
}

const READY_MS = 1500;
const GAP_MS = 250;

function mountRecall(container: HTMLElement, item: RecallItem, { onSubmit, submitLabel = 'Next' }: ItemViewOptions): () => void {
  container.innerHTML = `
    <div class="item item--recall">
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
