/**
 * Procedural Web Audio: layered jet engine (sub hum, filtered roar, turbine whine) and
 * airspeed-driven wind. No audio files. The context is created lazily on a user gesture.
 */
export interface AudioSettings {
  enabled: boolean;
  master: number;
  engine: number;
  wind: number;
}

export class AudioManager {
  readonly settings: AudioSettings = { enabled: true, master: 0.7, engine: 0.8, wind: 0.6 };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private windBus: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private whine: OscillatorNode | null = null;
  private whine2: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private roarFilter: BiquadFilterNode | null = null;
  private roarGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private running = false;
  failed = false;

  /** Must be called from a user gesture (click/key). Safe to call repeatedly. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      this.failed = true;
      console.warn('[Audio] AudioContext unavailable:', err);
    }
  }

  start(): void {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || this.running) return;
    this.running = true;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = white * 0.5 + brown * 3;
    }
    const noiseSource = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.loopStart = Math.random();
      this.nodes.push(s);
      return s;
    };
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(ctx.destination);
    this.engineBus = ctx.createGain();
    this.windBus = ctx.createGain();
    this.engineBus.connect(this.master);
    this.windBus.connect(this.master);

    this.hum = ctx.createOscillator();
    this.hum.type = 'sawtooth';
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 180;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(humLp).connect(this.humGain).connect(this.engineBus);

    const roar = noiseSource();
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.Q.value = 0.7;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    roar.connect(this.roarFilter).connect(this.roarGain).connect(this.engineBus);

    this.whine = ctx.createOscillator();
    this.whine.type = 'sine';
    this.whine2 = ctx.createOscillator();
    this.whine2.type = 'triangle';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    // Slow vibrato for a less synthetic turbine tone.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(this.whine.frequency);
    this.whine.connect(this.whineGain);
    this.whine2.connect(this.whineGain);
    this.whineGain.connect(this.engineBus);

    const wind = noiseSource();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.Q.value = 0.9;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.windBus);

    for (const n of [this.hum, this.whine, this.whine2, lfo]) {
      n.start();
      this.nodes.push(n);
    }
    roar.start();
    wind.start();
    this.applyVolumes();
    console.info('[Audio] procedural audio started');
  }

  applyVolumes(): void {
    if (!this.ctx || !this.master || !this.engineBus || !this.windBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.enabled ? this.settings.master * 0.6 : 0, t, 0.15);
    this.engineBus.gain.setTargetAtTime(this.settings.engine, t, 0.1);
    this.windBus.gain.setTargetAtTime(this.settings.wind, t, 0.1);
  }

  /** n1: engine spool 0..1, airspeed in m/s. Smoothed with setTargetAtTime to avoid clicks. */
  update(n1: number, airspeed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.hum || !this.whine || !this.whine2 || !this.humGain || !this.whineGain || !this.roarFilter || !this.roarGain || !this.windFilter || !this.windGain) return;
    const t = ctx.currentTime;
    const k = 0.12;
    const n = 0.22 + 0.78 * n1;
    this.hum.frequency.setTargetAtTime(38 + 52 * n, t, k);
    this.humGain.gain.setTargetAtTime(0.18 + 0.25 * n, t, k);
    this.whine.frequency.setTargetAtTime(900 + 2600 * n, t, k);
    this.whine2.frequency.setTargetAtTime(1820 + 5000 * n, t, k);
    this.whineGain.gain.setTargetAtTime(0.012 + 0.02 * n, t, k);
    this.roarFilter.frequency.setTargetAtTime(220 + 900 * n, t, k);
    this.roarGain.gain.setTargetAtTime(0.05 + 0.5 * n * n, t, k);
    const w = Math.min(1, airspeed / 160);
    this.windFilter.frequency.setTargetAtTime(250 + 2200 * w, t, 0.2);
    this.windGain.gain.setTargetAtTime(0.5 * w * w, t, 0.2);
  }

  /** Pause: duck everything smoothly rather than cutting off. */
  setPaused(paused: boolean): void {
    if (!this.ctx || !this.master) return;
    const target = paused || !this.settings.enabled ? 0 : this.settings.master * 0.6;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch (err) {
        console.debug('[Audio] node already stopped', err);
      }
      n.disconnect();
    }
    this.nodes = [];
    this.master?.disconnect();
    this.master = this.engineBus = this.windBus = null;
    this.hum = this.whine = this.whine2 = null;
  }
}
