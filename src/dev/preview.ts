import '../styles.css';
import { createRng } from '../core/rng';
import type { ItemGenerator } from '../core/types';
import { renderVisual, letter, escapeHtml } from '../ui/dom';

// Dev-only page (not part of the production build): item gallery and a results-screen preview.
const params = new URLSearchParams(location.search);
const domain = params.get('d') ?? 'matrices';
const root = document.getElementById('app')!;

if (domain === 'results') {
  await previewResults(Number(params.get('theta') ?? 1));
} else {
  await previewItems();
}

async function previewItems(): Promise<void> {
  const modules = import.meta.glob<Record<string, ItemGenerator>>('../items/*.ts');
  const gen = (await modules[`../items/${domain}.ts`]())[`${domain}Generator`];
  const targets = (params.get('t') ?? '-2.4,-1.1,0.1,0.6,1.2,1.7,2.2,2.7').split(',').map(Number);
  const seed = Number(params.get('s') ?? 1);
  root.innerHTML = `<main class="page">${targets
    .map((t, i) => {
      const item = gen.generate(createRng(seed * 100 + i), t, new Set());
      if (item.kind !== 'choice') return '';
      return `<section class="card"><p><strong>b=${item.b} · ${item.family ?? '-'} · answer ${letter(item.answer)}</strong> — ${escapeHtml(item.prompt)}</p>
        <div style="display:flex;gap:24px;align-items:flex-start">
          <div style="width:260px">${renderVisual(item.stimulus)}</div>
          <div style="display:grid;grid-template-columns:repeat(4,90px);gap:8px">${item.options
            .map((o, j) => `<div style="border:1px solid ${j === item.answer ? '#15803d' : '#e5e7eb'};padding:2px">${letter(j)}${renderVisual(o)}</div>`)
            .join('')}</div>
        </div><p class="muted small">${escapeHtml(item.explanation)}</p></section>`;
    })
    .join('')}</main>`;
}

/** Simulated test-taker answering per the IRT model; nothing is written to storage. */
async function previewResults(theta: number): Promise<void> {
  const engine = await import('../core/engine');
  const { probability } = await import('../core/irt');
  const { buildReport } = await import('../core/scoring');
  const { renderResults } = await import('../ui/results');
  const rng = createRng(Number(params.get('s') ?? 7));
  const session = engine.createSession((params.get('mode') as 'standard') ?? 'standard', params.has('nv'), []);
  const dob = params.get('dob');
  if (dob) {
    engine.setParticipant(session, {
      fullName: params.get('name') ?? 'Jordan Rivera', dob, email: 'test@proton.me',
      phone: '+15552345678', country: 'US', countryOfBirth: 'US', postalCode: '10001', submittedAt: Date.now(),
    });
  }
  while (session.phase !== 'done') {
    if (session.phase === 'section-intro') engine.startSection(session);
    const item = engine.currentSection(session).current!.item;
    const correct = rng.next() < probability(theta, { a: item.a, b: item.b, c: engine.guessingFloor(item) });
    engine.tick(session, 6000 + rng.next() * 20000);
    if (session.phase !== 'active' || engine.currentSection(session).current?.item !== item) continue;
    if (item.kind === 'choice') engine.submitAnswer(session, correct ? item.answer : (item.answer + 1) % item.options.length);
    else engine.submitAnswer(session, correct ? item.answer : '1');
  }
  renderResults(root, buildReport(session), { onNewTest: () => location.reload() });
}
