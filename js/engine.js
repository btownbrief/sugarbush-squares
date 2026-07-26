// SUGARBUSH SQUARES — pure Dots and Boxes rules. A Btown Games production.
//
// THE ONE NON-NEGOTIABLE: everything in this file is a pure function over a
// plain JSON-serializable state object. No DOM, no timers, no Date, no
// Math.random, no imports. Online multiplayer will later sync this exact
// state object between phones, so any rule logic outside this file breaks
// that plan. The whole game must survive JSON.stringify → JSON.parse → resume.
//
// The board is a grid of `rows` × `cols` BOXES (plots). Dots sit at the
// corners, so there are (rows+1) × (cols+1) dots. Players alternate drawing
// one edge between two adjacent dots; finishing the fourth side of a plot
// claims it AND grants another turn. Most plots when every edge is drawn wins.
//
// State shape: { rows, cols, h, v, boxes, turn }
//   rows, cols — plots down / across (default 5 × 5)
//   h — flat array of horizontal edges, (rows+1) rows of `cols` each:
//       h[r * cols + c] is the edge along the TOP of plot (r, c)
//       (row `rows` is the board's bottom rim). 0 = undrawn, else 1|2 = who drew it.
//   v — flat array of vertical edges, `rows` rows of (cols+1) each:
//       v[r * (cols+1) + c] is the edge along the LEFT of plot (r, c)
//       (column `cols` is the right rim). 0 = undrawn, else 1|2.
//   boxes — flat rows × cols plot owners, 0 = unclaimed, else 1|2
//   turn — whose tap it is next, 1 or 2
//
// A move is { o, r, c }: o is 'h' or 'v', r/c index into that edge grid.

export const EMPTY = 0;
export const RED = 1;
export const BLUE = 2;

/** A fresh sugarbush. Options: { rows, cols, firstPlayer } — all optional. */
export function createInitialState(options = {}) {
  const rows = options.rows ?? 5;
  const cols = options.cols ?? 5;
  const firstPlayer = options.firstPlayer ?? RED;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('rows and cols must be positive integers.');
  }
  if (firstPlayer !== RED && firstPlayer !== BLUE) {
    throw new Error(`First player must be ${RED} (red) or ${BLUE} (blue).`);
  }
  return {
    rows,
    cols,
    h: new Array((rows + 1) * cols).fill(EMPTY),
    v: new Array(rows * (cols + 1)).fill(EMPTY),
    boxes: new Array(rows * cols).fill(EMPTY),
    turn: firstPlayer,
  };
}

/** Every undrawn edge, as { o, r, c } moves. Empty once the game is over. */
export function legalMoves(state) {
  const moves = [];
  for (let r = 0; r <= state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.h[r * state.cols + c] === EMPTY) moves.push({ o: 'h', r, c });
    }
  }
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c <= state.cols; c++) {
      if (state.v[r * (state.cols + 1) + c] === EMPTY) moves.push({ o: 'v', r, c });
    }
  }
  return moves;
}

/** The player (1|2) who drew this edge, or 0 if it's still open. */
export function edgeOwner(state, move) {
  return state[move.o][edgeIndex(state, move)];
}

/**
 * Draw the current player's edge. Returns a NEW state — the input is never
 * mutated. Completing a plot claims it for the mover and keeps the turn
 * (one edge can finish two plots at once: both claimed, still one extra
 * turn). Throws on an edge that's off the board or already drawn.
 */
export function applyMove(state, move) {
  const idx = edgeIndex(state, move); // throws on a bad move
  if (state[move.o][idx] !== EMPTY) {
    throw new Error(`That sap line is already tapped (${move.o} ${move.r},${move.c}).`);
  }
  const player = state.turn;
  const next = {
    rows: state.rows,
    cols: state.cols,
    h: state.h.slice(),
    v: state.v.slice(),
    boxes: state.boxes.slice(),
    turn: state.turn,
  };
  next[move.o][idx] = player;

  let claimed = 0;
  for (const { r, c } of adjacentBoxes(state, move)) {
    if (boxSides(next, r, c) === 4) {
      next.boxes[r * next.cols + c] = player;
      claimed++;
    }
  }
  if (claimed === 0) next.turn = player === RED ? BLUE : RED;
  return next;
}

/** How many of plot (r, c)'s four sides are drawn (0–4). */
export function boxSides(state, r, c) {
  let n = 0;
  if (state.h[r * state.cols + c] !== EMPTY) n++; // top
  if (state.h[(r + 1) * state.cols + c] !== EMPTY) n++; // bottom
  if (state.v[r * (state.cols + 1) + c] !== EMPTY) n++; // left
  if (state.v[r * (state.cols + 1) + c + 1] !== EMPTY) n++; // right
  return n;
}

/** The one or two plots an edge borders, as [{ r, c }, ...]. */
export function adjacentBoxes(state, move) {
  const plots = [];
  if (move.o === 'h') {
    if (move.r > 0) plots.push({ r: move.r - 1, c: move.c }); // plot above
    if (move.r < state.rows) plots.push({ r: move.r, c: move.c }); // plot below
  } else {
    if (move.c > 0) plots.push({ r: move.r, c: move.c - 1 }); // plot to the left
    if (move.c < state.cols) plots.push({ r: move.r, c: move.c }); // plot to the right
  }
  return plots;
}

/** How many plots this move would finish for the mover right now (0, 1 or 2). */
export function boxesCompletedBy(state, move) {
  if (edgeOwner(state, move) !== EMPTY) return 0;
  let n = 0;
  for (const { r, c } of adjacentBoxes(state, move)) {
    if (boxSides(state, r, c) === 3) n++;
  }
  return n;
}

/**
 * Where the game stands:
 *   { over, turn, scores, winner, draw, remaining }
 *   over      — true once every edge is drawn
 *   turn      — whose tap is next (1|2), or null when over
 *   scores    — { 1: plots, 2: plots } claimed so far
 *   winner    — 1|2 once over (most plots), or null (including a tie)
 *   draw      — true only when over with equal plots
 *   remaining — unclaimed plots left on the board
 */
export function getStatus(state) {
  let red = 0;
  let blue = 0;
  for (const owner of state.boxes) {
    if (owner === RED) red++;
    else if (owner === BLUE) blue++;
  }
  const remaining = state.rows * state.cols - red - blue;
  const over = remaining === 0;
  const winner = over && red !== blue ? (red > blue ? RED : BLUE) : null;
  return {
    over,
    turn: over ? null : state.turn,
    scores: { [RED]: red, [BLUE]: blue },
    winner,
    draw: over && red === blue,
    remaining,
  };
}

// Flat index of a move into state.h or state.v; throws if it's off the board.
function edgeIndex(state, move) {
  if (!move || (move.o !== 'h' && move.o !== 'v')) {
    throw new Error('A move looks like { o: "h"|"v", r, c }.');
  }
  const { o, r, c } = move;
  if (!Number.isInteger(r) || !Number.isInteger(c)) {
    throw new Error('Edge coordinates must be integers.');
  }
  if (o === 'h') {
    if (r < 0 || r > state.rows || c < 0 || c >= state.cols) {
      throw new Error(`No horizontal edge at ${r},${c} on this board.`);
    }
    return r * state.cols + c;
  }
  if (r < 0 || r >= state.rows || c < 0 || c > state.cols) {
    throw new Error(`No vertical edge at ${r},${c} on this board.`);
  }
  return r * (state.cols + 1) + c;
}
