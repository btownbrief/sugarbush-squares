// SUGARBUSH SQUARES — UI only. A Btown Games production for the BTown Brief.
//
// This file renders state, animates sap lines and sprouting maples, and
// dispatches moves. Every rule lives in js/engine.js and every bot decision
// in js/bot.js — if you're tempted to check for a completed plot here, stop
// and use the engine's getStatus()/boxesCompletedBy() instead.

import {
  RED, BLUE, createInitialState, legalMoves, applyMove, getStatus,
  boxesCompletedBy, adjacentBoxes, boxSides,
} from './engine.js';
import { chooseMove } from './bot.js';
import { sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const menuEl = $('menu');
const gameEl = $('game');
const boardEl = $('board');
const turnChip = $('turnChip');
const tallyEl = $('tally');
const resultBar = $('resultbar');
const resultText = $('resultText');
const goAgainEl = $('goAgain');
const scoreEls = { [RED]: $('scoreRed'), [BLUE]: $('scoreBlue') };

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------- copy desk */

const BOT_NAMES = { hauler: 'HAULER', boiler: 'BOILER' };
const THINKING = {
  hauler: 'THE HAULER LUGS A BUCKET…',
  boiler: 'THE BOILER STOKES THE FIRE…',
};
const WIN_LINES = {
  pass: ["'S PLOTS RUN SWEETEST!", ' TAPS THE WHOLE HILLSIDE!'],
  you: ['YOU OUT-SUGAR THE ', 'SWEET! YOU BEAT THE '],
  bot: { hauler: 'THE HAULER OUT-HAULS YOU', boiler: 'THE BOILER BOILS YOU DOWN' },
};

/* ------------------------------------------------------------- geometry */

const CELL = 100; // SVG units per plot
const PAD = 34; // parchment margin around the outer dots

let geom = null; // rebuilt per game: { w, h, dotX(c), dotY(r) }

function edgeEnds(m) {
  const x1 = PAD + m.c * CELL;
  const y1 = PAD + m.r * CELL;
  return m.o === 'h'
    ? { x1, y1, x2: x1 + CELL, y2: y1 }
    : { x1, y1, x2: x1, y2: y1 + CELL };
}

function edgeKey(m) {
  return `${m.o}${m.r},${m.c}`;
}

/* ------------------------------------------------------------- game shell */

let mode = 'pass'; // 'pass' | 'hauler' | 'boiler'
let size = 5;
let state = createInitialState();
let busy = false; // an animation or bot think is in flight
let botTimer = 0;
let firstPlayer = RED;
let tally = { red: 0, blue: 0, quiet: 0 };

let svg = null;
let layers = null; // { fills, ghosts, saps, trees, dots, fx, preview }
let previewMove = null;

document.querySelectorAll('.size-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    size = Number(btn.dataset.size);
  });
});
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => startMatch(btn.dataset.mode));
});
$('backBtn').addEventListener('click', backToSugarhouse);
$('rematchBtn').addEventListener('click', newGame);
$('mute').addEventListener('click', () => {
  $('mute').textContent = sound.toggleMuted() ? '🔇' : '🔊';
});
$('mute').textContent = sound.muted ? '🔇' : '🔊';

startFlurry();

function startMatch(chosen) {
  mode = chosen;
  tally = { red: 0, blue: 0, quiet: 0 };
  firstPlayer = RED; // the human (or red sugarmaker) opens the first game
  menuEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  newGame();
}

function backToSugarhouse() {
  clearTimeout(botTimer);
  busy = false;
  gameEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
}

function newGame() {
  clearTimeout(botTimer);
  state = createInitialState({ rows: size, cols: size, firstPlayer });
  busy = false;
  previewMove = null;
  resultBar.classList.add('hidden');
  buildBoard();
  renderScores();
  renderTally();
  renderTurn();
  if (isBotsTurn()) scheduleBotMove();
}

/* ------------------------------------------------------------- the board */

function buildBoard() {
  geom = {
    w: PAD * 2 + state.cols * CELL,
    h: PAD * 2 + state.rows * CELL,
  };
  boardEl.innerHTML = '';
  svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${geom.w} ${geom.h}`);
  svg.classList.add('plot-map');

  // Parchment with a soft top-light and a worn border.
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = `
    <radialGradient id="parchLight" cx="0.5" cy="0.28" r="0.95">
      <stop offset="0" stop-color="#f7edd2"/>
      <stop offset="0.65" stop-color="#f2e7cb"/>
      <stop offset="1" stop-color="#e2d0a8"/>
    </radialGradient>
    <linearGradient id="canopyA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fb35c"/><stop offset="1" stop-color="#6a8f42"/>
    </linearGradient>
    <linearGradient id="canopyB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a3bd62"/><stop offset="1" stop-color="#7fa650"/>
    </linearGradient>
    <linearGradient id="canopyC" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7ca253"/><stop offset="1" stop-color="#5c7d3a"/>
    </linearGradient>`;
  svg.appendChild(defs);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', 4);
  bg.setAttribute('y', 4);
  bg.setAttribute('width', geom.w - 8);
  bg.setAttribute('height', geom.h - 8);
  bg.setAttribute('rx', 20);
  bg.setAttribute('fill', 'url(#parchLight)');
  bg.setAttribute('stroke', '#c9ae7d');
  bg.setAttribute('stroke-width', 3);
  svg.appendChild(bg);
  const bgInner = document.createElementNS(SVG_NS, 'rect');
  bgInner.setAttribute('x', 11);
  bgInner.setAttribute('y', 11);
  bgInner.setAttribute('width', geom.w - 22);
  bgInner.setAttribute('height', geom.h - 22);
  bgInner.setAttribute('rx', 14);
  bgInner.setAttribute('fill', 'none');
  bgInner.setAttribute('stroke', 'rgba(139, 106, 60, 0.28)');
  bgInner.setAttribute('stroke-width', 1.5);
  bgInner.setAttribute('stroke-dasharray', '2 6');
  svg.appendChild(bgInner);

  layers = {};
  for (const name of ['fills', 'ghosts', 'saps', 'trees', 'dots', 'fx', 'preview']) {
    layers[name] = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(layers[name]);
  }

  // Plot fill rects, keyed for claim animation.
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', PAD + c * CELL + 6);
      rect.setAttribute('y', PAD + r * CELL + 6);
      rect.setAttribute('width', CELL - 12);
      rect.setAttribute('height', CELL - 12);
      rect.setAttribute('rx', 10);
      rect.classList.add('plot-fill');
      rect.dataset.plot = `${r},${c}`;
      layers.fills.appendChild(rect);
    }
  }

  // Ghost lines for every undrawn edge.
  for (const m of legalMoves(state)) {
    const { x1, y1, x2, y2 } = edgeEnds(m);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', m.o === 'h' ? x1 + 14 : x1);
    line.setAttribute('y1', m.o === 'v' ? y1 + 14 : y1);
    line.setAttribute('x2', m.o === 'h' ? x2 - 14 : x2);
    line.setAttribute('y2', m.o === 'v' ? y2 - 14 : y2);
    line.classList.add('ghost-edge');
    line.dataset.edge = edgeKey(m);
    layers.ghosts.appendChild(line);
  }

  // The taps: one dot per grid corner, with a little shine.
  for (let r = 0; r <= state.rows; r++) {
    for (let c = 0; c <= state.cols; c++) {
      const x = PAD + c * CELL;
      const y = PAD + r * CELL;
      for (const [cls, dx, dy, rad] of [
        ['dot-shadow', 1.5, 3, 8.5],
        ['dot', 0, 0, 8.5],
        ['dot-shine', -2, -2.5, 3],
      ]) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x + dx);
        dot.setAttribute('cy', y + dy);
        dot.setAttribute('r', rad);
        dot.classList.add(cls);
        layers.dots.appendChild(dot);
      }
    }
  }

  svg.addEventListener('pointerdown', onPointer);
  svg.addEventListener('pointermove', onPointer);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointerleave', clearPreview);
  boardEl.appendChild(svg);
}

/* ---------------------------------------------------- fat-finger targeting */
// No skinny hitboxes: we take the finger's position and snap to the nearest
// open sap line within almost half a plot. Press shows a preview; release
// commits whatever line is previewed.

function svgPoint(ev) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * geom.w,
    y: ((ev.clientY - rect.top) / rect.height) * geom.h,
  };
}

function distToSegment(p, { x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

function nearestOpenEdge(ev) {
  const p = svgPoint(ev);
  let best = null;
  let bestDist = CELL * 0.44; // generous reach, but never ambiguous
  for (const m of legalMoves(state)) {
    const d = distToSegment(p, edgeEnds(m));
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

function onPointer(ev) {
  if (busy || isBotsTurn() || getStatus(state).over) return;
  // Preview under a pressed finger (or a hovering mouse).
  if (ev.buttons === 0 && ev.pointerType !== 'mouse') return;
  const m = nearestOpenEdge(ev);
  if (m && previewMove && edgeKey(m) === edgeKey(previewMove)) return;
  clearPreview();
  if (!m) return;
  previewMove = m;
  const { x1, y1, x2, y2 } = edgeEnds(m);
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.classList.add('preview-edge', state.turn === RED ? 'red' : 'blue');
  layers.preview.appendChild(line);
}

function onPointerUp(ev) {
  if (busy || isBotsTurn() || getStatus(state).over) return;
  const m = nearestOpenEdge(ev) ?? previewMove;
  clearPreview();
  if (m) playMove(m);
}

function clearPreview() {
  previewMove = null;
  layers.preview.innerHTML = '';
}

/* ------------------------------------------------------------- turns */

function isBotsTurn() {
  return mode !== 'pass' && !getStatus(state).over && state.turn === BLUE;
}

function scheduleBotMove() {
  busy = true;
  renderTurn();
  // A human-ish pause — even the Boiler wipes its brow between lines.
  const pause = 380 + Math.random() * 420;
  botTimer = setTimeout(() => {
    playMove(chooseMove(state, mode));
  }, pause);
}

function playMove(move) {
  busy = true;
  const player = state.turn;
  // Plots this line will finish: adjacent and already at three sides.
  const claimed = boxesCompletedBy(state, move) > 0
    ? adjacentBoxes(state, move).filter(({ r, c }) => boxSides(state, r, c) === 3)
    : [];
  state = applyMove(state, move);

  drawSapLine(player, move, () => {
    if (claimed.length > 0) {
      sound.pop(claimed.length);
      for (const { r, c } of claimed) claimPlot(player, r, c);
      renderScores();
      bumpScore(player);
    }
    const status = getStatus(state);
    if (status.over) {
      finishGame(status);
      return;
    }
    if (claimed.length > 0 && state.turn === player) {
      sound.again();
      flashGoAgain();
    }
    busy = false;
    renderTurn();
    if (isBotsTurn()) scheduleBotMove();
  });
}

/* ------------------------------------------------------------- rendering */

function drawSapLine(player, move, onDone) {
  const ghost = layers.ghosts.querySelector(`[data-edge="${CSS.escape(edgeKey(move))}"]`);
  if (ghost) ghost.remove();

  const { x1, y1, x2, y2 } = edgeEnds(move);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.classList.add('sap-edge', player === RED ? 'red' : 'blue');
  layers.saps.appendChild(line);

  // A thin amber core: sap running inside the line.
  const core = document.createElementNS(SVG_NS, 'line');
  core.setAttribute('x1', x1);
  core.setAttribute('y1', y1);
  core.setAttribute('x2', x2);
  core.setAttribute('y2', y2);
  core.classList.add('sap-core');
  layers.saps.appendChild(core);

  sound.tap();

  if (reducedMotion || !line.animate) {
    onDone();
    return;
  }

  const D = 330;
  for (const [el, delay] of [[line, 0], [core, 90]]) {
    el.setAttribute('stroke-dasharray', String(len));
    el.setAttribute('stroke-dashoffset', String(len));
    el.animate(
      [{ strokeDashoffset: `${len}px` }, { strokeDashoffset: '0px' }],
      { duration: D, delay, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' }
    );
    setTimeout(() => el.setAttribute('stroke-dashoffset', '0'), D + delay + 40);
  }

  // The traveling sap bead.
  const bead = document.createElementNS(SVG_NS, 'circle');
  bead.setAttribute('cx', x1);
  bead.setAttribute('cy', y1);
  bead.setAttribute('r', 7);
  bead.setAttribute('fill', '#f5b954');
  bead.setAttribute('opacity', '0.95');
  layers.fx.appendChild(bead);
  bead.animate(
    [
      { transform: 'translate(0, 0)', opacity: 1 },
      { transform: `translate(${x2 - x1}px, ${y2 - y1}px)`, opacity: 0.9 },
    ],
    { duration: D + 60, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' }
  ).onfinish = () => bead.remove();

  // Never let a throttled animation stall the game.
  setTimeout(onDone, D + 110);
}

function claimPlot(player, r, c) {
  const fill = layers.fills.querySelector(`[data-plot="${CSS.escape(`${r},${c}`)}"]`);
  if (fill) fill.classList.add(player === RED ? 'red' : 'blue');
  sproutMaple(player, r, c);
  burst(player, r, c);
}

// A little maple sprouts in the plot, with the claimer's bucket on the trunk.
function sproutMaple(player, r, c) {
  const cx = PAD + c * CELL + CELL / 2;
  const groundY = PAD + r * CELL + CELL * 0.8;
  const bucket = player === RED ? '#c8442c' : '#3d7ea6';
  const bucketDark = player === RED ? '#96301e' : '#2a5f80';
  const canopy = ['canopyA', 'canopyB', 'canopyC'][Math.floor(Math.random() * 3)];
  const lean = (Math.random() * 8 - 4).toFixed(1);
  const grow = (0.92 + Math.random() * 0.14).toFixed(2);

  const g = document.createElementNS(SVG_NS, 'g');
  g.innerHTML = `
    <ellipse cx="0" cy="1" rx="24" ry="5" fill="rgba(58, 42, 29, 0.18)"/>
    <path d="M-3.5 2 L-2.5 -26 L2.5 -26 L3.5 2 Z" fill="#6b4a33"/>
    <path d="M-1.2 -6 L-1.2 -24" stroke="#54371f" stroke-width="1.4"/>
    <g>
      <ellipse cx="-11" cy="-34" rx="14" ry="12" fill="url(#${canopy})"/>
      <ellipse cx="11" cy="-35" rx="14" ry="12.5" fill="url(#${canopy})"/>
      <ellipse cx="0" cy="-44" rx="16" ry="13.5" fill="url(#${canopy})"/>
      <ellipse cx="-5" cy="-38" rx="6" ry="4.5" fill="rgba(246, 238, 217, 0.16)"/>
    </g>
    <path d="M3 -18 L10 -18" stroke="${bucketDark}" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 -18 L13 -18 L12 -8 L7 -8 Z" fill="${bucket}"/>
    <path d="M5.4 -19.3 H13.7 V-17 H5.4 Z" fill="${bucketDark}"/>
    <circle cx="9.5" cy="-15.5" r="1.1" fill="#f5b954"/>`;
  g.setAttribute('transform', `translate(${cx}, ${groundY})`);
  layers.trees.appendChild(g);

  // Grow from the roots: CSS transforms on SVG scale about the viewBox
  // origin unless we anchor them to the element's own box.
  const inner = document.createElementNS(SVG_NS, 'g');
  while (g.firstChild) inner.appendChild(g.firstChild);
  g.appendChild(inner);
  inner.style.transformBox = 'fill-box';
  inner.style.transformOrigin = '50% 100%';
  inner.style.transform = `rotate(${lean}deg) scale(${grow})`;

  if (!reducedMotion && inner.animate) {
    inner.animate(
      [
        { transform: `rotate(${lean}deg) scale(0)` },
        { transform: `rotate(${lean}deg) scale(${Number(grow) * 1.14})`, offset: 0.62 },
        { transform: `rotate(${lean}deg) scale(${Number(grow) * 0.96})`, offset: 0.82 },
        { transform: `rotate(${lean}deg) scale(${grow})` },
      ],
      { duration: 520, easing: 'cubic-bezier(0.34, 1.3, 0.5, 1)' }
    );
  }
}

// A quick ring of light where a plot is claimed.
function burst(player, r, c) {
  if (reducedMotion) return;
  const cx = PAD + c * CELL + CELL / 2;
  const cy = PAD + r * CELL + CELL / 2;
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', cx);
  ring.setAttribute('cy', cy);
  ring.setAttribute('r', 12);
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', player === RED ? '#c8442c' : '#3d7ea6');
  ring.setAttribute('stroke-width', 5);
  layers.fx.appendChild(ring);
  if (!ring.animate) {
    ring.remove();
    return;
  }
  ring.animate(
    [
      { r: '12px', opacity: 0.9, strokeWidth: '6px' },
      { r: `${CELL * 0.52}px`, opacity: 0, strokeWidth: '1.5px' },
    ],
    { duration: 480, easing: 'ease-out' }
  ).onfinish = () => ring.remove();
}

function flashGoAgain() {
  goAgainEl.classList.add('hidden');
  void goAgainEl.offsetWidth; // restart the animation on back-to-back claims
  goAgainEl.classList.remove('hidden');
}

function renderScores() {
  const status = getStatus(state);
  const total = state.rows * state.cols;
  for (const p of [RED, BLUE]) {
    const el = scoreEls[p];
    el.querySelector('.s-count').textContent = status.scores[p];
    // The bucket fills with sap as your share of the sugarbush grows.
    const frac = status.scores[p] / total;
    const sap = el.querySelector('.b-sap');
    sap.setAttribute('y', String(40 - 30 * Math.min(1, frac * 2)));
  }
  if (mode !== 'pass') {
    scoreEls[RED].querySelector('.s-name').textContent = 'YOU';
    scoreEls[BLUE].querySelector('.s-name').textContent = BOT_NAMES[mode];
  } else {
    scoreEls[RED].querySelector('.s-name').textContent = 'RED';
    scoreEls[BLUE].querySelector('.s-name').textContent = 'BLUE';
  }
}

function bumpScore(player) {
  const el = scoreEls[player];
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function renderTurn() {
  const status = getStatus(state);
  scoreEls[RED].classList.toggle('active', status.turn === RED);
  scoreEls[BLUE].classList.toggle('active', status.turn === BLUE);
  if (status.over) {
    turnChip.className = '';
    turnChip.textContent = '';
    return;
  }
  const red = status.turn === RED;
  turnChip.className = red ? 'red' : 'blue';
  if (mode === 'pass') {
    turnChip.textContent = red ? "RED'S TAP" : "BLUE'S TAP";
  } else if (red) {
    turnChip.textContent = 'YOUR TAP';
  } else {
    turnChip.textContent = THINKING[mode];
    turnChip.classList.add('thinking');
  }
}

function renderTally() {
  const quiet = tally.quiet ? ` · ${tally.quiet} split` : '';
  if (mode === 'pass') {
    tallyEl.innerHTML =
      `<span class="t-red">RED ${tally.red}</span> — ` +
      `<span class="t-blue">${tally.blue} BLUE</span>${quiet}`;
  } else {
    tallyEl.innerHTML =
      `<span class="t-red">YOU ${tally.red}</span> — ` +
      `<span class="t-blue">${tally.blue} ${BOT_NAMES[mode]}</span>${quiet}`;
  }
}

/* ------------------------------------------------------------- endgame */

function finishGame(status) {
  renderTurn();
  let text = '';
  let cls = '';
  const score = `${status.scores[RED]}–${status.scores[BLUE]}`;
  if (status.draw) {
    tally.quiet++;
    text = `AN EVEN SPLIT — ${score}`;
    sound.draw();
    firstPlayer = firstPlayer === RED ? BLUE : RED;
  } else if (status.winner === RED) {
    tally.red++;
    cls = 'red-win';
    text = mode === 'pass'
      ? `RED${WIN_LINES.pass[Math.floor(Math.random() * WIN_LINES.pass.length)]} ${score}`
      : `${WIN_LINES.you[Math.floor(Math.random() * WIN_LINES.you.length)]}${BOT_NAMES[mode]}! ${score}`;
    sound.win();
    firstPlayer = BLUE; // loser opens the next boil
  } else {
    tally.blue++;
    cls = 'blue-win';
    if (mode === 'pass') {
      text = `BLUE${WIN_LINES.pass[Math.floor(Math.random() * WIN_LINES.pass.length)]} ${score}`;
      sound.win();
    } else {
      text = `${WIN_LINES.bot[mode]} ${score}`;
      sound.lose();
    }
    firstPlayer = RED;
  }
  renderTally();
  resultText.textContent = text;
  resultText.className = cls;
  // Let the last claim land before the banner rises.
  setTimeout(() => resultBar.classList.remove('hidden'), 600);
}

/* ------------------------------------------------------------- flurry */
// A dozen drifting flakes and petals, randomized once at load.

function startFlurry() {
  if (reducedMotion) return;
  const holder = $('flurry');
  const shapes = [
    // late snow
    '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.4" fill="rgba(255,255,255,0.75)"/></svg>',
    // a tiny maple leaf
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1 L8.4 4.2 L11.6 3.4 L9.8 6.2 L13 7.6 L9.6 8.4 L10 11.6 L7 9.6 L4 11.6 L4.4 8.4 L1 7.6 L4.2 6.2 L2.4 3.4 L5.6 4.2 Z" fill="rgba(200, 96, 44, 0.55)"/></svg>',
    // a bud petal
    '<svg width="8" height="8" viewBox="0 0 8 8"><ellipse cx="4" cy="4" rx="3" ry="2" fill="rgba(232, 163, 61, 0.5)"/></svg>',
  ];
  for (let i = 0; i < 12; i++) {
    const flake = document.createElement('div');
    flake.className = 'flake';
    flake.innerHTML = shapes[i % shapes.length];
    flake.style.left = `${Math.random() * 100}%`;
    flake.style.animationDuration = `${9 + Math.random() * 10}s`;
    flake.style.animationDelay = `${-Math.random() * 18}s`;
    holder.appendChild(flake);
  }
}
