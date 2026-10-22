import './styles.css';
import {
  createSession,
  resumeAfterReload,
  shownItemIds,
  startSection,
  submitAnswer,
  tick,
  type Session,
} from './core/engine';
import { buildReport } from './core/scoring';
import {
  clearHistory,
  clearSession,
  loadHistory,
  loadSeenIds,
  loadSession,
  recordHistory,
  rememberSeenIds,
  saveSession,
} from './core/storage';
import { renderHome } from './ui/home';
import { renderResults } from './ui/results';
import { renderActiveItem, renderSectionIntro, totalElapsed, type TestView } from './ui/test';

const root = document.getElementById('app')!;
const TICK_MS = 250;
const AUTOSAVE_MS = 2000;

let session: Session | null = loadSession();
let teardown: (() => void) | null = null;
let clock: number | null = null;

function render(): void {
  teardown?.();
  teardown = null;
  stopClock();
  window.scrollTo(0, 0);

  if (!session) return showHome();
  switch (session.phase) {
    case 'section-intro':
      teardown = renderSectionIntro(root, session, () => {
        startSection(session!);
        persist();
        render();
      });
      break;
    case 'active':
      showActiveItem(session);
      break;
    case 'done':
      showResults(session);
      break;
  }
}

function showHome(): void {
  renderHome(root, session, loadHistory(), {
    onStart(mode, nonverbal) {
      if (session) rememberSeenIds(shownItemIds(session));
      session = createSession(mode, nonverbal, loadSeenIds());
      persist();
      render();
    },
    onResume() {
      resumeAfterReload(session!);
      persist();
      render();
    },
    onDiscard() {
      if (session) rememberSeenIds(shownItemIds(session));
      session = null;
      clearSession();
      render();
    },
    onClearHistory() {
      clearHistory();
      render();
    },
  });
}

function showActiveItem(s: Session): void {
  const view: TestView = renderActiveItem(root, s, (response) => {
    submitAnswer(s, response);
    persist();
    render();
  });
  teardown = view.destroy;
  startClock(s, view);
}

function showResults(s: Session): void {
  const report = buildReport(s);
  rememberSeenIds(shownItemIds(s));
  recordHistory({
    sessionId: s.id,
    finishedAt: s.finishedAt ?? Date.now(),
    mode: s.mode,
    nonverbal: s.nonverbal,
    fsiq: report.fsiq,
    ciLow: report.ciLow,
    ciHigh: report.ciHigh,
  });
  renderResults(root, report, {
    onNewTest() {
      session = null;
      clearSession();
      render();
    },
  });
}

/** Wall-clock deltas keep the timer honest even when the browser throttles background tabs. */
function startClock(s: Session, view: TestView): void {
  let last = performance.now();
  let sinceSave = 0;
  clock = window.setInterval(() => {
    const now = performance.now();
    const delta = now - last;
    last = now;
    sinceSave += delta;
    tick(s, delta);
    view.setElapsed(totalElapsed(s));
    if (sinceSave >= AUTOSAVE_MS) {
      sinceSave = 0;
      persist();
    }
  }, TICK_MS);
}

function stopClock(): void {
  if (clock !== null) clearInterval(clock);
  clock = null;
}

function persist(): void {
  if (session) saveSession(session);
}

document.addEventListener('visibilitychange', () => {
  if (!session || session.phase !== 'active') return;
  if (document.visibilityState === 'hidden') {
    session.focusLosses++;
    persist();
  }
});
window.addEventListener('pagehide', persist);

// A reload mid-test lands on the home screen with a resume banner rather than straight into a running clock.
if (session && session.phase !== 'done') showHome();
else render();
