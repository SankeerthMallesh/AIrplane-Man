import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AIRPORTS } from '../src/data/airports';
import { LocalTangentPlane, directionToHeading, ecefToGeodetic, geodeticToECEF, headingToDirection, headingToQuaternion } from '../src/geo/Geodesy';

describe('WGS84 geodesy', () => {
  it('equator/prime meridian maps to semi-major axis', () => {
    const p = geodeticToECEF({ latitudeDeg: 0, longitudeDeg: 0, heightM: 0 });
    expect(p.x).toBeCloseTo(6378137, 3);
    expect(Math.abs(p.y) + Math.abs(p.z)).toBeLessThan(1e-6);
  });
  for (const a of AIRPORTS) {
    it(`${a.iata} round trip < 1 mm`, () => {
      const g = { latitudeDeg: a.latitudeDeg, longitudeDeg: a.longitudeDeg, heightM: 100 };
      const back = ecefToGeodetic(geodeticToECEF(g));
      expect(Math.abs(back.latitudeDeg - g.latitudeDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.longitudeDeg - g.longitudeDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.heightM - g.heightM)).toBeLessThan(1e-3);
    });
  }
  it('handles the pole', () => {
    const g = ecefToGeodetic(geodeticToECEF({ latitudeDeg: 90, longitudeDeg: 0, heightM: 500 }));
    expect(g.latitudeDeg).toBeCloseTo(90, 6);
    expect(g.heightM).toBeCloseTo(500, 3);
  });
  it('local frame: north is -Z, east is +X, up is +Y', () => {
    const ltp = new LocalTangentPlane({ latitudeDeg: 40.64, longitudeDeg: -73.78, heightM: 0 });
    const north = ltp.geodeticToLocal({ latitudeDeg: 40.65, longitudeDeg: -73.78, heightM: 0 });
    const east = ltp.geodeticToLocal({ latitudeDeg: 40.64, longitudeDeg: -73.77, heightM: 0 });
    const up = ltp.geodeticToLocal({ latitudeDeg: 40.64, longitudeDeg: -73.78, heightM: 100 });
    expect(north.z).toBeLessThan(-1000);
    expect(Math.abs(north.x)).toBeLessThan(1);
    expect(east.x).toBeGreaterThan(800);
    expect(up.y).toBeCloseTo(100, 4);
    const back = ltp.localToGeodetic(new Vector3(1234, 56, -789));
    expect(ltp.geodeticToLocal(back).distanceTo(new Vector3(1234, 56, -789))).toBeLessThan(1e-4);
  });
  it('ECEF→local matrix matches ecefToLocal', () => {
    const ltp = new LocalTangentPlane({ latitudeDeg: -33.9, longitudeDeg: 151.2, heightM: 20 });
    const e = geodeticToECEF({ latitudeDeg: -33.89, longitudeDeg: 151.21, heightM: 300 });
    const viaMatrix = e.clone().applyMatrix4(ltp.getEcefToLocalMatrix());
    expect(viaMatrix.distanceTo(ltp.ecefToLocal(e))).toBeLessThan(1e-3);
  });
});

describe('heading convention', () => {
  const cases: Array<[number, [number, number]]> = [[0, [0, -1]], [90, [1, 0]], [180, [0, 1]], [270, [-1, 0]]];
  for (const [h, [x, z]] of cases) {
    it(`heading ${h}`, () => {
      const d = headingToDirection(h);
      expect(d.x).toBeCloseTo(x, 9);
      expect(d.z).toBeCloseTo(z, 9);
      expect(directionToHeading(d)).toBeCloseTo(h % 360, 9);
      const f = new Vector3(0, 0, -1).applyQuaternion(headingToQuaternion(h));
      expect(f.x).toBeCloseTo(x, 9);
      expect(f.z).toBeCloseTo(z, 9);
    });
  }
});
