let ctx: AudioContext | undefined;
let enabled = true;
export function setSound(on: boolean) {
  enabled = on;
}
export function initAudio() {
  if (!enabled) return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* Audio is optional. */
  }
}
function tone(
  freq: number,
  when: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  if (!enabled || !ctx) return;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  gain.gain.setValueAtTime(0, ctx.currentTime + when);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.012);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + when + duration,
  );
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.01);
}
export function sound(
  kind: "tap" | "match" | "error" | "win" | "fever" | "shuffle",
  combo = 1,
) {
  if (!enabled) return;
  initAudio();
  const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
  if (kind === "tap") tone(520, 0, 0.075, 0.035);
  if (kind === "error") {
    tone(220, 0, 0.1, 0.025);
    tone(196, 0.07, 0.1, 0.02);
  }
  if (kind === "match") {
    const f = scale[Math.min(combo - 1, 7)];
    tone(f, 0, 0.28, 0.075);
    tone(f * 2, 0.035, 0.18, 0.025);
    tone(f * 1.5, 0.06, 0.25, 0.03);
  }
  if (kind === "win")
    [0, 2, 3, 5, 7].forEach((n, i) => tone(scale[n], i * 0.09, 0.4, 0.075));
  if (kind === "fever")
    [0, 2, 4, 5].forEach((n, i) => tone(scale[n] * 2, i * 0.06, 0.5, 0.055));
  if (kind === "shuffle")
    [4, 3, 2, 0].forEach((n, i) => tone(scale[n], i * 0.045, 0.16, 0.04));
}
