// SUGARBUSH SQUARES — engine + bot checks. Plain Node, no test framework.
// Run with:  node scripts/test-engine.mjs

import {
  RED, BLUE, createInitialState, legalMoves, applyMove, getStatus,
  boxSides, boxesCompletedBy, edgeOwner,
} from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;

function assert(condition, label) {
  if (!condition) {
    console.error(`✗ FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}

const H = (r, c) => ({ o: 'h', r, c });
const V = (r, c) => ({ o: 'v', r, c });

/** Play a list of moves from a fresh board (extra turns handled by the engine). */
function play(moves, options) {
  let state = createInitialState(options);
  for (const m of moves) state = applyMove(state, m);
  return state;
}

/** All four edges of plot (r, c), for building positions. */
function ring(r, c) {
  return [H(r, c), H(r + 1, c), V(r, c), V(r, c + 1)];
}

/* ---------------------------------------------------------- basics */

{
  const s = createInitialState();
  const st = getStatus(s);
  assert(s.rows === 5 && s.cols === 5, 'default board is 5×5 plots');
  assert(!st.over && st.turn === RED && st.winner === null, 'fresh board: red to tap, nobody has won');
  // 5×5 boxes: 6 rows of 5 horizontal edges + 5 rows of 6 vertical edges = 60.
  assert(legalMoves(s).length === 60, 'fresh 5×5 board has 60 open sap lines');
  const s3 = createInitialState({ rows: 3, cols: 3 });
  assert(legalMoves(s3).length === 24, 'fresh 3×3 board has 24 open sap lines');
  const s7 = createInitialState({ rows: 7, cols: 7 });
  assert(legalMoves(s7).length === 112, 'fresh 7×7 board has 112 open sap lines');
}

{
  // State must survive a JSON round trip — that's the multiplayer plan.
  let s = play([H(0, 0), V(0, 0)]);
  s = JSON.parse(JSON.stringify(s));
  s = applyMove(s, H(1, 0));
  assert(edgeOwner(s, H(1, 0)) === RED && getStatus(s).turn === BLUE, 'state survives JSON.stringify → parse → resume');
}

{
  // applyMove must never mutate its input.
  const before = play([H(0, 0), V(0, 0)]);
  const snapshot = JSON.stringify(before);
  applyMove(before, H(2, 2));
  assert(JSON.stringify(before) === snapshot, 'applyMove returns a new state, never mutates');
}

/* ---------------------------------------------------------- turn passing */

{
  const s = createInitialState();
  const s2 = applyMove(s, H(0, 0));
  assert(s2.turn === BLUE, 'a plain edge passes the turn');
  const s3 = applyMove(s2, H(5, 4));
  assert(s3.turn === RED, '…and back again');
}

/* ---------------------------------------------------------- completing plots */

{
  // Red draws three sides of plot (0,0) getting handed turns via blue's
  // far-away edges, then blue closes it: blue claims and KEEPS the turn.
  const s = play([
    H(0, 0), // red: top of (0,0)
    H(5, 0), // blue: far away
    V(0, 0), // red: left of (0,0)
    H(5, 1), // blue: far away
    V(0, 1), // red: right of (0,0) — plot at 3 sides
  ]);
  assert(boxSides(s, 0, 0) === 3 && s.turn === BLUE, 'plot (0,0) sits at three sides, blue to tap');
  assert(boxesCompletedBy(s, H(1, 0)) === 1, 'the bottom edge would finish one plot');
  const s2 = applyMove(s, H(1, 0));
  assert(s2.boxes[0] === BLUE, 'closing the fourth side claims the plot');
  assert(s2.turn === BLUE, 'claiming a plot grants another turn');
  assert(getStatus(s2).scores[BLUE] === 1 && getStatus(s2).scores[RED] === 0, 'score counts the claim');
}

{
  // One edge, two plots: build plots (0,0) and (0,1) each to three sides so
  // the shared edge V(0,1) finishes BOTH. Both claimed, still one extra turn.
  const s = play([
    H(0, 0), H(5, 0), // red builds, blue wanders
    H(1, 0), H(5, 1),
    V(0, 0), H(5, 2),
    H(0, 1), H(5, 3),
    H(1, 1), H(5, 4),
    V(0, 2), H(4, 0), // both plots now at 3 sides; blue's last edge hands red the tap
  ]);
  assert(boxSides(s, 0, 0) === 3 && boxSides(s, 0, 1) === 3, 'two neighbouring plots at three sides each');
  assert(s.turn === RED, 'red to tap the shared line');
  assert(boxesCompletedBy(s, V(0, 1)) === 2, 'the shared edge would finish two plots');
  const s2 = applyMove(s, V(0, 1));
  assert(s2.boxes[0] === RED && s2.boxes[1] === RED, 'one edge claims both plots at once');
  assert(s2.turn === RED, 'a double claim still grants exactly one extra turn');
  assert(getStatus(s2).scores[RED] === 2, 'double claim scores two plots');
}

/* ---------------------------------------------------------- endgame counting */

{
  // Tiny 1×2 board, fully played out. Blue builds both plots to three
  // sides; red closes them both with the shared middle line at the end.
  let s = createInitialState({ rows: 1, cols: 2 });
  s = applyMove(s, H(0, 0)); // red
  s = applyMove(s, H(0, 1)); // blue
  s = applyMove(s, H(1, 0)); // red
  s = applyMove(s, H(1, 1)); // blue
  s = applyMove(s, V(0, 0)); // red — (0,0) at 3 sides
  s = applyMove(s, V(0, 2)); // blue — (0,1) at 3 sides, red to tap
  s = applyMove(s, V(0, 1)); // red closes BOTH plots with the shared edge
  const st = getStatus(s);
  assert(st.over, 'board with every edge drawn is over');
  assert(st.scores[RED] === 2 && st.scores[BLUE] === 0, 'final score counts every plot');
  assert(st.winner === RED && !st.draw, 'most plots wins');
  assert(st.turn === null && legalMoves(s).length === 0, 'no turn and no moves once over');
}

{
  // A 2×1 board where each side closes one plot: a genuine draw. The two
  // plots share edge H(1,0) — drawn FIRST so no double-claim exists.
  let s = createInitialState({ rows: 2, cols: 1 });
  s = applyMove(s, H(1, 0)); // red — the shared wall, drawn early
  s = applyMove(s, H(0, 0)); // blue
  s = applyMove(s, V(0, 0)); // red — (0,0) at 3 sides, blue to tap
  s = applyMove(s, V(0, 1)); // blue claims (0,0), goes again
  assert(s.boxes[0] === BLUE && s.turn === BLUE, 'blue takes the offered plot and keeps the tap');
  s = applyMove(s, H(2, 0)); // blue — (1,0) at 2 sides, red to tap
  s = applyMove(s, V(1, 0)); // red — (1,0) at 3 sides, handing it over
  s = applyMove(s, V(1, 1)); // blue claims (1,0) as well — a 2–0 sweep.
  // On boards this tiny the closer sweeps; assert the sweep, then assert the
  // draw flag directly on a hand-built tied board.
  const st = getStatus(s);
  assert(st.over && st.winner === BLUE && st.scores[BLUE] === 2, 'tiny boards reward the closer');
  const tied = {
    rows: 1, cols: 2,
    h: [RED, BLUE, RED, BLUE],
    v: [RED, BLUE, RED],
    boxes: [RED, BLUE],
    turn: RED,
  };
  const tst = getStatus(tied);
  assert(tst.over && tst.draw && tst.winner === null, 'equal plots on a full board is a draw');
}

/* ---------------------------------------------------------- illegal moves */

{
  const s = play([H(0, 0)]);
  for (const bad of [H(0, 0), H(9, 0), H(0, 5), V(5, 0), V(0, 9), { o: 'x', r: 0, c: 0 }, null]) {
    let threw = false;
    try {
      applyMove(s, bad);
    } catch {
      threw = true;
    }
    if (!threw) assert(false, `illegal move accepted: ${JSON.stringify(bad)}`);
  }
  assert(true, 'redrawn, off-board and malformed edges are all rejected');
}

/* ---------------------------------------------------------- Sap Hauler */

{
  // Crafted 3×3 position: plot (0,0) has two sides drawn, so V(0,1) and
  // H(1,0) would each hand it over — but plenty of safe lines remain. Run
  // the Hauler 200 times: it must never create a 3-sided plot.
  const base = play([H(0, 0), V(0, 0)], { rows: 3, cols: 3 });
  const dangerous = new Set(['h1,0', 'v0,1']);
  for (let i = 0; i < 200; i++) {
    const m = chooseMove(base, 'hauler');
    const key = `${m.o}${m.r},${m.c}`;
    if (dangerous.has(key)) assert(false, `Hauler drew a third side: ${key}`);
    const after = applyMove(base, m);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (boxSides(after, r, c) >= 3) assert(false, `Hauler left plot ${r},${c} at 3 sides`);
      }
    }
  }
  assert(true, 'Hauler never gives away a plot while a safe line exists (200 tries)');
}

{
  // A free plot on offer: the Hauler must take it.
  const s = play([
    H(0, 0), H(3, 0), V(0, 0), H(3, 1), V(0, 1), H(3, 2), // (0,0) at 3 sides, red to tap
  ], { rows: 3, cols: 3 });
  assert(s.turn === RED && boxSides(s, 0, 0) === 3, 'crafted position: free plot for red');
  for (let i = 0; i < 50; i++) {
    const m = chooseMove(s, 'hauler');
    if (!(m.o === 'h' && m.r === 1 && m.c === 0)) assert(false, 'Hauler passed up a free plot');
  }
  assert(true, 'Hauler always takes a free plot (50 tries)');
}

/* ---------------------------------------------------------- Boiler */

{
  // Offer the Boiler a whole 3-plot chain across the top of a 3×3 board:
  // top row plots each have top+bottom drawn, left wall drawn — a classic
  // corridor. Safe lines still exist elsewhere, so after hauling the chain
  // it is NOT forced to double-cross.
  let s = createInitialState({ rows: 3, cols: 3 });
  const setup = [
    H(0, 0), H(0, 1), H(0, 2), // roof
    H(1, 0), H(1, 1), H(1, 2), // corridor floor
    V(0, 0), // left wall — plot (0,0) now at 3 sides
  ];
  // Lay the corridor with owners irrelevant; rebuild as a plain object to
  // set up the position directly (the engine only cares about legality).
  for (const m of setup) s = { ...applyMove({ ...s, turn: RED }, m) };
  s = { ...s, turn: BLUE }; // Boiler plays blue here
  assert(boxSides(s, 0, 0) === 3, 'chain door is open');

  let chained = 0;
  let guard = 0;
  while (!getStatus(s).over && s.turn === BLUE && guard++ < 20) {
    const m = chooseMove(s, 'boiler');
    const gain = boxesCompletedBy(s, m);
    s = applyMove(s, m);
    chained += gain;
    if (gain === 0) break; // Boiler declined to keep capturing
  }
  assert(chained === 3, `Boiler hauls in the entire 3-plot chain (took ${chained})`);
  assert(getStatus(s).scores[BLUE] === 3, 'all three plots are blue');
}

{
  // Forced sacrifice: a 2×2 endgame where every plot sits at exactly two
  // sides — no captures, no safe lines. Plot (0,0) is a 1-chain (its two
  // open edges are both on the rim); the other three plots form a 3-chain.
  // The Boiler must open the 1-chain: H(0,0) or V(0,0).
  let s = createInitialState({ rows: 2, cols: 2 });
  for (const m of [H(1, 0), V(0, 1), H(0, 1), V(1, 2), H(2, 1), V(1, 0)]) {
    s = { ...applyMove({ ...s, turn: RED }, m) };
  }
  s = { ...s, turn: BLUE };
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      if (boxSides(s, r, c) !== 2) assert(false, `setup: plot ${r},${c} should sit at 2 sides`);
    }
  }
  for (let i = 0; i < 50; i++) {
    const m = chooseMove(s, 'boiler');
    const cheap = (m.o === 'h' && m.r === 0 && m.c === 0) || (m.o === 'v' && m.r === 0 && m.c === 0);
    if (!cheap) assert(false, `Boiler opened the long chain via ${m.o}${m.r},${m.c}`);
  }
  assert(true, 'Boiler opens the shortest chain when forced (50 tries)');
}

{
  // No needless double-cross: a 2-plot chain is on offer and only one other
  // 2-chain remains. Giving up two plots to win two plots is pointless —
  // the Boiler should just haul in the offer.
  // 2×2 board: roof, mid and floor corridors drawn, door V(0,0) drawn.
  // Top chain (0,0)+(0,1) is offered; bottom chain (1,0)+(1,1) waits.
  let s = createInitialState({ rows: 2, cols: 2 });
  for (const m of [H(0, 0), H(0, 1), H(1, 0), H(1, 1), H(2, 0), H(2, 1), V(0, 0)]) {
    s = { ...applyMove({ ...s, turn: RED }, m) };
  }
  s = { ...s, turn: BLUE };
  assert(boxSides(s, 0, 0) === 3, 'two-plot chain is on offer');
  let got = 0;
  let guard = 0;
  while (!getStatus(s).over && s.turn === BLUE && guard++ < 10) {
    const m = chooseMove(s, 'boiler');
    const gain = boxesCompletedBy(s, m);
    if (gain === 0) break;
    got += gain;
    s = applyMove(s, m);
  }
  assert(got === 2, `Boiler takes the 2-chain outright when crossing gains nothing (took ${got})`);
}

{
  // The double-cross. 2×3 board: roof, mid and floor corridors all drawn
  // make two 3-chains (top row, bottom row). The door V(0,0) offers the
  // top chain. The Boiler should take plot (0,0), then DECLINE the last
  // two plots: playing the far wall V(0,3) completes nothing and leaves
  // (0,1)+(0,2) as a poisoned domino. Red takes both with one line but
  // must then open the bottom chain — the Boiler hauls all three: 4–2.
  let s = createInitialState({ rows: 2, cols: 3 });
  for (const m of [
    H(0, 0), H(0, 1), H(0, 2), // roof
    H(1, 0), H(1, 1), H(1, 2), // mid corridor
    H(2, 0), H(2, 1), H(2, 2), // floor
    V(0, 0), // door to the top chain
  ]) {
    s = { ...applyMove({ ...s, turn: RED }, m) };
  }
  s = { ...s, turn: BLUE };
  assert(boxSides(s, 0, 0) === 3, 'top chain of three is on offer');

  // Move 1: Boiler should take plot (0,0) — the chain is worth 3, no cross yet.
  let m = chooseMove(s, 'boiler');
  assert(boxesCompletedBy(s, m) === 1, 'Boiler starts hauling the chain');
  s = applyMove(s, m);

  // Move 2: two plots left in the chain, far end open, 3-chain waiting
  // below. The double-cross: play V(0,3) — completes nothing, leaves
  // (0,1),(0,2) as a domino red must take before opening the bottom.
  m = chooseMove(s, 'boiler');
  assert(boxesCompletedBy(s, m) === 0, 'Boiler declines the last two plots (double-cross!)');
  assert(m.o === 'v' && m.r === 0 && m.c === 3, 'the cross is the far wall V(0,3)');
  s = applyMove(s, m);
  assert(s.turn === RED, 'the tap passes to red holding a poisoned domino');
  // Red's best is still to take both (one edge) and open the bottom chain;
  // blue then hauls all three bottom plots: 4–2 Boiler. Play red greedily:
  while (!getStatus(s).over) {
    const moves = legalMoves(s);
    const take = moves.find((mm) => boxesCompletedBy(s, mm) > 0);
    s = applyMove(s, s.turn === BLUE ? chooseMove(s, 'boiler') : (take ?? moves[0]));
  }
  const st = getStatus(s);
  assert(st.winner === BLUE && st.scores[BLUE] === 4, `double-cross wins the boil 4–2 (got ${st.scores[BLUE]}–${st.scores[RED]})`);
}

console.log(`\n🍁 All ${passed} checks passed. Fire up the evaporator.`);
