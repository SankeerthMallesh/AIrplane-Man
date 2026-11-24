/** Simplified International Standard Atmosphere (troposphere + lower stratosphere), SI units. */
export const SEA_LEVEL_DENSITY = 1.225;
const R = 287.05;
const G0 = 9.80665;

export interface AtmosphereSample {
  readonly temperatureK: number;
  readonly pressurePa: number;
  readonly density: number;
  readonly speedOfSound: number;
}

export function sampleAtmosphere(altitudeMslM: number): AtmosphereSample {
  const h = Math.max(-500, Math.min(20000, altitudeMslM));
  let t: number;
  let p: number;
  if (h <= 11000) {
    t = 288.15 - 0.0065 * h;
    p = 101325 * Math.pow(t / 288.15, 5.25588);
  } else {
    t = 216.65;
    p = 22632.06 * Math.exp((-G0 / (R * t)) * (h - 11000));
  }
  return { temperatureK: t, pressurePa: p, density: p / (R * t), speedOfSound: Math.sqrt(1.4 * R * t) };
}
