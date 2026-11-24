/** Unit conversions and small numeric helpers shared by every subsystem. */
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const KNOTS_PER_MPS = 1.9438444924406;
export const FEET_PER_METER = 3.280839895;
export const FPM_PER_MPS = 196.8503937;

export const degToRad = (deg: number): number => deg * DEG_TO_RAD;
export const radToDeg = (rad: number): number => rad * RAD_TO_DEG;
export const mpsToKnots = (mps: number): number => mps * KNOTS_PER_MPS;
export const knotsToMps = (kt: number): number => kt / KNOTS_PER_MPS;
export const metersToFeet = (m: number): number => m * FEET_PER_METER;
export const feetToMeters = (ft: number): number => ft / FEET_PER_METER;
export const mpsToFpm = (mps: number): number => mps * FPM_PER_MPS;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Normalises any angle in degrees to [0, 360). */
export function wrapDegrees360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Deterministic PRNG (mulberry32) so procedural scenery is stable per airport. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
