// Online-rooms wiring test: drives the real vendored client (js/rooms.js)
// against the local shim (scripts/rooms-shim.mjs) as two simulated phones,
// then plays a full online game through the real engine. No network, no
// Supabase — the SQL file has its own referee tests; this proves OUR side.
//
//   node scripts/test-rooms.mjs

import { createServer } from 'node:http';
import { startShim, createRooms } from './rooms-shim.mjs';
import {
  createInitialState, legalMoves, applyMove, getStatus, RED, BLUE,
} from '../js/engine.js';

const GAME = 'sugarbush-squares';

/* ------------------------------------------------- two-phone environment */

const stores = new Map();
let current = 'A';
globalThis.localStorage = {
  getItem: (key) => (stores.get(current).has(key) ? stores.get(current).get(key) : null),
  setItem: (key, value) => stores.get(current).set(key, String(value)),
  removeItem: (key) => stores.get(current).delete(key),
};
function device(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  current = name;
}
device('A');
device('B');

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}
async function expectCode(promise, code, label) {
  try {
    await promise;
    t(false, `${label} (no error thrown)`);
  } catch (error) {
    t(error && error.code === code, `${label} (got ${error && error.code})`);
  }
}

async function canOpenLoopback() {
  const probe = createServer();
  return new Promise((resolve) => {
    probe.once('error', () => resolve(false));
    probe.listen(0, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function startInMemoryShim() {
  const { rpcs } = createRooms();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const rpcName = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (!rpcName || !rpcs[rpcName]) {
      return new Response('{}', { status: 404 });
    }
    try {
      const body = JSON.parse(options.body || '{}');
      return new Response(JSON.stringify(rpcs[rpcName](body) ?? {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ message: error.message }), {
        status: error.rpc ? 400 : 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
  return {
    url: 'http://rooms.test',
    server: { close: () => { globalThis.fetch = originalFetch; } },
  };
}

const loopback = await canOpenLoopback();
const shim = loopback ? await startShim() : startInMemoryShim();
globalThis.BTOWN_ROOMS_URL = shim.url;
const { OnlineMatch, savedSession } = await import('../js/rooms.js');

/* ------------------------------------------------------------ the tests */

// create + join
device('A');
const host = await OnlineMatch.create({
  game: GAME, name: 'Tap A', state: createInitialState(), seats: 2,
});
t(/^[A-Z2-9]{4}$/.test(host.code) && host.seat === 0 && host.status === 'waiting', 'host creates room, seat 0');
t(savedSession(GAME)?.roomId === host.roomId, 'host session saved');

device('B');
await expectCode(OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'X' }), 'not_found', 'bad code rejected');
await expectCode(OnlineMatch.join({ game: 'four-in-a-rowboat', code: host.code, name: 'X' }), 'wrong_game', 'wrong game rejected');
const guest = await OnlineMatch.join({
  game: GAME, code: ` ${host.code.toLowerCase()} `, name: 'Tap B',
});
t(guest.seat === 1 && guest.status === 'playing', 'guest joins (sloppy code ok), game starts');
t(guest.opponents().length === 1 && guest.opponents()[0].name === 'Tap A', 'guest sees host name');

device('A');
await host._fetch();
t(host.status === 'playing' && host.opponents()[0].name === 'Tap B', 'host poll sees game start');

// referee: push, sync, conflict
const firstMove = legalMoves(host.state)[0];
const stateAfterHost = applyMove(host.state, firstMove);
await host.push(stateAfterHost);
t(host.version === 1, 'host pushes move, version 1');

device('B');
await guest._fetch();
t(guest.state.h[0] === RED && guest.state.turn === BLUE, 'guest poll receives the move');
const stateAfterGuest = applyMove(guest.state, legalMoves(guest.state)[0]);
await guest.push(stateAfterGuest);
t(guest.version === 2, 'guest pushes reply, version 2');

device('A');
const staleState = applyMove(stateAfterHost, legalMoves(stateAfterHost)[0]);
await expectCode(host.push(staleState), 'version_conflict', 'stale push rejected');
t(host.version === 2 && JSON.stringify(host.state) === JSON.stringify(stateAfterGuest), 'conflict refetches the truth');

// Full random game through the engine. The mover is chosen from state.turn,
// so a phone legitimately pushes several versions in a row after a claim.
device('A'); await host._fetch();
device('B'); await guest._fetch();
const phones = {
  [RED]: { match: host, device: 'A' },
  [BLUE]: { match: guest, device: 'B' },
};
let movesPlayed = 0;
let sawExtraTurn = false;
while (!getStatus(host.state).over && movesPlayed < 400) {
  const player = host.state.turn;
  const mover = phones[player];
  device(mover.device);
  await mover.match._fetch();
  const moves = legalMoves(mover.match.state);
  const move = moves[Math.floor(Math.random() * moves.length)];
  const next = applyMove(mover.match.state, move);
  sawExtraTurn ||= !getStatus(next).over && next.turn === player;
  await mover.match.push(next, { over: getStatus(next).over });
  movesPlayed++;

  device('A'); await host._fetch();
  device('B'); await guest._fetch();
  t(JSON.stringify(host.state) === JSON.stringify(guest.state), `phones agree after move ${movesPlayed}`);
}
t(movesPlayed < 400 && getStatus(host.state).over, `full random online game ends cleanly (${movesPlayed} moves)`);
t(sawExtraTurn, 'a box claim keeps the same phone moving');
t(host.status === 'over' && guest.status === 'over', 'both rooms clients see game over');
t(JSON.stringify(host.state) === JSON.stringify(guest.state), 'end states are JSON-identical');

// rematch: either phone opens a fresh sugarbush in the finished room
device('B');
await guest.push(createInitialState(), {});
t(guest.status === 'playing' && guest.version === host.version + 1, 'rematch state accepted');

// resume after a "refresh"
device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host.roomId && resumed.seat === 0 && resumed.status === 'playing', 'resume reattaches to the room');

// leave: other side sees the flag, session cleared
await resumed.leave();
t(savedSession(GAME) === null, 'leave clears the session');
device('B');
await guest._fetch();
t(guest.status === 'over' && guest.opponents()[0].left === true, 'guest sees host left');

// full room turns a third phone away
device('A');
const secondHost = await OnlineMatch.create({
  game: GAME, name: 'A', state: createInitialState(),
});
device('B');
await OnlineMatch.join({ game: GAME, code: secondHost.code, name: 'B' });
device('C');
await expectCode(
  OnlineMatch.join({ game: GAME, code: secondHost.code, name: 'C' }),
  'room_started',
  'third phone turned away',
);

// Backend not installed → clean 'not_ready' (a bare server that 404s RPCs).
{
  let dead = null;
  if (loopback) {
    dead = createServer((request, response) => {
      response.writeHead(404);
      response.end('{}');
    });
    await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve));
    globalThis.BTOWN_ROOMS_URL = `http://127.0.0.1:${dead.address().port}`;
  } else {
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    globalThis.BTOWN_ROOMS_URL = 'http://rooms-not-ready.test';
  }
  const fresh = await import('../js/rooms.js?not-ready');
  await expectCode(
    fresh.OnlineMatch.create({ game: GAME, name: 'A', state: {} }),
    'not_ready',
    'missing backend reads as not_ready',
  );
  if (dead) dead.close();
}

shim.server.close();
console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
process.exit(0);
