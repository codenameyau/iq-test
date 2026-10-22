import {
  CLASSIFICATIONS,
  MEASUREMENT_CEILING,
  type DomainScore,
  type Report,
  type ReviewEntry,
  type TypeScore,
} from '../core/scoring';
import {
  CAREERS_BY_DOMAIN,
  CAREERS_BY_PAIR,
  DOMAINS,
  MODES,
  questionTypeOf,
  type CareerCluster,
} from '../core/config';
import type { Domain } from '../core/types';
import { brandBar } from './home';
import { difficultyLabel, escapeHtml, formatDuration, letter, ordinal, renderVisual } from './dom';

export interface ResultsHandlers {
  onNewTest(): void;
}

const SCALE_MIN = 40;
const SCALE_MAX = 160;

export function renderResults(root: HTMLElement, report: Report, handlers: ResultsHandlers): void {
  const scoreName = report.nonverbal ? 'nonverbal IQ' : 'full-scale IQ';
  const shownScore = report.fsiq > MEASUREMENT_CEILING ? `${MEASUREMENT_CEILING}+` : `${report.fsiq}`;

  root.innerHTML = `
    ${brandBar(`<button class="btn btn--ghost btn--sm no-print" id="print">Save as PDF</button>`)}
    <main class="page page--results">
      ${report.participant ? `<p class="prepared-for">Prepared for <strong>${escapeHtml(report.participant.fullName)}</strong>${report.age !== null ? ` · age ${report.age}` : ''}</p>` : ''}
      <section class="card result-hero">
        <div class="result-score">
          <p class="eyebrow">Your estimated ${scoreName}</p>
          <div class="score-number">${shownScore}</div>
          <p class="score-range">95% confidence range <strong>${report.ciLow}–${report.ciHigh}</strong></p>
          <span class="badge badge--lg">${report.classification.label}</span>
          <dl class="score-stats">
            <div><dt>Percentile</dt><dd>${ordinal(report.percentile)}</dd></div>
            <div><dt>Questions</dt><dd>${report.totalCorrect} / ${report.review.length} correct</dd></div>
            <div><dt>Confidence</dt><dd class="confidence confidence--${report.confidence}">${capitalize(report.confidence)}</dd></div>
          </dl>
        </div>
        <div class="result-curve">
          ${bellCurve(report)}
          <p class="muted small center">${escapeHtml(report.rarity)}.</p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">What your score means</h2>
        <p>Your ${scoreName} of <strong>${report.fsiq}</strong> places you in the <strong>${report.classification.label}</strong> range (${report.classification.range}) — higher than about <strong>${Math.round(report.percentile)}%</strong> of adults. ${report.classification.description}</p>
        <p>No single test measures ability perfectly. Taking measurement error into account, there is a 95% probability that your true score lies between <strong>${report.ciLow}</strong> and <strong>${report.ciHigh}</strong>. The score is built from ${report.totalAdministered} adaptively chosen questions${report.nonverbal ? ' across four nonverbal areas' : ' across five areas of ability'}; it reflects how you reasoned today, under these conditions.</p>
        ${ageNote(report)}
        ${classificationScale(report)}
      </section>

      <section class="card">
        <h2 class="card-title">Ability profile</h2>
        <p class="muted">Each index is scored on the same scale as IQ (average 100). Bars show the 95% confidence range; the dashed line is your overall score.</p>
        ${profileChart(report)}
        ${profileNarrative(report)}
      </section>

      <section class="grid-2">
        ${report.domains.map(domainCard).join('')}
      </section>

      <section class="card">
        <h2 class="card-title">Breakdown by question type</h2>
        <p class="muted">Because the test adapts, everyone gets roughly half the questions right, so raw percentages can mislead. Each type is compared instead with how many someone at your overall level would be expected to answer correctly on those exact questions (the marker on each bar).</p>
        ${typeSummary(report.types)}
        ${typeBreakdown(report)}
      </section>

      <section class="card">
        <h2 class="card-title">Result confidence: <span class="confidence confidence--${report.confidence}">${capitalize(report.confidence)}</span></h2>
        <p class="muted">These checks look for conditions that commonly distort online test results.</p>
        ${report.flags.length
          ? `<ul class="flags">${report.flags
              .map((f) => `<li class="flag flag--${f.severity}"><strong>${escapeHtml(f.title)}</strong><p>${escapeHtml(f.detail)}</p></li>`)
              .join('')}</ul>`
          : '<p class="flag flag--ok"><strong>No problems detected.</strong> Your answers were consistent, unhurried and uninterrupted.</p>'}
        <dl class="kv">
          <div><dt>Standard error of measurement</dt><dd>±${report.sem} IQ points</dd></div>
          <div><dt>Estimated reliability</dt><dd>${report.reliability.toFixed(2)}</dd></div>
          <div><dt>Timed work</dt><dd>${formatDuration(report.activeMs)}</dd></div>
          <div><dt>Test version</dt><dd>${MODES[report.mode].label}${report.nonverbal ? ', nonverbal' : ''}</dd></div>
        </dl>
      </section>

      ${careerSection(report)}

      <section class="card prose">
        <h2 class="card-title">What IQ does — and doesn't — tell you</h2>
        <p>IQ tests estimate <em>general cognitive ability</em> (often called <em>g</em>): the shared capacity behind reasoning, learning and problem-solving that shows up across very different tasks. It is one of the most studied measures in psychology. Higher scores predict, on average, better academic performance, faster learning on the job, and success in complex occupations.</p>
        <p>But it is a statistical tendency, not destiny. IQ does not measure creativity, wisdom, emotional and social skill, motivation, conscientiousness, specialised knowledge or practical expertise — all of which matter a great deal for what people actually achieve. Many people with average scores excel; many with high scores don't.</p>
      </section>

      <section class="card prose">
        <h2 class="card-title">How your score was calculated</h2>
        <p><strong>Adaptive testing.</strong> This test uses computerised adaptive testing, the method behind the GRE and GMAT. After every answer your ability estimate is updated, and the next question is generated close to the difficulty where it gives the most information about you. That's why most people find many questions hard: the test keeps working at the edge of your ability.</p>
        <p><strong>Item response theory.</strong> Each question has a difficulty, a discrimination (how sharply it separates people above and below its level) and a guessing floor (e.g. 1 in 8 for an eight-option matrix). Your answers are combined using a three-parameter logistic model and an expected a posteriori (Bayesian) estimate, which accounts for which questions you got right, not just how many. Getting a hard question right counts for more than an easy one; lucky guesses on multiple choice count for less.</p>
        <p><strong>Scaling.</strong> Ability estimates are expressed on the standard IQ scale (mean 100, standard deviation 15). The Bayesian estimate gently pulls very short or very extreme results toward the average — this is deliberate, and corrects for the fact that extreme results on short tests are partly luck.</p>
        <p><strong>Age.</strong> ${report.ageNormed ? 'Your date of birth is used to compare you with people your own age, exactly as the WAIS and Stanford-Binet do. Fluid reasoning, working memory, quantitative and spatial ability peak in the early-to-mid twenties and decline gradually with age, while verbal ability keeps rising into middle age.' : 'This score uses adult norms (mean 100, SD 15) and is not adjusted for age.'}</p>
        <p><strong>Fresh questions every time.</strong> Matrix, number, spatial and memory questions are generated on the fly from rules, and verbal questions are drawn from a large bank while avoiding ones you've seen on this device. Memorising answers from a previous attempt doesn't help.</p>
        <p><strong>What's not included.</strong> Professional batteries also measure processing speed. It's left out here because reaction times in a browser depend heavily on the device, screen and input method, which would add noise rather than information.</p>
      </section>

      <section class="card prose">
        <h2 class="card-title">Limitations</h2>
        <ul>
          <li>This is a self-administered estimate, not a clinical assessment. It cannot diagnose intellectual disability, giftedness or any learning difference — only a qualified psychologist using a standardised, proctored battery can.</li>
          <li>Item difficulties are calibrated from published research on how features of each question type drive difficulty, and set to approximate adult norms. They have not been normed on a large representative sample, so scores could be systematically a few points off.</li>
          <li>Norms are for adults (roughly 16 and over). Results for children and teenagers are not meaningful on this scale.</li>
          <li>Fatigue, stress, distraction, an unfamiliar device or limited English proficiency (for the verbal section) can all lower scores. Repeated testing raises scores through familiarity.</li>
        </ul>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">Question review</h2>
          <span class="muted small">Every question you saw, with the correct answer and why</span>
        </div>
        ${reviewSections(report.review)}
      </section>

      <div class="result-actions no-print">
        <button class="btn btn--ghost" id="download">Download data (JSON)</button>
        <button class="btn btn--ghost" id="print-bottom">Save as PDF</button>
        <button class="btn btn--primary" id="new-test">Take another test</button>
      </div>
      <p class="footnote">This result stays on this device. Nothing is sent to a server. Generated ${new Date().toLocaleString()}.</p>
    </main>`;

  const print = () => {
    root.querySelectorAll('details').forEach((d) => (d.open = true));
    window.print();
  };
  root.querySelector('#print')!.addEventListener('click', print);
  root.querySelector('#print-bottom')!.addEventListener('click', print);
  root.querySelector('#download')!.addEventListener('click', () => downloadReport(report));
  root.querySelector('#new-test')!.addEventListener('click', handlers.onNewTest);
}

function ageNote(report: Report): string {
  if (!report.ageNormed || report.age === null) return '';
  const pts = report.ageAdjustmentPoints;
  const direction =
    pts > 0
      ? `raised your score by about ${pts} point${pts === 1 ? '' : 's'}, because reasoning, memory and spatial ability are typically lower at ${report.age} than at their early-adult peak`
      : pts < 0
        ? `lowered your score by about ${Math.abs(pts)} point${Math.abs(pts) === 1 ? '' : 's'}, because several of these abilities are typically near their peak at ${report.age}`
        : `made no material difference at ${report.age}`;
  return `<p class="age-note"><strong>Scored for your age.</strong> Like professional tests, this result compares you with other ${report.age}-year-olds rather than all adults. Age norming ${direction}.</p>`;
}

function bellCurve(report: Report): string {
  const w = 520;
  const h = 200;
  const base = 160;
  const x = (iq: number) => ((iq - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * w;
  const y = (iq: number) => base - Math.exp(-0.5 * ((iq - 100) / 15) ** 2) * 135;
  const path = (from: number, to: number) => {
    const pts: string[] = [];
    for (let iq = from; iq <= to; iq += 1) pts.push(`${x(iq).toFixed(1)},${y(iq).toFixed(1)}`);
    return pts;
  };
  const curve = path(SCALE_MIN, SCALE_MAX);
  const lo = clamp(report.ciLow);
  const hi = clamp(report.ciHigh);
  const score = clamp(report.fsiq);
  const band = [`${x(lo)},${base}`, ...path(lo, hi), `${x(hi)},${base}`].join(' ');
  const ticks = [55, 70, 85, 100, 115, 130, 145];
  return `
    <svg class="bell" viewBox="0 0 ${w} ${h}" role="img" aria-label="Normal distribution of IQ scores with your score of ${report.fsiq} marked">
      <polygon points="${x(SCALE_MIN)},${base} ${curve.join(' ')} ${x(SCALE_MAX)},${base}" class="bell-area" />
      <polygon points="${band}" class="bell-band" />
      <polyline points="${curve.join(' ')}" class="bell-line" />
      <line x1="0" x2="${w}" y1="${base}" y2="${base}" class="bell-axis" />
      ${ticks
        .map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${base}" y2="${base + 5}" class="bell-axis" /><text x="${x(t)}" y="${base + 20}" class="bell-tick">${t}</text>`)
        .join('')}
      <line x1="${x(score)}" x2="${x(score)}" y1="${y(score) - 14}" y2="${base}" class="bell-marker" />
      <circle cx="${x(score)}" cy="${y(score) - 14}" r="5" class="bell-dot" />
      <text x="${Math.min(w - 40, Math.max(40, x(score)))}" y="${Math.max(14, y(score) - 26)}" class="bell-label">You · ${report.fsiq}</text>
      <text x="${x(100)}" y="${base + 38}" class="bell-caption">IQ score (population mean 100, SD 15)</text>
    </svg>`;
}

function classificationScale(report: Report): string {
  const bands = CLASSIFICATIONS.slice().reverse();
  return `
    <div class="scale" role="list" aria-label="IQ classification ranges">
      ${bands
        .map((c) => `<div role="listitem" class="scale-band ${c.label === report.classification.label ? 'is-current' : ''}"><span>${c.label}</span><small>${c.range}</small></div>`)
        .join('')}
    </div>`;
}

function profileChart(report: Report): string {
  const lo = 55;
  const hi = 145;
  const pct = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`;
  return `
    <div class="profile">
      <div class="profile-axis" aria-hidden="true">
        ${[55, 70, 85, 100, 115, 130, 145].map((t) => `<span style="left:${pct(t)}">${t}</span>`).join('')}
      </div>
      ${report.domains
        .map(
          (d) => `
        <div class="profile-row">
          <div class="profile-label"><strong>${d.info.index}</strong>${d.info.name !== d.info.index ? `<small>${d.info.name}</small>` : ''}</div>
          <div class="profile-track" role="img" aria-label="${d.info.index}: ${d.iq}, 95% range ${d.ciLow} to ${d.ciHigh}">
            <span class="profile-mean" style="left:${pct(100)}"></span>
            <span class="profile-overall" style="left:${pct(report.fsiq)}"></span>
            <span class="profile-ci" style="left:${pct(d.ciLow)};right:calc(100% - ${pct(d.ciHigh)})"></span>
            <span class="profile-point profile-point--${d.relative}" style="left:${pct(d.iq)}"></span>
          </div>
          <div class="profile-value"><strong>${d.iq}</strong><small>${d.ciLow}–${d.ciHigh}</small></div>
        </div>`,
        )
        .join('')}
    </div>`;
}

function profileNarrative(report: Report): string {
  const sorted = report.domains.slice().sort((a, b) => b.iq - a.iq);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const strengths = report.domains.filter((d) => d.relative === 'strength');
  const weaknesses = report.domains.filter((d) => d.relative === 'weakness');
  const parts: string[] = [];

  if (report.indexSpread >= 23) {
    parts.push(`<p>Your profile is <strong>uneven</strong>: there are ${report.indexSpread} points between your strongest area (${top.info.index}, ${top.iq}) and your weakest (${bottom.info.index}, ${bottom.iq}). When abilities differ this much, the overall IQ is a less complete summary and the individual index scores tell you more.</p>`);
  } else if (report.indexSpread >= 15) {
    parts.push(`<p>Your profile is <strong>moderately varied</strong>, with ${report.indexSpread} points between your highest index (${top.info.index}) and your lowest (${bottom.info.index}). Differences of this size are common — most people show some peaks and dips.</p>`);
  } else {
    parts.push(`<p>Your profile is <strong>even</strong>: all index scores fall within ${report.indexSpread} points of each other, so your overall IQ is a good summary of your abilities.</p>`);
  }

  if (strengths.length || weaknesses.length) {
    parts.push('<div class="sw">');
    for (const d of strengths) parts.push(`<div class="sw-item sw-item--strength"><span class="tag tag--strength">Relative strength</span><strong>${d.info.index}</strong><p>${d.info.strength}</p></div>`);
    for (const d of weaknesses) parts.push(`<div class="sw-item sw-item--weakness"><span class="tag tag--weakness">Relative weakness</span><strong>${d.info.index}</strong><p>${d.info.weakness}</p></div>`);
    parts.push('</div>');
    parts.push('<p class="muted small">"Relative" means compared with your own overall level, beyond what measurement error alone would explain — not compared with other people.</p>');
  } else {
    parts.push(`<p class="muted">No index differs from your overall level by more than measurement error, so there are no statistically reliable relative strengths or weaknesses. Your highest score was ${top.info.index} (${top.iq}).</p>`);
  }
  return parts.join('');
}

function typeSummary(types: TypeScore[]): string {
  const above = types.filter((t) => t.verdict === 'above').sort((a, b) => b.z - a.z);
  const below = types.filter((t) => t.verdict === 'below').sort((a, b) => a.z - b.z);
  const names = (ts: TypeScore[]) => ts.map((t) => `<strong>${t.name}</strong>`).join(', ');
  if (above.length || below.length) {
    return `<p>${[
      above.length ? `You did noticeably better than your overall level predicts on ${names(above)}.` : '',
      below.length ? `${above.length ? 'By contrast, ' : ''}${names(below)} ${below.length === 1 ? 'was' : 'were'} noticeably harder for you than your overall level predicts.` : '',
    ].join(' ')}</p>`;
  }
  const ranked = types.filter((t) => t.total >= 3).sort((a, b) => b.z - a.z);
  if (ranked.length < 2) return '';
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return `<p>No question type stood out beyond what chance alone would produce. Your best showing relative to expectation was <strong>${best.name}</strong> and your weakest was <strong>${worst.name}</strong>, but treat these as tendencies, not firm conclusions.</p>`;
}

function typeBreakdown(report: Report): string {
  return report.domains
    .map((d) => {
      const types = report.types.filter((t) => t.domain === d.domain);
      if (!types.length) return '';
      return `
        <div class="types-group">
          <h3 class="types-heading">${d.info.name} <span class="muted">· index ${d.iq}</span></h3>
          <div class="types">${types.map(typeRow).join('')}</div>
        </div>`;
    })
    .join('');
}

function typeRow(t: TypeScore): string {
  const pct = (n: number) => `${(n / t.total) * 100}%`;
  const verdict = {
    above: '<span class="tag tag--strength">Above expectation</span>',
    below: '<span class="tag tag--weakness">Below expectation</span>',
    expected: '<span class="tag tag--neutral">As expected</span>',
  }[t.verdict];
  return `
    <div class="type-row">
      <div class="type-info">
        <div class="type-name"><strong>${t.name}</strong>${verdict}</div>
        <p class="muted small">${t.measures}</p>
      </div>
      <div class="type-score">
        <div class="type-bar" role="img" aria-label="${t.correct} of ${t.total} correct; about ${t.expected.toFixed(1)} expected at your level">
          <span class="type-fill type-fill--${t.verdict}" style="width:${pct(t.correct)}"></span>
          <span class="type-expected" style="left:${pct(t.expected)}"></span>
        </div>
        <div class="type-numbers">
          <span><strong>${t.correct}/${t.total}</strong> correct</span>
          <span class="muted">expected ${t.expected.toFixed(1)}</span>
        </div>
        <div class="type-meta muted small">
          Avg. difficulty ${difficultyLabel(t.averageDifficulty).toLowerCase()} · hardest solved ${t.hardestSolved === null ? 'none' : difficultyLabel(t.hardestSolved).toLowerCase()} · ${t.medianSeconds.toFixed(0)} s median
        </div>
      </div>
    </div>`;
}

function careerSection(report: Report): string {
  const [first, second] = report.domains.slice().sort((a, b) => b.iq - a.iq);
  if (!first || !second) return '';
  const pair = CAREERS_BY_PAIR[[first.domain, second.domain].sort().join('+')];
  const single = CAREERS_BY_DOMAIN[first.domain];
  const balanced = report.indexSpread < 15;
  const cluster = (c: CareerCluster, label: string) => `
    <div class="career">
      <p class="eyebrow">${label}</p>
      <h3>${c.title}</h3>
      <ul class="chips">${c.roles.map((r) => `<li>${r}</li>`).join('')}</ul>
      <p class="muted small">${c.why}</p>
    </div>`;
  return `
    <section class="card">
      <h2 class="card-title">Career directions that fit your profile</h2>
      <p>Your two strongest areas were <strong>${first.info.index}</strong> (${first.iq}) and <strong>${second.info.index}</strong> (${second.iq}). ${
        balanced
          ? 'Your profile is fairly even, so this is a mild lean rather than a sharp specialism — balanced profiles also suit generalist roles such as management, medicine and running a business.'
          : 'Fields that draw heavily on these abilities are where your profile gives you the most natural advantage.'
      }</p>
      <div class="careers">
        ${pair ? cluster(pair, 'Best match for your top two areas') : ''}
        ${cluster(single, `Also draws on ${first.info.index.toLowerCase()}`)}
      </div>
      <p class="muted small">These are ideas to explore, not prescriptions, and nothing here rules any path out. Research consistently finds that interests, values and personality predict job satisfaction more strongly than ability profile does, and practice and training matter enormously for success. To add the interest side of the picture, try the free <a href="https://www.mynextmove.org/explore/ip" target="_blank" rel="noopener noreferrer">O*NET Interest Profiler</a>.</p>
    </section>`;
}

function domainCard(d: DomainScore): string {
  const tag = d.relative === 'consistent' ? '' : `<span class="tag tag--${d.relative}">${d.relative === 'strength' ? 'Relative strength' : 'Relative weakness'}</span>`;
  return `
    <article class="card domain-card">
      <div class="card-head">
        <div>
          <p class="eyebrow">${d.info.name !== d.info.index ? d.info.name : 'Index'}</p>
          <h3>${d.info.index} <span class="domain-score">${d.iq}</span></h3>
        </div>
        ${tag}
      </div>
      <p class="muted">${d.info.description}</p>
      <dl class="kv kv--compact">
        <div><dt>95% range</dt><dd>${d.ciLow}–${d.ciHigh}</dd></div>
        <div><dt>Percentile</dt><dd>${ordinal(d.percentile)}</dd></div>
        <div><dt>Correct</dt><dd>${d.correct} of ${d.administered}</dd></div>
        <div><dt>Median time per question</dt><dd>${d.medianSeconds.toFixed(1)} s</dd></div>
      </dl>
    </article>`;
}

function reviewSections(review: ReviewEntry[]): string {
  const byDomain = new Map<Domain, ReviewEntry[]>();
  for (const r of review) byDomain.set(r.domain, [...(byDomain.get(r.domain) ?? []), r]);
  return [...byDomain.entries()]
    .map(([domain, entries]) => {
      const correct = entries.filter((e) => e.correct).length;
      return `
        <details class="review-section">
          <summary><strong>${DOMAINS[domain].name}</strong><span class="muted">${correct} of ${entries.length} correct</span></summary>
          <ol class="review-list">${entries.map(reviewEntry).join('')}</ol>
        </details>`;
    })
    .join('');
}

function reviewEntry(r: ReviewEntry): string {
  const status = r.correct ? 'correct' : 'incorrect';
  const statusText = { correct: 'Correct', incorrect: 'Incorrect' }[status];
  const item = r.item;
  let body: string;
  if (item.kind === 'choice') {
    body = `
      ${renderVisual(item.stimulus, item.stimulus.type === 'text' ? 'review-stimulus review-stimulus--text' : 'review-stimulus')}
      <div class="review-options">
        ${item.options
          .map((o, i) => {
            const cls = [i === item.answer ? 'is-answer' : '', i === r.response && i !== item.answer ? 'is-wrong' : ''].join(' ');
            return `<div class="review-option ${cls}"><span class="option-key">${letter(i)}</span>${o.type === 'text' ? `<span>${escapeHtml(o.text)}</span>` : o.svg}</div>`;
          })
          .join('')}
      </div>`;
  } else {
    body = `
      <p class="review-recall">Sequence: <code>${item.sequence.map(escapeHtml).join(' ')}</code> · Correct: <code>${escapeHtml(item.answer)}</code>${r.response !== null ? ` · You typed: <code>${escapeHtml(String(r.response)) || '—'}</code>` : ''}</p>`;
  }
  return `
    <li class="review-item review-item--${status}">
      <div class="review-head">
        <span>Question ${r.number}</span>
        <span class="tag tag--neutral">${questionTypeOf(item).name}</span>
        <span class="tag tag--${status}">${statusText}</span>
        <span class="muted small">${difficultyLabel(item.b)} · ${(r.ms / 1000).toFixed(1)} s</span>
      </div>
      <p class="review-prompt">${escapeHtml(item.prompt)}</p>
      ${body}
      <p class="review-explanation"><strong>Explanation.</strong> ${escapeHtml(item.explanation)}</p>
    </li>`;
}

function downloadReport(report: Report): void {
  const data = {
    ...report,
    review: report.review.map((r) => ({
      domain: r.domain,
      number: r.number,
      itemId: r.item.id,
      difficulty: r.item.b,
      prompt: r.item.prompt,
      response: r.response,
      correct: r.correct,
      seconds: r.ms / 1000,
    })),
    domains: report.domains.map(({ info: _info, ...rest }) => rest),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iq-test-results-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clamp(iq: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, iq));
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
