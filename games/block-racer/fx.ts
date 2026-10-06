export { Debris } from '@kit/three/debris';

/** Continuous engine + tyre squeal, routed through the kit audio bus (respects mute). */
export class EngineSound {
  private osc1: OscillatorNode; private osc2: OscillatorNode; private gain: GainNode; private filt: BiquadFilterNode;
  private squeal: GainNode;
  constructor(private ctx: AudioContext, out: AudioNode) {
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 600;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.detune.value = 12;
    this.osc1.connect(this.filt); this.osc2.connect(this.filt); this.filt.connect(this.gain); this.gain.connect(out);
    this.osc1.start(); this.osc2.start();
    const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
    this.squeal = ctx.createGain(); this.squeal.gain.value = 0;
    n.connect(bp); bp.connect(this.squeal); this.squeal.connect(out); n.start();
  }
  /** speed01: 0..1+, throttle 0..1 */
  set(speed01: number, throttle: number, drifting: boolean, on: boolean) {
    const t = this.ctx.currentTime;
    // fake gears: pitch climbs then drops at shift points
    const gear = Math.min(4, Math.floor(speed01 * 4.5)), inGear = speed01 * 4.5 - gear;
    const f = 45 + gear * 12 + inGear * 55 + throttle * 8;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filt.frequency.setTargetAtTime(400 + speed01 * 1400 + throttle * 300, t, 0.08);
    this.gain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.05 : 0, t, 0.1);
    this.squeal.gain.setTargetAtTime(on && drifting ? 0.05 : 0, t, 0.05);
  }
}
