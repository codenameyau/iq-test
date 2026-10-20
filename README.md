# Cognitive Ability Assessment

An adaptive, timed IQ test that runs entirely in the browser. There is no backend: questions are generated on the device, and progress and results are stored in `localStorage`.

- Three lengths: Quick (20 min), Standard (40 min), Comprehensive (60 min), plus an optional nonverbal version.
- Five timed sections: Matrix Reasoning, Verbal Reasoning, Spatial Reasoning, Quantitative Reasoning, Working Memory.
- Computerised adaptive testing with a 3PL item response model; scores reported on the IQ scale (mean 100, SD 15) with 95% confidence intervals, index scores, a per-question-type breakdown and validity checks.
- Questions are procedurally generated per session from a random seed, and items seen in earlier sessions on the same device are avoided.

## Run locally

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + scoring simulation
```

`preview.html` (dev server only) shows an item gallery, e.g. `/preview.html?d=spatial`, and a simulated results page, `/preview.html?d=results&theta=1`.

## Deploy

```sh
npm run build      # outputs static files to dist/
```

Upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3). Asset paths are relative, so it also works from a sub-path.

## Accuracy caveat

Item difficulties are set from the features known to drive difficulty for each question type, not estimated from a normed sample of test-takers. The scoring pipeline is validated by simulation (`src/core/simulation.test.ts`), but the absolute scale has not been normed against a representative population, so results are estimates rather than clinical scores.
