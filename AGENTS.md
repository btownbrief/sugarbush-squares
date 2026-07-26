# Sugarbush Squares — agent instructions

Shared brain for any AI agent working in this repo (Codex, Claude Code, etc.).
Read `README.md` first for the architecture — this file adds the rules an agent
needs. Stephen is non-technical — explain consequential changes in plain
language.

## What this is

Btown's Dots and Boxes: run sap lines between the taps and claim plots in a
Vermont sugarbush. Plain static site, **no build step**: `index.html` +
`style.css` + ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push. No backend, no accounts, no analytics.

## The one non-negotiable

Every game rule lives in `js/engine.js` as pure functions over a plain
JSON-serializable state object. `engine.js` imports nothing and never touches
the DOM, timers, `Date`, or `Math.random`. `applyMove` returns a **new** state.
Online multiplayer will later sync this exact state object between phones —
rule logic anywhere else (main.js, bot.js) breaks that plan. `js/bot.js` may
only call the engine's public API; `js/main.js` is UI only.

## UI rules worth keeping

Edges are thin, so `main.js` never uses skinny hitboxes: it snaps the finger
to the nearest open edge (within ~44% of a cell) and previews the line before
release commits it. Keep that behavior — it is the whole reason the game feels
good on a phone. Keep the board a crisp, readable 2D map: juice is welcome,
literal 3D is not.

## Before you finish

Run `node scripts/test-engine.mjs` — it must pass. If you touched the UI,
playtest a full game at a phone-sized viewport (including a bot game and one
double-claim), or clearly say you couldn't and what you inspected instead.
Say what you verified.
