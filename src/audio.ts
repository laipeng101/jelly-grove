/** Short, pentatonic gestures: frequent actions stay small; rewards get space. */
export type SoundKind =
  | "tap"
  | "match"
  | "error"
  | "win"
  | "fever"
  | "feverEnd"
  | "shuffle"
  | "hint"
  | "undo"
  | "round"
  | "time"
  | "finish";
export type SoundDetail = {
  combo?: number;
  fruit?: number;
  fever?: boolean;
  startedFever?: boolean;
  cleared?: "round" | "win";
};
export type Note = {
  frequency: number;
  delay: number;
  duration: number;
  gain: number;
  bend: number;
  attack: number;
  shoulder: number;
  role: "body" | "droplet" | "accent";
};
// IDs match FRUITS in art.ts. The melody stays fixed; only the material changes.
const FRUIT_VOICES = [
  { tail: 0.132, sparkle: 0.09, droplet: 0.068, bend: 1.012 }, // strawberry: light spring
  { tail: 0.137, sparkle: 0.096, droplet: 0.073, bend: 1.01 }, // orange: bright juice
  { tail: 0.122, sparkle: 0.099, droplet: 0.061, bend: 1.006 }, // lime: crisp, quick
  { tail: 0.125, sparkle: 0.086, droplet: 0.062, bend: 1.014 }, // blueberry: tiny bead
  { tail: 0.153, sparkle: 0.082, droplet: 0.079, bend: 1.01 }, // peach: soft finish
  { tail: 0.143, sparkle: 0.087, droplet: 0.075, bend: 1.016 }, // grape: round droplet
  { tail: 0.151, sparkle: 0.092, droplet: 0.088, bend: 1.018 }, // watermelon: clear water
  { tail: 0.129, sparkle: 0.095, droplet: 0.065, bend: 1.004 }, // pear: clean snap
  { tail: 0.127, sparkle: 0.093, droplet: 0.063, bend: 1.008 }, // cherry: light, neat
  { tail: 0.157, sparkle: 0.084, droplet: 0.081, bend: 1.012 }, // mango: full finish
] as const;
export function score(kind: SoundKind, detail: SoundDetail = {}): Note[] {
  const notes: Note[] = [];
  const note = (
    frequency: number,
    delay = 0,
    duration = 0.16,
    gain = 0.16,
    bend = 1.004,
  ): Note => ({
    frequency,
    delay,
    duration,
    gain,
    bend,
    attack: 0.004,
    shoulder: 0.032,
    role: "accent",
  });
  const phrase = (
    pitches: number[],
    step: number,
    gain: number,
    duration = 0.24,
  ) => pitches.forEach((f, i) => notes.push(note(f, i * step, duration, gain)));
  if (kind === "match") {
    const combo = Number.isFinite(detail.combo)
      ? Math.max(1, Math.floor(detail.combo!))
      : 1;
    const lead = [392, 440, 493.88, 587.33, 659.25, 587.33];
    const flow = [659.25, 587.33, 493.88, 587.33, 739.99, 659.25, 493.88, 440];
    const f = combo <= 6 ? lead[combo - 1] : flow[(combo - 7) % flow.length];
    const fruit = FRUIT_VOICES[(detail.fruit ?? 1) - 1] ?? FRUIT_VOICES[0];
    const droplet: Note = {
      ...note(f * 2, 0, fruit.droplet, fruit.sparkle, fruit.bend),
      role: "droplet",
      attack: 0.0025,
      shoulder: 0.017,
    };
    // Even a board clear retains the fruit's instant acknowledgement. Leave a
    // short gap before the shared reward motif; never stack full match + fanfare.
    const reward =
      detail.cleared ?? (detail.startedFever ? "fever" : undefined);
    if (reward)
      return [
        droplet,
        ...score(reward).map((n) => ({ ...n, delay: n.delay + 0.055 })),
      ];
    notes.push({
      ...note(f, 0, fruit.tail, 0.205, 1.003),
      role: "body",
      attack: 0.003,
      shoulder: 0.029,
    });
    notes.push(droplet);
    if (detail.fever) notes.push(note(f * 1.5, 0.052, 0.1, 0.048, 1.006));
    if (combo >= 12 && combo % 12 === 0) {
      notes.push(note(739.99, 0.1, 0.18, 0.09));
      notes.push(note(987.77, 0.2, 0.22, 0.07));
    }
  }
  if (kind === "tap") notes.push(note(780, 0, 0.058, 0.1, 1.015));
  if (kind === "error") {
    notes.push(note(392, 0, 0.1, 0.105, 1));
    notes.push(note(349.23, 0.07, 0.12, 0.085, 1));
  }
  if (kind === "hint") phrase([587.33, 739.99], 0.075, 0.115, 0.19);
  if (kind === "undo") phrase([587.33, 440], 0.07, 0.115, 0.15);
  if (kind === "shuffle") phrase([493.88, 659.25, 440], 0.055, 0.12, 0.14);
  if (kind === "fever")
    phrase([493.88, 659.25, 739.99, 987.77], 0.065, 0.15, 0.25);
  if (kind === "feverEnd") phrase([659.25, 493.88], 0.09, 0.075, 0.19);
  if (kind === "round") phrase([493.88, 659.25, 987.77], 0.085, 0.16, 0.25);
  if (kind === "win")
    phrase([392, 493.88, 659.25, 987.77, 783.99], 0.095, 0.17, 0.32);
  if (kind === "time") phrase([659.25, 659.25], 0.16, 0.105, 0.14);
  if (kind === "finish") phrase([659.25, 493.88, 392], 0.13, 0.15, 0.32);
  return notes;
}

type Voice = { osc: OscillatorNode; gain: GainNode; end: number };
export class SoundEngine {
  private master: GainNode;
  private voices: Voice[] = [];
  private last = new Map<SoundKind, number>();
  private rewardUntil = 0;
  constructor(private context: BaseAudioContext) {
    // Pure partials avoid the roughness of a shared harmonically rich sweep.
    // The octave droplet has its own short envelope, leaving a clean sine tail.
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 6000;
    filter.Q.value = 0.5;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.08;
    this.master = context.createGain();
    this.master.gain.value = 0.8;
    filter
      .connect(compressor)
      .connect(this.master)
      .connect(context.destination);
    this.input = filter;
  }
  private input: AudioNode;
  setVolume(value: number) {
    const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
    this.master.gain.cancelAndHoldAtTime(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(
      v,
      this.context.currentTime + 0.012,
    );
    if (v === 0) this.stop();
  }
  private release(voice: Voice, at: number) {
    voice.gain.gain.cancelAndHoldAtTime(at);
    voice.gain.gain.linearRampToValueAtTime(0, at + 0.012);
    voice.osc.stop(at + 0.015);
  }
  stop() {
    for (const voice of this.voices)
      this.release(voice, this.context.currentTime);
    this.voices = [];
    this.last.clear();
    this.rewardUntil = 0;
  }
  play(
    kind: SoundKind,
    detail: SoundDetail = {},
    at = this.context.currentTime,
  ) {
    if (
      at - (this.last.get(kind) ?? -Infinity) <
      (kind === "tap" ? 0.045 : 0.075)
    )
      return;
    this.last.set(kind, at);
    const reward =
      kind === "win" ||
      kind === "round" ||
      kind === "finish" ||
      kind === "fever" ||
      !!detail.cleared ||
      !!detail.startedFever;
    this.voices = this.voices.filter((v) => v.end > at);
    if (reward) {
      for (const voice of this.voices) this.release(voice, at);
      this.voices = [];
      this.rewardUntil = at + 0.42;
    }
    const duck = !reward && at < this.rewardUntil ? 0.48 : 1;
    for (const n of score(kind, detail)) {
      if (this.voices.length >= 12) this.release(this.voices.shift()!, at);
      const osc = this.context.createOscillator(),
        gain = this.context.createGain();
      const start = at + n.delay,
        end = start + n.duration;
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.frequency * n.bend, start);
      osc.frequency.exponentialRampToValueAtTime(n.frequency, start + 0.016);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(n.gain * duck, start + n.attack);
      gain.gain.exponentialRampToValueAtTime(
        n.gain * duck * 0.48,
        start + Math.min(n.shoulder, n.duration / 2),
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.gain.linearRampToValueAtTime(0, end + 0.005);
      osc.connect(gain).connect(this.input);
      const voice = { osc, gain, end: end + 0.01 };
      this.voices.push(voice);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.voices = this.voices.filter((v) => v !== voice);
      };
      osc.start(start);
      osc.stop(voice.end);
    }
  }
}
let ctx: AudioContext | undefined;
let engine: SoundEngine | undefined;
let enabled = true;
let volume = 0.8;
export function stopAudio() {
  engine?.stop();
}
export function setSound(on: boolean) {
  enabled = on;
  if (!on) stopAudio();
}
export function setVolume(value: number) {
  volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
  engine?.setVolume(volume);
}
export function initAudio() {
  if (!enabled) return;
  try {
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      engine = new SoundEngine(ctx);
      engine.setVolume(volume);
    }
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  } catch {
    /* Audio remains optional when unavailable. */
  }
}
export function sound(kind: SoundKind, detail: SoundDetail = {}) {
  if (!enabled || volume === 0) return;
  initAudio();
  engine?.play(kind, detail);
}
