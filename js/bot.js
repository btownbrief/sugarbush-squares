// SUGARBUSH SQUARES — the two computer opponents.
//
// This module only talks to the engine through its public API plus reading
// the plain state object. No rule logic lives here — if the engine says a
// move is legal, it's legal. Randomness is fine here (it's personality, not
// rules); the engine itself stays random-free.
//
//   SAP HAULER — knows the basics: takes any free plot, and never draws the
//                third side of a plot while a safe line exists. Doesn't see
//                chains, so the endgame is where you beat the Hauler.
//   BOILER    — understands chains. Takes a whole offered chain, opens the
//                cheapest chain when forced, and knows the double-cross:
//                near the end it will leave you the last two plots of a
//                chain to keep control of the boil.

import {
  RED, BLUE, legalMoves, applyMove, getStatus, boxSides, adjacentBoxes,
  boxesCompletedBy,
} from './engine.js';

/** Pick an edge for the side to move. level: 'hauler' | 'boiler'. */
export function chooseMove(state, level) {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('No open sap lines — the game is over.');
  return level === 'boiler' ? boilerMove(state, moves) : haulerMove(state, moves);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Moves that finish at least one plot right now. */
function captures(state, moves) {
  return moves.filter((m) => boxesCompletedBy(state, m) > 0);
}

/** Moves that hand nothing over: no bordering plot ends up with 3 sides. */
function safeMoves(state, moves) {
  return moves.filter(
    (m) =>
      boxesCompletedBy(state, m) === 0 &&
      adjacentBoxes(state, m).every(({ r, c }) => boxSides(state, r, c) < 2)
  );
}

/* ---------------------------------------------------------- Sap Hauler */

function haulerMove(state, moves) {
  // Free syrup first — grab the move that finishes the most plots.
  const takes = captures(state, moves);
  if (takes.length > 0) {
    const best = Math.max(...takes.map((m) => boxesCompletedBy(state, m)));
    return pick(takes.filter((m) => boxesCompletedBy(state, m) === best));
  }
  // Never draw a third side while a safe line exists.
  const safe = safeMoves(state, moves);
  if (safe.length > 0) return pick(safe);
  // Forced to give something away — the Hauler shrugs and picks blind.
  return pick(moves);
}

/* ---------------------------------------------------------- Boiler */

function boilerMove(state, moves) {
  const takes = captures(state, moves);

  if (takes.length > 0) {
    // What's on offer, and what the board looks like once we've hauled it in.
    const offered = greedyGain(state);
    const after = greedyFinish(state);
    const afterMoves = legalMoves(after);

    // The double-cross: if taking everything would leave us forced to open
    // the next chain, and the offer is exactly two plots, decline them —
    // play the line that hands both plots over in one move. The opponent
    // takes two and then THEY must open the next chain. Control of the
    // endgame is worth more than two plots.
    if (
      offered === 2 &&
      afterMoves.length > 0 &&
      safeMoves(after, afterMoves).length === 0 &&
      getStatus(after).remaining > 2
    ) {
      const cross = moves.find(
        (m) =>
          boxesCompletedBy(state, m) === 0 && greedyGain(applyMove(state, m)) === 2
      );
      if (cross) return cross;
    }

    // Otherwise take the whole chain: biggest completion first.
    const best = Math.max(...takes.map((m) => boxesCompletedBy(state, m)));
    return pick(takes.filter((m) => boxesCompletedBy(state, m) === best));
  }

  // Nothing on offer. Keep the boil going with a safe line if one exists,
  // preferring lines that leave the fewest 2-sided plots behind.
  const safe = safeMoves(state, moves);
  if (safe.length > 0) {
    const scored = safe.map((m) => ({ m, risk: riskAfter(state, m) }));
    const least = Math.min(...scored.map((s) => s.risk));
    return pick(scored.filter((s) => s.risk === least).map((s) => s.m));
  }

  // Forced to open a chain: hand over as little as possible. The gift of
  // each candidate line is what a greedy opponent could chain off it.
  const scored = moves.map((m) => ({ m, gift: greedyGain(applyMove(state, m)) }));
  const cheapest = Math.min(...scored.map((s) => s.gift));
  return pick(scored.filter((s) => s.gift === cheapest).map((s) => s.m));
}

/** How many plots the side to move could chain off right now, taking greedily. */
function greedyGain(state) {
  const before = getStatus(state).remaining;
  return before - getStatus(greedyFinish(state)).remaining;
}

/** The state after the side to move takes every capture on offer (no more). */
function greedyFinish(state) {
  let s = state;
  for (;;) {
    const take = captures(s, legalMoves(s)).sort(
      (a, b) => boxesCompletedBy(s, b) - boxesCompletedBy(s, a)
    )[0];
    if (!take) return s;
    s = applyMove(s, take);
  }
}

/** After playing m, how many plots sit at 2 sides — future chain fuel. */
function riskAfter(state, m) {
  const next = applyMove(state, m);
  let risky = 0;
  for (let r = 0; r < next.rows; r++) {
    for (let c = 0; c < next.cols; c++) {
      if (next.boxes[r * next.cols + c] === 0 && boxSides(next, r, c) === 2) risky++;
    }
  }
  return risky;
}
