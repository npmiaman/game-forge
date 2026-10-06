/**
 * Procedural audio — no asset files needed.
 *
 *   sfx.play('shoot')                        // a preset
 *   sfx.play('pickup', { freq: 900 })        // override base pitch
 *   sfx.define('zap', { freq: 1400, slide: -40, release: 0.1, shape: 2 })
 *   music.play(SONGS.synthwave); music.setIntensity(2)
 *   audio.toggleMute()
 *
 * Sounds are ZzFX (https://github.com/KilledByAPixel/ZzFX). Design new ones visually at
 * https://killedbyapixel.github.io/ZzFX/ and paste the param array into sfx.defineRaw().
 */
import { ZZFX } from 'zzfx';

const ctx: AudioContext = ZZFX.audioContext;
const master = ctx.createGain();
master.connect(ctx.destination);
const sfxBus = ctx.createGain();
sfxBus.connect(master);
const musicBus = ctx.createGain();
musicBus.connect(master);

const MUTE_KEY = 'kit:muted';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}
master.gain.value = muted ? 0 : 1;
sfxBus.gain.value = 0.9;
musicBus.gain.value = 0.55;

// Browsers start audio suspended until a user gesture.
const unlock = () => { if (ctx.state !== 'running') ctx.resume(); };
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });

export const audio = {
  ctx,
  /** Connect your own continuous sounds here (engines, ambience) so mute + volume apply. */
  get output(): AudioNode { return sfxBus; },
  get muted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch {}
  },
  toggleMute() { this.setMuted(!muted); return muted; },
  setSfxVolume(v: number) { sfxBus.gain.value = v; },
  setMusicVolume(v: number) { musicBus.gain.value = v; },
};

// ---------------------------------------------------------------- SFX

/** Readable ZzFX params. Unset fields use ZzFX defaults. */
export interface SoundDef {
  volume?: number; randomness?: number; freq?: number;
  attack?: number; sustain?: number; release?: number;
  /** 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise */
  shape?: number; shapeCurve?: number;
  /** pitch slide; negative = falling. ~-10 drops a 1kHz tone ~400Hz over 80ms */
  slide?: number; deltaSlide?: number;
  pitchJump?: number; pitchJumpTime?: number; repeatTime?: number;
  noise?: number; modulation?: number; bitCrush?: number; delay?: number;
  sustainVolume?: number; decay?: number; tremolo?: number;
  /** biquad cutoff Hz: positive = high-pass, negative = low-pass */
  filter?: number;
}

const toParams = (d: SoundDef): (number | undefined)[] => [
  d.volume, d.randomness, d.freq, d.attack, d.sustain, d.release, d.shape, d.shapeCurve,
  d.slide, d.deltaSlide, d.pitchJump, d.pitchJumpTime, d.repeatTime, d.noise, d.modulation,
  d.bitCrush, d.delay, d.sustainVolume, d.decay, d.tremolo, d.filter,
];

/** Built-in presets. Tweak freely or add with sfx.define(). */
export const PRESETS: Record<string, SoundDef> = {
  shoot:    { volume: 0.25, randomness: 0.08, freq: 1050, sustain: 0.01, release: 0.07, shape: 2, shapeCurve: 1.5, slide: -16, sustainVolume: 0.6, filter: 700 },
  laser:    { volume: 0.35, freq: 1500, sustain: 0.03, release: 0.12, shape: 1, slide: -30 },
  hit:      { volume: 0.35, randomness: 0.15, freq: 260, release: 0.06, shape: 4, slide: -4, noise: 0.4 },
  thud:     { volume: 0.6, freq: 110, sustain: 0.02, release: 0.12, shape: 0, slide: -6 },
  explode:  { volume: 0.7, randomness: 0.1, freq: 140, attack: 0.005, sustain: 0.04, release: 0.55, shape: 4, shapeCurve: 1.9, noise: 0.6, bitCrush: 0.15, filter: -2500 },
  bigBoom:  { volume: 1, randomness: 0.05, freq: 60, attack: 0.01, sustain: 0.15, release: 1.1, shape: 4, shapeCurve: 2, slide: -0.5, noise: 1, bitCrush: 0.3, decay: 0.1, filter: -1800 },
  pickup:   { volume: 0.3, randomness: 0.02, freq: 1400, sustain: 0.02, release: 0.07, shape: 1, pitchJump: 500, pitchJumpTime: 0.03 },
  coin:     { volume: 0.4, freq: 1675, sustain: 0.06, release: 0.24, shape: 1, shapeCurve: 1.82, pitchJump: 837, pitchJumpTime: 0.06 },
  powerup:  { volume: 0.5, freq: 300, attack: 0.02, sustain: 0.2, release: 0.3, shape: 1, slide: 6, repeatTime: 0.07, tremolo: 0.1 },
  hurt:     { volume: 0.8, randomness: 0.05, freq: 420, sustain: 0.05, release: 0.3, shape: 2, shapeCurve: 2, slide: -18, noise: 0.5, bitCrush: 0.1 },
  jump:     { volume: 0.4, freq: 240, sustain: 0.05, release: 0.12, shape: 1, slide: 14 },
  dash:     { volume: 0.5, randomness: 0.1, freq: 600, attack: 0.02, sustain: 0.05, release: 0.18, shape: 4, slide: -8, noise: 1, filter: 1200 },
  blip:     { volume: 0.3, freq: 880, release: 0.05, shape: 1 },
  select:   { volume: 0.4, freq: 660, sustain: 0.04, release: 0.1, shape: 1, pitchJump: 440, pitchJumpTime: 0.04 },
  denied:   { volume: 0.4, freq: 180, sustain: 0.08, release: 0.08, shape: 2, tremolo: 0.5, filter: -1200 },
  spawn:    { volume: 0.2, freq: 200, attack: 0.15, release: 0.05, shape: 0, slide: 12, filter: -3000 },
  shockwave:{ volume: 0.7, freq: 90, attack: 0.01, sustain: 0.1, release: 0.5, shape: 0, slide: -2, noise: 0.3, modulation: 3 },
};

interface Entry { def: SoundDef; raw?: (number | undefined)[]; variants: AudioBuffer[]; last: number }
const bank = new Map<string, Entry>();
const VARIANTS = 4;          // pre-rendered random variations per sound
const MIN_GAP = 0.03;        // seconds; stops 20 identical sounds stacking into a blast
let voices = 0;
const MAX_VOICES = 24;

function render(params: (number | undefined)[]): AudioBuffer {
  const samples = ZZFX.buildSamples(...params) as unknown as Float32Array;
  const buf = ctx.createBuffer(1, Math.max(1, samples.length), ZZFX.sampleRate);
  buf.getChannelData(0).set(samples);
  return buf;
}

export const sfx = {
  define(name: string, def: SoundDef) { bank.set(name, { def, variants: [], last: -1 }); },
  /** Paste an array straight from the ZzFX designer. */
  defineRaw(name: string, params: (number | undefined)[]) { bank.set(name, { def: {}, raw: params, variants: [], last: -1 }); },
  has(name: string) { return bank.has(name); },
  play(name: string, opts: { freq?: number; volume?: number; pan?: number; when?: number; rate?: number } = {}) {
    const e = bank.get(name);
    if (!e) { console.warn(`[sfx] unknown sound "${name}"`); return; }
    if (muted || ctx.state !== 'running' || voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const when = now + (opts.when ?? 0);
    let buf: AudioBuffer;
    if (opts.freq !== undefined) {
      buf = render(toParams({ ...e.def, freq: opts.freq }));     // pitched one-offs aren't cached
    } else {
      if (opts.when === undefined && now - e.last < MIN_GAP) return;
      e.last = now;
      if (e.variants.length < VARIANTS) e.variants.push(render(e.raw ?? toParams(e.def)));
      buf = e.variants[(Math.random() * e.variants.length) | 0];
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    let node: AudioNode = g;
    if (opts.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); g.connect(p); node = p; }
    src.connect(g); node.connect(sfxBus);
    voices++;
    src.onended = () => { voices--; };
    src.start(when);
  },
  /** Quick ascending/descending jingle, e.g. sfx.notes('blip', [0, 4, 7, 12], 0.07) */
  notes(name: string, semitones: number[], step = 0.08, root = 523.25) {
    semitones.forEach((s, i) => this.play(name, { freq: root * 2 ** (s / 12), when: i * step }));
  },
};
for (const [k, v] of Object.entries(PRESETS)) sfx.define(k, v);

// ---------------------------------------------------------------- Music

/**
 * Tiny step sequencer. A song is a list of tracks; each track has a pattern string per bar
 * where each char is a 16th note: '.' = rest, 'x' = hit (drums), or a digit/letter = scale degree.
 * Tracks may require a minimum intensity, so music can build as the game heats up.
 */
export type Instrument = 'kick' | 'snare' | 'hat' | 'bass' | 'lead' | 'pad' | 'arp';
export interface Track { inst: Instrument; bars: string[]; octave?: number; volume?: number; minIntensity?: number }
export interface Song { bpm: number; root: number; scale: number[]; tracks: Track[]; chords?: number[] }

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
export { SCALES };

const DEG = '0123456789abcdefghij';

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let noise: AudioBuffer | null = null;

function voice(inst: Instrument, t: number, freq: number, vol: number, dur: number) {
  const g = ctx.createGain();
  g.connect(musicBus);
  const env = (a: number, r: number, peak: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  };
  if (inst === 'kick') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env(0.002, 0.25, vol);
    o.connect(g); o.start(t); o.stop(t + 0.3);
    return;
  }
  if (inst === 'snare' || inst === 'hat') {
    noise ??= noiseBuffer();
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = inst === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = inst === 'hat' ? 7000 : 1800;
    env(0.001, inst === 'hat' ? 0.04 : 0.15, vol);
    s.connect(f); f.connect(g); s.start(t); s.stop(t + 0.2);
    return;
  }
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  if (inst === 'bass') { o.type = 'sawtooth'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + dur); env(0.005, dur, vol); }
  else if (inst === 'lead') { o.type = 'square'; f.frequency.value = 2400; env(0.01, dur * 1.5, vol); }
  else if (inst === 'arp') { o.type = 'square'; f.frequency.value = 3200; env(0.003, 0.12, vol); }
  else { o.type = 'sawtooth'; f.frequency.value = 1200; env(dur * 0.3, dur * 1.2, vol); }
  o.frequency.value = freq;
  o.connect(f); f.connect(g); o.start(t); o.stop(t + dur * 2 + 0.1);
}

let current: Song | null = null;
let intensity = 0;
let step = 0;
let nextTime = 0;
let timer: number | undefined;
const beatListeners = new Set<(beat: number) => void>();

function schedule() {
  if (!current) return;
  const s = current;
  const sixteenth = 60 / s.bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    const barLen = 16;
    for (const tr of s.tracks) {
      if ((tr.minIntensity ?? 0) > intensity) continue;
      const bar = tr.bars[Math.floor(step / barLen) % tr.bars.length];
      const ch = bar[step % barLen];
      if (!ch || ch === '.' || ch === ' ') continue;
      const vol = (tr.volume ?? 0.3);
      if (tr.inst === 'kick' || tr.inst === 'snare' || tr.inst === 'hat') { voice(tr.inst, nextTime, 0, vol, 0); continue; }
      const deg = DEG.indexOf(ch);
      const n = s.scale.length;
      const chord = s.chords ? s.chords[Math.floor(step / barLen) % s.chords.length] : 0;
      const d = deg + chord;
      const semis = s.scale[((d % n) + n) % n] + 12 * Math.floor(d / n) + 12 * (tr.octave ?? 0);
      const freq = s.root * 2 ** (semis / 12);
      voice(tr.inst, nextTime, freq, vol, tr.inst === 'pad' ? sixteenth * 16 : sixteenth * 2);
    }
    if (step % 4 === 0) {
      const beat = step / 4;
      const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      setTimeout(() => beatListeners.forEach((l) => l(beat)), delay);
    }
    nextTime += sixteenth;
    step++;
  }
}

export const music = {
  play(song: Song) {
    this.stop();
    current = song; step = 0; nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  stop() { if (timer) clearInterval(timer); timer = undefined; current = null; },
  get playing() { return !!current; },
  /** Tracks with minIntensity > this are silent. Raise it as the game gets hectic. */
  setIntensity(i: number) { intensity = i; },
  get intensity() { return intensity; },
  /** Called on every quarter-note — sync visuals to the beat. Returns an unsubscribe fn. */
  onBeat(fn: (beat: number) => void) { beatListeners.add(fn); return () => beatListeners.delete(fn); },
  duck(amount = 0.3, ms = 300) {
    const g = musicBus.gain, v = g.value;
    g.setTargetAtTime(v * amount, ctx.currentTime, 0.01);
    g.setTargetAtTime(v, ctx.currentTime + ms / 1000, 0.1);
  },
};

/** Ready-made songs. Copy one and edit the patterns to make a new track. */
export const SONGS: Record<string, Song> = {
  synthwave: {
    bpm: 118, root: 55 * 2, scale: SCALES.minor, chords: [0, 5, 3, 4],
    tracks: [
      { inst: 'kick',  bars: ['x...x...x...x...'], volume: 0.7 },
      { inst: 'hat',   bars: ['..x...x...x...x.'], volume: 0.12, minIntensity: 1 },
      { inst: 'snare', bars: ['....x.......x...'], volume: 0.25, minIntensity: 2 },
      { inst: 'bass',  bars: ['0.00.00.0.00.00.'], octave: -1, volume: 0.22 },
      { inst: 'arp',   bars: ['0247024702470247'], octave: 1, volume: 0.06, minIntensity: 1 },
      { inst: 'pad',   bars: ['0...............'], volume: 0.05 },
      { inst: 'lead',  bars: ['4...2...1...2...', '4...6...7...4...'], octave: 1, volume: 0.07, minIntensity: 3 },
    ],
  },
  chiptune: {
    bpm: 140, root: 261.63, scale: SCALES.major, chords: [0, 3, 4, 0],
    tracks: [
      { inst: 'kick',  bars: ['x.......x.x.....'], volume: 0.6 },
      { inst: 'hat',   bars: ['x.x.x.x.x.x.x.x.'], volume: 0.08, minIntensity: 1 },
      { inst: 'snare', bars: ['....x.......x...'], volume: 0.2 },
      { inst: 'bass',  bars: ['0...0...4...4...'], octave: -2, volume: 0.2 },
      { inst: 'arp',   bars: ['0.2.4.2.0.2.4.7.'], volume: 0.06 },
      { inst: 'lead',  bars: ['4.4.5.4.2...0...', '2.2.4.2.0.......'], octave: 1, volume: 0.06, minIntensity: 2 },
    ],
  },
  ambient: {
    bpm: 70, root: 110, scale: SCALES.dorian, chords: [0, 3, 5, 2],
    tracks: [
      { inst: 'pad',  bars: ['0.......4.......'], volume: 0.07 },
      { inst: 'bass', bars: ['0...............'], octave: -1, volume: 0.15 },
      { inst: 'arp',  bars: ['0...4...7...4...'], octave: 1, volume: 0.03, minIntensity: 1 },
    ],
  },
};
