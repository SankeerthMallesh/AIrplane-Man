import { Vector3 } from 'three';
import type { AirportData, RunwayData, RunwaySelection } from '../data/airports';
import { LocalTangentPlane, directionToHeading } from '../geo/Geodesy';
import { feetToMeters } from '../utils/MathUtils';
import type { SimulationFrame } from '../physics/FlightModel';

/** A runway resolved into the airport-local frame. */
export interface LocalRunway {
  readonly data: RunwayData;
  readonly ends: readonly [Vector3, Vector3];
  readonly center: Vector3;
  /** Unit vector from end 0 to end 1. */
  readonly direction: Vector3;
  readonly lengthM: number;
  readonly widthM: number;
  /** True heading when departing from end 0 / end 1. */
  readonly headings: readonly [number, number];
}

/** Supported operating radius of the airport-centred frame (see README "Floating origin"). */
export const SUPPORTED_RADIUS_M = 80000;

/**
 * Airport-centred local frame (the project's floating-origin strategy): every flight gets a
 * fresh East-Up-South tangent plane at the selected runway's centre, at runway elevation, so
 * scene coordinates stay small. Y = 0 is the runway surface; the ground plane is flat at y = 0.
 */
export class AirportFrame implements SimulationFrame {
  readonly ltp: LocalTangentPlane;
  readonly runways: LocalRunway[];
  readonly geoidUndulationM: number;
  readonly originElevationMslM: number;

  constructor(readonly airport: AirportData, readonly selection: RunwaySelection) {
    const r = selection.runway;
    const elevFt = (r.ends[0].elevationFt + r.ends[1].elevationFt) / 2;
    this.originElevationMslM = feetToMeters(elevFt);
    this.geoidUndulationM = airport.geoidUndulationM;
    this.ltp = new LocalTangentPlane({
      latitudeDeg: (r.ends[0].latitudeDeg + r.ends[1].latitudeDeg) / 2,
      longitudeDeg: (r.ends[0].longitudeDeg + r.ends[1].longitudeDeg) / 2,
      heightM: this.originElevationMslM + airport.geoidUndulationM,
    });
    this.runways = airport.runways.map((data) => this.resolve(data));
  }

  private resolve(data: RunwayData): LocalRunway {
    const toLocal = (e: RunwayData['ends'][number]): Vector3 => {
      const v = this.ltp.geodeticToLocal({ latitudeDeg: e.latitudeDeg, longitudeDeg: e.longitudeDeg, heightM: this.ltp.origin.heightM });
      v.y = 0;
      return v;
    };
    const ends: readonly [Vector3, Vector3] = [toLocal(data.ends[0]), toLocal(data.ends[1])];
    const [a, b] = ends;
    const direction = new Vector3().subVectors(b, a).normalize();
    const back = direction.clone().negate();
    return {
      data, ends,
      center: new Vector3().addVectors(a, b).multiplyScalar(0.5),
      direction,
      lengthM: a.distanceTo(b),
      widthM: feetToMeters(data.widthFt),
      headings: [directionToHeading(direction), directionToHeading(back)],
    };
  }

  get selectedRunway(): LocalRunway {
    const found = this.runways.find((r) => r.data === this.selection.runway);
    if (!found) throw new Error('Selected runway is not part of the airport');
    return found;
  }

  /** Spawn on the centreline, 70 m past the departure end, aligned with the runway. */
  spawn(): { position: Vector3; headingDeg: number } {
    const rw = this.selectedRunway;
    const i = this.selection.endIndex;
    const start = rw.ends[i];
    const dir = i === 0 ? rw.direction : rw.direction.clone().negate();
    return { position: start.clone().addScaledVector(dir, 70), headingDeg: rw.headings[i] };
  }

  groundHeightAt(): number {
    return 0;
  }

  isOnRunway(x: number, z: number): boolean {
    for (const r of this.runways) {
      const dx = x - r.center.x;
      const dz = z - r.center.z;
      const along = dx * r.direction.x + dz * r.direction.z;
      const across = -dx * r.direction.z + dz * r.direction.x;
      if (Math.abs(along) <= r.lengthM / 2 + 60 && Math.abs(across) <= r.widthM / 2 + 8) return true;
    }
    return false;
  }
}
