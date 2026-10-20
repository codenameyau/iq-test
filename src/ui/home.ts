import { DOMAINS, MODES, sectionsFor, totalSeconds, type ModeId } from '../core/config';
import type { Session } from '../core/engine';
import type { HistoryEntry } from '../core/storage';
import { escapeHtml, formatClock } from './dom';

export interface HomeHandlers {
  onStart(mode: ModeId, nonverbal: boolean): void;
  onResume(): void;
  onDiscard(): void;
  onClearHistory(): void;
}

const MODE_PRECISION: Record<ModeId, string> = {
  quick: 'about ±9 points',
  standard: 'about ±7 points',
  comprehensive: 'about ±6 points',
};

export function renderHome(
  root: HTMLElement,
  saved: Session | null,
  history: HistoryEntry[],
  handlers: HomeHandlers,
): void {
  let selected: ModeId = 'standard';
  let nonverbal = false;

  root.innerHTML = `
    ${brandBar()}
    <main class="page page--home">
      ${saved ? resumeBanner(saved) : ''}
      <section class="hero">
        <p class="eyebrow">Cognitive Ability Assessment</p>
        <h1>An adaptive IQ test built on the same principles as professional assessments.</h1>
        <p class="lede">Five timed sections cover the core abilities measured by tests like the WAIS and Stanford-Binet. Questions adapt to your level as you go, so every answer refines the estimate. Everything runs privately in your browser.</p>
      </section>

      <section class="card mode-picker" aria-labelledby="mode-heading">
        <h2 id="mode-heading" class="card-title">Choose a test length</h2>
        <div class="modes" role="radiogroup" aria-labelledby="mode-heading">
          ${(Object.keys(MODES) as ModeId[]).map((id) => modeCard(id, id === selected)).join('')}
        </div>
        <label class="checkbox">
          <input type="checkbox" id="nonverbal" />
          <span><strong>Nonverbal version</strong> — skip the verbal section. Recommended if English is not your first language; the score will then reflect reasoning that doesn't depend on language.</span>
        </label>
        <div class="start-row">
          <p class="muted" id="start-summary"></p>
          <button class="btn btn--primary btn--lg" id="start">Start test</button>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <h2 class="card-title">What it measures</h2>
          <ul class="domain-list">
            ${Object.values(DOMAINS)
              .map((d) => `<li><strong>${d.name}</strong><span>${d.description.split('. ')[0]}.</span></li>`)
              .join('')}
          </ul>
        </div>
        <div class="card">
          <h2 class="card-title">Before you begin</h2>
          <ul class="checklist">
            <li>Find a quiet place where you won't be interrupted. Each section has its own timer.</li>
            <li>Don't use a calculator, notes, search or another person's help — it would only make the result less accurate.</li>
            <li>Questions get harder or easier based on your answers. Expect to find many of them difficult; that is by design.</li>
            <li>Every test is unique: questions are generated fresh each time and ones you've seen before are avoided, so retakes can't be memorised.</li>
            <li>If you're unsure, make your best guess. Questions left unanswered when time runs out count as incorrect.</li>
            <li>There's an untimed practice question before every section, and you can rest between sections.</li>
            <li>Progress is saved on this device automatically. If you reload, you'll resume where you left off.</li>
          </ul>
        </div>
      </section>

      ${history.length ? historyCard(history) : ''}

      <footer class="footnote">
        <p>This is a self-administered estimate, not a clinical diagnosis. Item difficulties are calibrated to approximate adult norms (mean 100, SD 15) rather than a professionally standardised sample, so treat the result as a well-informed estimate. No data leaves your device.</p>
      </footer>
    </main>`;

  const summary = root.querySelector<HTMLElement>('#start-summary')!;
  const updateSummary = () => {
    const sections = sectionsFor(selected, nonverbal);
    const items = sections.reduce((n, s) => n + s.items, 0);
    summary.textContent = `${MODES[selected].label}: ${sections.length} sections · ${items} questions · ${Math.round(totalSeconds(sections) / 60)} minutes of timed work.`;
  };
  updateSummary();

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.mode as ModeId;
      root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
      });
      updateSummary();
    });
  });
  root.querySelector<HTMLInputElement>('#nonverbal')!.addEventListener('change', (e) => {
    nonverbal = (e.target as HTMLInputElement).checked;
    updateSummary();
  });
  root.querySelector('#start')!.addEventListener('click', () => {
    if (saved && saved.phase !== 'done' && !confirm('Starting a new test will discard your test in progress. Continue?')) return;
    handlers.onStart(selected, nonverbal);
  });
  root.querySelector('#resume')?.addEventListener('click', handlers.onResume);
  root.querySelector('#discard')?.addEventListener('click', () => {
    if (confirm('Discard your saved progress? This cannot be undone.')) handlers.onDiscard();
  });
  root.querySelector('#clear-history')?.addEventListener('click', () => {
    if (confirm('Remove all past results from this device?')) handlers.onClearHistory();
  });
}

export function brandBar(right = ''): string {
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="./" aria-label="Free IQ Test home">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 22l7-12 7 12z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>
          <span>Free IQ Test</span>
        </a>
        <div class="topbar-right">${right}</div>
      </div>
    </header>`;
}

function modeCard(id: ModeId, selected: boolean): string {
  const mode = MODES[id];
  const items = mode.sections.reduce((n, s) => n + s.items, 0);
  return `
    <button class="mode ${selected ? 'is-selected' : ''}" data-mode="${id}" role="radio" aria-checked="${selected}">
      <span class="mode-head">
        <span class="mode-label">${mode.label}</span>
        ${id === 'standard' ? '<span class="badge">Recommended</span>' : ''}
      </span>
      <span class="mode-minutes">${mode.minutes}<small> min</small></span>
      <span class="mode-summary">${mode.summary}</span>
      <span class="mode-meta">${items} questions · precision ${MODE_PRECISION[id]}</span>
    </button>`;
}

function resumeBanner(session: Session): string {
  if (session.phase === 'done') {
    return `
      <div class="banner">
        <div><strong>Your last result is ready.</strong> <span class="muted">${MODES[session.mode].label} test, finished ${new Date(session.finishedAt ?? Date.now()).toLocaleString()}.</span></div>
        <div class="banner-actions"><button class="btn btn--primary" id="resume">View results</button></div>
      </div>`;
  }
  const done = session.sections.reduce((n, s) => n + s.responses.length, 0);
  const total = session.sections.reduce((n, s) => n + s.items, 0);
  const section = session.sections[session.sectionIndex];
  return `
    <div class="banner">
      <div>
        <strong>You have a test in progress.</strong>
        <span class="muted">${MODES[session.mode].label} · ${done} of ${total} questions answered · ${escapeHtml(DOMAINS[section.domain].name)} section, ${formatClock(section.remainingMs)} left.</span>
      </div>
      <div class="banner-actions">
        <button class="btn btn--ghost" id="discard">Discard</button>
        <button class="btn btn--primary" id="resume">Resume test</button>
      </div>
    </div>`;
}

function historyCard(history: HistoryEntry[]): string {
  return `
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Past results on this device</h2>
        <button class="btn btn--link" id="clear-history">Clear</button>
      </div>
      <table class="table">
        <thead><tr><th>Date</th><th>Test</th><th class="num">IQ</th><th class="num">95% range</th></tr></thead>
        <tbody>
          ${history
            .map(
              (h) => `<tr>
                <td>${new Date(h.finishedAt).toLocaleDateString()}</td>
                <td>${MODES[h.mode].label}${h.nonverbal ? ' (nonverbal)' : ''}</td>
                <td class="num"><strong>${h.fsiq}</strong></td>
                <td class="num">${h.ciLow}–${h.ciHigh}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p class="muted small">Retaking the test usually raises scores by a few points through familiarity (the practice effect), so your first result is generally the most accurate.</p>
    </section>`;
}
