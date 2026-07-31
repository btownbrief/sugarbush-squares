// SUGARBUSH SQUARES — tiny procedural WebAudio sounds. No audio files.
// Everything is synthesized: a woody tap when a sap line is run, a bright
// pop when a plot is claimed, a chime for the extra turn, and a little
// fanfare when the boil is done.

const LS_MUTED = 'sugarbush-squares-muted';

let ctx = null;
let muted = localStorage.getItem(LS_MUTED) === '1';

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.16, slide = 0 } = {}) {
  const a = ac();
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  osc.connect(g).connect(a.destination);
  osc.addEventListener('ended', () => {
    osc.disconnect();
    g.disconnect();
  }, { once: true });
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sound = {
  get muted() {
    return muted;
  },
  toggleMuted() {
    muted = !muted;
    localStorage.setItem(LS_MUTED, muted ? '1' : '0');
    return muted;
  },
  /** A sap line runs: knock on the maple, then a sweet drip. */
  tap() {
    if (muted) return;
    tone(190, 0, 0.07, { type: 'square', gain: 0.08, slide: -70 });
    tone(720, 0.05, 0.1, { type: 'sine', gain: 0.1, slide: 160 });
  },
  /** A plot claimed: bubbly pop, doubled for a two-plot claim. */
  pop(count = 1) {
    if (muted) return;
    for (let i = 0; i < count; i++) {
      tone(340 + i * 90, i * 0.09, 0.13, { type: 'sine', gain: 0.22, slide: 260 });
      tone(1150 + i * 150, i * 0.09 + 0.02, 0.06, { type: 'triangle', gain: 0.08 });
    }
    // A double/triple claim gets one warm resolving chord, while ordinary
    // single-plot captures keep their existing small pop.
    if (count > 1) {
      const start = count * 0.08;
      tone(262, start, 0.2, { type: 'triangle', gain: 0.09 });
      tone(count >= 3 ? 784 : 659, start + 0.04, 0.24, { type: 'triangle', gain: 0.12 });
    }
  },
  /** Extra turn: a quick upward maple chime. */
  again() {
    if (muted) return;
    tone(523, 0, 0.1, { type: 'triangle', gain: 0.13 });
    tone(784, 0.09, 0.16, { type: 'triangle', gain: 0.15 });
  },
  win() {
    if (muted) return;
    [392, 494, 587, 784].forEach((f, i) => tone(f, i * 0.11, 0.24, { type: 'triangle', gain: 0.18 }));
    tone(784, 0.44, 0.5, { type: 'triangle', gain: 0.14 });
  },
  lose() {
    if (muted) return;
    [330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.26, { type: 'triangle', gain: 0.15 }));
  },
  draw() {
    if (muted) return;
    tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.06, slide: -40 });
    tone(224, 0, 0.5, { type: 'sawtooth', gain: 0.06, slide: -40 });
  },
};
