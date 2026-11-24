import { describe, expect, it } from 'vitest';
import { AIRPORTS, findRunwayEnd } from '../src/data/airports';
import { AirportFrame } from '../src/world/AirportFrame';
import { feetToMeters } from '../src/utils/MathUtils';

describe('airport data', () => {
  it('has the five required airports', () => {
    expect(AIRPORTS.map((a) => a.iata).sort()).toEqual(['HND', 'JFK', 'LAX', 'LHR', 'SXM']);
  });
  for (const a of AIRPORTS) {
    it(`${a.iata} runways: true heading near designator, length plausible, spawn aligned`, () => {
      const sel = findRunwayEnd(a, a.defaultRunwayEnd);
      expect(sel).toBeDefined();
      if (!sel) return;
      const frame = new AirportFrame(a, sel);
      for (const r of frame.runways) {
        r.data.ends.forEach((end, i) => {
          const designator = Number(end.ident.replace(/[LRC]/, '')) * 10;
          const diff = Math.abs(((r.headings[i] - designator + 540) % 360) - 180);
          expect(diff).toBeLessThan(25); // magnetic variation (LAX ~12°E) + designator rounding
        });
        expect(Math.abs(r.lengthM - feetToMeters(r.data.lengthFt)) / feetToMeters(r.data.lengthFt)).toBeLessThan(0.12);
      }
      const spawn = frame.spawn();
      expect(frame.isOnRunway(spawn.position.x, spawn.position.z)).toBe(true);
      expect(spawn.headingDeg).toBeCloseTo(frame.selectedRunway.headings[sel.endIndex], 6);
    });
  }
});
