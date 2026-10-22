# Cognitive Ability Assessment

A free adaptive IQ test. Questions, scoring, and results all run in the browser. Nothing is sent to a server. The live site is [https://codenameyau.github.io/iq-test/](https://codenameyau.github.io/iq-test/). Open the built `index.html` to take it offline.

- Three lengths: Quick (20 min), Standard (40 min), Comprehensive (60 min), plus an optional nonverbal version.
- Five sections: Matrix Reasoning, Verbal Reasoning, Spatial Reasoning, Quantitative Reasoning, Working Memory.
- Computerised adaptive testing with a 3PL item response model; scores reported on the IQ scale (mean 100, SD 15) with 95% confidence intervals, index scores, a per-question-type breakdown and validity checks.
- Questions are procedurally generated per session from a random seed, and items seen in earlier sessions on the same device are avoided.

## Take the test

Requires Node 20+ only to build. The finished page does not need a server.

```sh
npm install
npm test
npm run build
open dist/index.html
```

`npm run dev` serves a live copy at http://localhost:5173 while you work on the source. `preview.html` (dev server only) shows an item gallery, e.g. `/preview.html?d=spatial`, and a simulated results page, `/preview.html?d=results&theta=1`.

## GitHub

`.github/workflows/ci.yml` runs the tests, typecheck, and production build on every pull request and push.

## Accuracy caveat

Item difficulties are set from the features known to drive difficulty for each question type, not estimated from a normed sample of test-takers. The scoring pipeline is validated by simulation (`src/core/simulation.test.ts`), but the absolute scale has not been normed against a representative population, so results are estimates rather than clinical scores.
