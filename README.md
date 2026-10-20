# Cognitive Ability Assessment

An adaptive IQ test. Questions are generated in the browser, and in-progress answers stay in `localStorage`. Submitting the final form sends your details, overall score, and score breakdown to the server. Individual questions and answers are not sent.

- Three lengths: Quick (20 min), Standard (40 min), Comprehensive (60 min), plus an optional nonverbal version.
- Five timed sections: Matrix Reasoning, Verbal Reasoning, Spatial Reasoning, Quantitative Reasoning, Working Memory.
- Computerised adaptive testing with a 3PL item response model; scores reported on the IQ scale (mean 100, SD 15) with 95% confidence intervals, index scores, a per-question-type breakdown and validity checks.
- Questions are procedurally generated per session from a random seed, and items seen in earlier sessions on the same device are avoided.

## Run locally

Requires Node 20+ and the Postgres already listening on this machine (port 5442).

```sh
cp .env.example .env
npm install
npm run server     # creates the `iq` database if needed, then listens on :3300
npm run dev        # http://localhost:5173 — proxies /api to that server
npm test
```

`preview.html` (dev server only) shows an item gallery, e.g. `/preview.html?d=spatial`, and a simulated results page, `/preview.html?d=results&theta=1`.

The same process runs on the home server as its own container, `iq-test-web`, using that machine's Postgres. It does not join any other application's stack. `docker compose up -d --build` from this directory does that when `.env` points at `127.0.0.1:5432/iq`.

## GitHub

`.github/workflows/ci.yml` runs the tests and the production build on every pull request and push. A push to `master` also publishes `ghcr.io/codenameyau/iq-test` and rolls that image out over SSH.

The production environment needs `DEPLOY_SSH_HOSTNAME`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and `DATABASE_URL`.

## Accuracy caveat

Item difficulties are set from the features known to drive difficulty for each question type, not estimated from a normed sample of test-takers. The scoring pipeline is validated by simulation (`src/core/simulation.test.ts`), but the absolute scale has not been normed against a representative population, so results are estimates rather than clinical scores.
