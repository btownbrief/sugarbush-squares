# SUGARBUSH SQUARES 🍁🪣

Dots and Boxes, Burlington style: run **sap lines** between the taps and
claim plots in the sugarbush. Close the fourth side of a plot and a little
maple sprouts with your bucket on it — and you go again. Most plots when
every line is run wins the boil. A game for
[Btown Games](https://play.btownbrief.com/), the browser arcade of the
[BTown Brief](https://www.btownbrief.com).

**Play it live:** https://play.btownbrief.com/sugarbush-squares/

## How to play

Tap between two dots to run a sap line (press and slide to preview — your
line snaps to the nearest open spot before you let go). Finish the fourth
side of a plot and it's yours: the plot sprouts a maple, your bucket fills,
and **you keep the turn**. Chains of claims are the whole strategy — give
away one plot carelessly and a good rival will take the whole row.

## Boards & modes

- **3×3 quick tap** · **5×5 the sugarbush** (default) · **7×7 full season**
  — every board has an odd number of plots, so a boil can't end in a tie.
- **Pass & play** — two sugarmakers, one phone.
- **Sap Hauler** 🪣 — takes any free plot and won't hand you one while a
  safe line exists, but can't see chains. Beatable once you can.
- **The Boiler** 🔥 — counts chains, opens the cheapest one when forced,
  and knows the double-cross: it will leave you two plots to keep control
  of the endgame. Bring your best.

## How it works

Plain static site — no build step, no frameworks, no npm. `index.html` +
`style.css` + ES modules in `js/`:

| file | what it does |
| --- | --- |
| `js/engine.js` | **all** the Dots and Boxes rules, as pure functions over a plain JSON state object — see the rule below |
| `js/bot.js` | the Sap Hauler and the Boiler; only ever calls the engine's public API |
| `js/main.js` | UI only: builds the board SVG, animates sap lines / sprouting maples, dispatches moves, keeps the session tally |
| `js/audio.js` | procedural WebAudio taps, pops and fanfares, no audio files |
| `js/leaderboard.js` | monthly leaderboard client (Supabase); vs-bot wins only, no accounts |

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## The engine rule (the one non-negotiable)

Online multiplayer gets bolted on later by syncing the engine's state object
between phones. That only works if **every** rule lives in `js/engine.js`:

- `createInitialState(options)`, `legalMoves(state)`, `applyMove(state, move)`
  (returns a NEW state, never mutates), `getStatus(state)`.
- A move is `{ o: 'h'|'v', r, c }` — which edge grid, row, column.
- `engine.js` imports nothing and never touches the DOM, timers, `Date`, or
  `Math.random`.
- The whole game survives `JSON.stringify` → `JSON.parse` → resume.

If you add a rule anywhere else, you've broken the multiplayer plan.

## Testing

```bash
node scripts/test-engine.mjs
```

Plain Node, no test framework. Covers plot completion (including one line
finishing two plots at once), the extra-turn rule, endgame counting, draws,
illegal moves, immutability, the JSON round trip — and the bots: the Hauler
never gives a plot away while a safe line exists, and the Boiler takes whole
chains, opens the shortest chain when forced, and wins a crafted endgame
with the double-cross.

## Regenerating the app icon

`icon-180.png` is rendered from `icon.svg`:

```bash
chrome --headless --screenshot=icon-180.png --window-size=180,180 --default-background-color=00000000 "file://$(pwd)/icon.svg"
```
