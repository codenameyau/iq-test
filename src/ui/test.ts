import { DOMAINS } from '../core/config';
import { currentSection, GENERATORS, isCorrect, type Session } from '../core/engine';
import type { Item } from '../core/types';
import { brandBar } from './home';
import { escapeHtml, formatClock, letter } from './dom';
import { mountItem } from './item';

export function renderSectionIntro(root: HTMLElement, session: Session, onStart: () => void): () => void {
  const section = currentSection(session);
  const info = DOMAINS[section.domain];
  const practice = GENERATORS[section.domain].practice();
  const n = session.sectionIndex + 1;

  root.innerHTML = `
    ${brandBar('', `<h1 class="section-line">Section ${n} of ${session.sections.length} · ${escapeHtml(info.name)}</h1>`)}
    <nav class="preview-nav" aria-label="Practice">
      <div class="preview-nav-inner">
        <span class="preview-label">Practice question</span>
        <button class="btn btn--primary" id="start-section">Start section ${n}</button>
      </div>
    </nav>
    ${overallProgress(session)}
    <main class="page page--test">
      <div id="practice-item" class="test-stage"></div>
      <div id="practice-feedback" hidden></div>
    </main>`;

  const page = root.querySelector<HTMLElement>('.page--test')!;
  const topbar = root.querySelector<HTMLElement>('.topbar')!;
  const topbarInner = root.querySelector<HTMLElement>('.topbar-inner')!;
  const previewNav = root.querySelector<HTMLElement>('.preview-nav')!;
  const progress = root.querySelector<HTMLElement>('.progress')!;
  const sizeStage = () => {
    const fixed = getComputedStyle(previewNav).position === 'fixed';
    const bottom = fixed ? previewNav.offsetHeight : 0;
    const label = previewNav.querySelector('.preview-label')!.getBoundingClientRect();
    const start = previewNav.querySelector('#start-section')!.getBoundingClientRect();
    topbarInner.style.paddingRight = fixed ? '' : `${Math.ceil(start.right - label.left) + 16}px`;
    const used = topbar.offsetHeight + progress.offsetHeight + bottom;
    page.style.height = `${Math.max(320, window.innerHeight - used)}px`;
  };
  sizeStage();
  window.addEventListener('resize', sizeStage);

  const feedback = root.querySelector<HTMLElement>('#practice-feedback')!;
  let cleanup = mountItem(root.querySelector('#practice-item')!, practice, {
    fit: true,
    onSubmit: (response) => {
      cleanup();
      showPracticeFeedback(feedback, practice, response);
      root.querySelectorAll<HTMLButtonElement>('#practice-item button').forEach((b) => (b.disabled = true));
    },
  });
  root.querySelector('#start-section')!.addEventListener('click', () => {
    cleanup();
    onStart();
  });
  return () => {
    window.removeEventListener('resize', sizeStage);
    cleanup();
  };
}

function showPracticeFeedback(el: HTMLElement, item: Item, response: number | string): void {
  const correct = isCorrect(item, response);
  const answer = item.kind === 'choice' ? `option ${letter(item.answer)}` : item.answer.split('').join(' ');
  el.hidden = false;
  el.className = `feedback ${correct ? 'feedback--good' : 'feedback--bad'}`;
  el.innerHTML = `
    <strong>${correct ? 'Correct.' : `Not quite — the answer is ${escapeHtml(answer)}.`}</strong>
    <p>${escapeHtml(item.explanation)}</p>`;
  el.parentElement?.querySelectorAll<HTMLButtonElement>('#practice-item button').forEach((b) => (b.disabled = true));
}

export interface TestView {
  /** Updates the count-up clock without re-rendering the item. */
  setElapsed(ms: number): void;
  destroy(): void;
}

/** Total time spent across all sections so far, for the count-up clock. */
export function totalElapsed(session: Session): number {
  return session.sections.reduce((ms, s) => ms + s.elapsedMs, 0);
}

export function renderActiveItem(root: HTMLElement, session: Session, onAnswer: (response: number | string) => void): TestView {
  const section = currentSection(session);
  const item = section.current!.item;
  const info = DOMAINS[section.domain];

  root.innerHTML = `
    ${brandBar(`
      <span class="topbar-section">${info.name}</span>
      <span class="topbar-count">Question ${section.responses.length + 1} of ${section.items}</span>
      <span class="timer" role="timer" aria-label="Time elapsed"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 6v3l2 1.5M6.5 2h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span id="clock">${formatClock(totalElapsed(session))}</span></span>
    `)}
    ${overallProgress(session)}
    <main class="page page--test"><div id="item" class="test-stage"></div></main>`;

  const clock = root.querySelector<HTMLElement>('#clock')!;
  const page = root.querySelector<HTMLElement>('.page--test')!;
  const topbar = root.querySelector<HTMLElement>('.topbar')!;
  const progress = root.querySelector<HTMLElement>('.progress')!;

  // Constrain the stage to the space below the sticky top bar so the question fits without scrolling.
  const sizeStage = () => {
    const used = topbar.offsetHeight + progress.offsetHeight;
    page.style.height = `${Math.max(320, window.innerHeight - used)}px`;
  };
  sizeStage();
  window.addEventListener('resize', sizeStage);

  const cleanup = mountItem(root.querySelector('#item')!, item, { onSubmit: onAnswer, fit: true });

  const setElapsed = (ms: number) => {
    clock.textContent = formatClock(ms);
  };
  setElapsed(totalElapsed(session));
  return {
    setElapsed,
    destroy: () => {
      window.removeEventListener('resize', sizeStage);
      cleanup();
    },
  };
}

function overallProgress(session: Session): string {
  const total = session.sections.reduce((n, s) => n + s.items, 0);
  const done = session.sections.reduce((n, s) => n + s.responses.length, 0);
  const pct = Math.round((done / total) * 100);
  return `
    <div class="progress" role="progressbar" aria-label="Overall progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
      <div class="progress-bar" style="width:${pct}%"></div>
    </div>`;
}
