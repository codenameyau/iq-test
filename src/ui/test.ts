import { DOMAINS, MODES } from '../core/config';
import { currentSection, GENERATORS, isCorrect, type Session } from '../core/engine';
import type { Item } from '../core/types';
import { brandBar } from './home';
import { escapeHtml, formatClock, letter } from './dom';
import { mountItem } from './item';

const SECTION_TIPS: Record<string, string[]> = {
  matrices: [
    'Look across rows and down columns. Each attribute — shape, number, shading, size, orientation — can follow its own rule.',
    'Work out what the missing panel must look like before comparing the options.',
  ],
  verbal: [
    'Choose the best answer, not just one that could work. For similarities, the most general shared property wins.',
    'For logic questions, rely only on the statements given, not on what is true in real life.',
  ],
  spatial: [
    'Rotated shapes are allowed; mirror images are not the same shape.',
    'Read the instructions in each question carefully — operation order matters.',
  ],
  series: [
    'Write nothing down — but do look at the differences between neighbouring numbers, and at every second number.',
    'Some questions are number grids: each row follows the same rule.',
  ],
  memory: [
    'Items appear one at a time, about one per second. Your answer box appears after the last item.',
    'You can\'t replay the sequence, so give it your full attention.',
  ],
};

export function renderSectionIntro(root: HTMLElement, session: Session, onStart: () => void): () => void {
  const section = currentSection(session);
  const info = DOMAINS[section.domain];
  const practice = GENERATORS[section.domain].practice();
  const n = session.sectionIndex + 1;

  root.innerHTML = `
    ${brandBar(`<span class="muted">${MODES[session.mode].label} test</span>`)}
    ${overallProgress(session)}
    <main class="page page--narrow">
      <p class="eyebrow">Section ${n} of ${session.sections.length}</p>
      <h1>${info.name}</h1>
      <p class="lede">${info.description}</p>
      <div class="facts">
        <div><span class="fact-value">${section.items}</span><span class="fact-label">questions</span></div>
        <div><span class="fact-value">~${Math.round(section.seconds / 60)} min</span><span class="fact-label">suggested time</span></div>
        <div><span class="fact-value">Adaptive</span><span class="fact-label">difficulty</span></div>
      </div>
      <ul class="checklist">${SECTION_TIPS[section.domain].map((t) => `<li>${t}</li>`).join('')}</ul>

      <section class="card practice" aria-labelledby="practice-title">
        <div class="card-head">
          <h2 class="card-title" id="practice-title">Practice question</h2>
          <span class="badge badge--muted">Untimed · not scored</span>
        </div>
        <div id="practice-item"></div>
        <div id="practice-feedback" hidden></div>
      </section>

      <div class="start-row">
        <p class="muted">A clock tracks your time, but there's no limit — answer every question. You can't go back to earlier questions.</p>
        <button class="btn btn--primary btn--lg" id="start-section">Start section ${n}</button>
      </div>
    </main>`;

  const feedback = root.querySelector<HTMLElement>('#practice-feedback')!;
  let cleanup = mountItem(root.querySelector('#practice-item')!, practice, {
    submitLabel: 'Check answer',
    onSubmit: (response) => {
      cleanup();
      showPracticeFeedback(feedback, practice, response);
    },
  });
  root.querySelector('#start-section')!.addEventListener('click', () => {
    cleanup();
    onStart();
  });
  return () => cleanup();
}

function showPracticeFeedback(el: HTMLElement, item: Item, response: number | string): void {
  const correct = isCorrect(item, response);
  const answer = item.kind === 'choice' ? `option ${letter(item.answer)}` : item.answer.split('').join(' ');
  el.hidden = false;
  el.className = `feedback ${correct ? 'feedback--good' : 'feedback--bad'}`;
  el.innerHTML = `
    <strong>${correct ? 'Correct.' : `Not quite — the answer is ${escapeHtml(answer)}.`}</strong>
    <p>${escapeHtml(item.explanation)}</p>`;
  el.closest('.practice')?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
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
