import { Matrix4, Quaternion, Vector3 } from 'three';
import { DEG_TO_RAD, RAD_TO_DEG, wrapDegrees360 } from '../utils/MathUtils';

/**
 * WGS84 ellipsoid. Only `a` and `f` are defining constants; everything else is derived.
 */
export const WGS84 = (() => {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  return { a, f, b, e2, ep2 } as const;
})();

/** Geodetic position. Degrees for angles, metres above the WGS84 ellipsoid for height. */
export interface GeodeticCoordinate {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly heightM: number;
}

/** Geodetic -> Earth-Centred Earth-Fixed (metres). */
export function geodeticToECEF(g: GeodeticCoordinate, target: Vector3 = new Vector3()): Vector3 {
  const lat = g.latitudeDeg * DEG_TO_RAD;
  const lon = g.longitudeDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
  return target.set(
    (n + g.heightM) * cosLat * Math.cos(lon),
    (n + g.heightM) * cosLat * Math.sin(lon),
    (n * (1 - WGS84.e2) + g.heightM) * sinLat,
  );
}

/**
 * ECEF -> geodetic using Bowring's parametric-latitude iteration. Height uses
 * h = p·cosφ + z·sinφ − a·sqrt(1 − e²sin²φ), which has no division by cosφ and is
 * therefore stable at the poles.
 */
export function ecefToGeodetic(p: Vector3): GeodeticCoordinate {
  const { a, b, e2, ep2, f } = WGS84;
  const x = p.x;
  const y = p.y;
  const z = p.z;
  const rho = Math.hypot(x, y);
  const lon = Math.atan2(y, x);
  let beta = Math.atan2(z, (1 - f) * rho);
  let lat = 0;
  for (let i = 0; i < 4; i++) {
    const sb = Math.sin(beta);
    const cb = Math.cos(beta);
    lat = Math.atan2(z + ep2 * b * sb * sb * sb, rho - e2 * a * cb * cb * cb);
    beta = Math.atan2((1 - f) * Math.sin(lat), Math.cos(lat));
  }
  const sinLat = Math.sin(lat);
  const h = rho * Math.cos(lat) + z * sinLat - a * Math.sqrt(1 - e2 * sinLat * sinLat);
  return { latitudeDeg: lat * RAD_TO_DEG, longitudeDeg: lon * RAD_TO_DEG, heightM: h };
}

/**
 * Local tangent plane anchored at a geodetic origin, expressed in the project's
 * Three.js convention:  X = East, Y = Up, Z = South (so North = −Z).
 * This is an East-Up-South frame; it is right-handed because E × U = S.
 */
export class LocalTangentPlane {
  readonly origin: GeodeticCoordinate;
  readonly originEcef: Vector3;
  /** Unit basis vectors expressed in ECEF. */
  readonly east = new Vector3();
  readonly north = new Vector3();
  readonly up = new Vector3();
  private readonly scratch = new Vector3();

  constructor(origin: GeodeticCoordinate) {
    this.origin = origin;
    this.originEcef = geodeticToECEF(origin);
    const lat = origin.latitudeDeg * DEG_TO_RAD;
    const lon = origin.longitudeDeg * DEG_TO_RAD;
    const sLat = Math.sin(lat);
    const cLat = Math.cos(lat);
    const sLon = Math.sin(lon);
    const cLon = Math.cos(lon);
    this.east.set(-sLon, cLon, 0);
    this.north.set(-sLat * cLon, -sLat * sLon, cLat);
    this.up.set(cLat * cLon, cLat * sLon, sLat);
  }

  ecefToLocal(ecef: Vector3, target: Vector3 = new Vector3()): Vector3 {
    const d = this.scratch.subVectors(ecef, this.originEcef);
    return target.set(d.dot(this.east), d.dot(this.up), -d.dot(this.north));
  }

  localToECEF(local: Vector3, target: Vector3 = new Vector3()): Vector3 {
    return target
      .copy(this.originEcef)
      .addScaledVector(this.east, local.x)
      .addScaledVector(this.up, local.y)
      .addScaledVector(this.north, -local.z);
  }

  geodeticToLocal(g: GeodeticCoordinate, target: Vector3 = new Vector3()): Vector3 {
    return this.ecefToLocal(geodeticToECEF(g, this.scratch.clone()), target);
  }

  localToGeodetic(local: Vector3): GeodeticCoordinate {
    return ecefToGeodetic(this.localToECEF(local, new Vector3()));
  }

  getLocalNorthDirection(target: Vector3 = new Vector3()): Vector3 {
    return target.set(0, 0, -1);
  }

  getLocalEastDirection(target: Vector3 = new Vector3()): Vector3 {
    return target.set(1, 0, 0);
  }

  getLocalUpDirection(target: Vector3 = new Vector3()): Vector3 {
    return target.set(0, 1, 0);
  }

  /**
   * Matrix mapping ECEF positions into this local frame: rows are (E, U, −N) and the
   * translation is −R·origin. Used to place ECEF-native 3D Tiles in the local scene.
   */
  getEcefToLocalMatrix(target: Matrix4 = new Matrix4()): Matrix4 {
    const { east: e, up: u, north: n, originEcef: o } = this;
    return target.set(
      e.x, e.y, e.z, -e.dot(o),
      u.x, u.y, u.z, -u.dot(o),
      -n.x, -n.y, -n.z, n.dot(o),
      0, 0, 0, 1,
    );
  }
}

const Y_AXIS = new Vector3(0, 1, 0);

/** The single authoritative heading -> horizontal direction conversion (true heading, clockwise from north). */
export function headingToDirection(headingDeg: number, target: Vector3 = new Vector3()): Vector3 {
  const h = headingDeg * DEG_TO_RAD;
  return target.set(Math.sin(h), 0, -Math.cos(h));
}

/** Inverse of headingToDirection: uses only the horizontal components. */
export function directionToHeading(dir: Vector3): number {
  return wrapDegrees360(Math.atan2(dir.x, -dir.z) * RAD_TO_DEG);
}

/**
 * Orientation whose forward axis (−Z) points along the heading. Because +Y rotation
 * turns −Z toward −X (west), compass heading maps to a rotation of −h about Y.
 */
export function headingToQuaternion(headingDeg: number, target: Quaternion = new Quaternion()): Quaternion {
  return target.setFromAxisAngle(Y_AXIS, -headingDeg * DEG_TO_RAD);
}

/** True bearing from a to b computed in a's tangent plane (accurate for runway-scale distances). */
export function trueBearingDeg(a: GeodeticCoordinate, b: GeodeticCoordinate): number {
  const ltp = new LocalTangentPlane(a);
  return directionToHeading(ltp.geodeticToLocal(b));
}

/** Straight-line distance in metres between two geodetic points. */
export function ecefDistance(a: GeodeticCoordinate, b: GeodeticCoordinate): number {
  return geodeticToECEF(a).distanceTo(geodeticToECEF(b));
}
