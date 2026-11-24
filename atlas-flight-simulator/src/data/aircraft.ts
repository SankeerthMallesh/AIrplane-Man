/**
 * Performance configuration for the fictional Atlas AJ-220 twinjet. These are tuned game values
 * loosely in the range of a 65-tonne narrow-body; they are NOT certified aircraft data.
 * Body axes: forward = −Z, up = +Y, right = +X, origin at the centre of gravity.
 */
export type Vec3Tuple = readonly [number, number, number];

export type ContactKind = 'wheel' | 'structure' | 'critical';

export interface ContactPoint {
  readonly name: string;
  readonly kind: ContactKind;
  readonly position: Vec3Tuple;
  readonly steerable?: boolean;
  readonly braked?: boolean;
}

export interface FlapSetting {
  readonly name: 'UP' | 'TAKEOFF' | 'LANDING';
  readonly deflection: number;
  readonly maxSpeedKt: number;
}

export interface AircraftConfiguration {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly description: string;
  readonly massKg: number;
  readonly wingAreaM2: number;
  readonly wingSpanM: number;
  readonly meanChordM: number;
  readonly engineCount: number;
  readonly maxThrustPerEngineN: number;
  readonly idleThrustFraction: number;
  readonly spoolTimeConstantS: number;
  readonly vmoKt: number;
  readonly aero: {
    readonly cl0: number;
    readonly clAlphaPerRad: number;
    readonly stallAlphaDeg: number;
    readonly negativeStallAlphaDeg: number;
    readonly cd0: number;
    readonly oswald: number;
    readonly gearCd: number;
    readonly flapClMax: number;
    readonly flapCdMax: number;
    readonly flapStallAlphaReductionDeg: number;
    readonly spoilerCd: number;
    readonly sideForcePerRad: number;
    readonly dragRiseMach: number;
  };
  readonly control: {
    readonly referenceSpeedKt: number;
    readonly pitchAuthority: number;
    readonly rollAuthority: number;
    readonly yawAuthority: number;
    readonly pitchDamping: number;
    readonly rollDamping: number;
    readonly yawDamping: number;
    readonly pitchStability: number;
    readonly yawStability: number;
    readonly dihedralEffect: number;
    readonly stallPitchDown: number;
    readonly trimAlphaDeg: number;
    readonly maxPitchRateDeg: number;
    readonly maxRollRateDeg: number;
  };
  readonly inertia: { readonly pitch: number; readonly yaw: number; readonly roll: number };
  readonly ground: {
    readonly wheelStiffness: number;
    readonly wheelDamping: number;
    readonly structureStiffness: number;
    readonly structureDamping: number;
    readonly rollingResistance: number;
    readonly brakeFriction: number;
    readonly lateralFriction: number;
    readonly structureFriction: number;
    readonly maxSteerDeg: number;
  };
  readonly contacts: readonly ContactPoint[];
  readonly flaps: readonly FlapSetting[];
  readonly cockpitEye: Vec3Tuple;
  readonly gearTransitionS: number;
  readonly flapRatePerS: number;
}

export const ATLAS_AJ220: AircraftConfiguration = {
  id: 'aj220',
  name: 'AJ-220',
  manufacturer: 'Atlas Aeronautics (fictional)',
  description: 'Fictional 180-seat single-aisle twinjet with high-bypass turbofans.',
  massKg: 64000,
  wingAreaM2: 122.6,
  wingSpanM: 34.1,
  meanChordM: 4.2,
  engineCount: 2,
  maxThrustPerEngineN: 120000,
  idleThrustFraction: 0.05,
  spoolTimeConstantS: 1.8,
  vmoKt: 350,
  aero: {
    cl0: 0.24,
    clAlphaPerRad: 5.3,
    stallAlphaDeg: 14,
    negativeStallAlphaDeg: -11,
    cd0: 0.023,
    oswald: 0.8,
    gearCd: 0.018,
    flapClMax: 0.75,
    flapCdMax: 0.06,
    flapStallAlphaReductionDeg: 2,
    spoilerCd: 0.05,
    sideForcePerRad: 0.9,
    dragRiseMach: 0.78,
  },
  control: {
    referenceSpeedKt: 160,
    pitchAuthority: 0.9,
    rollAuthority: 1.6,
    yawAuthority: 0.35,
    pitchDamping: 2.4,
    rollDamping: 2.2,
    yawDamping: 1.6,
    pitchStability: 3.2,
    yawStability: 1.8,
    dihedralEffect: 0.8,
    stallPitchDown: 4.5,
    trimAlphaDeg: 3,
    maxPitchRateDeg: 5,
    maxRollRateDeg: 18,
  },
  inertia: { pitch: 3.0e6, yaw: 4.4e6, roll: 1.4e6 },
  ground: {
    wheelStiffness: 1.1e6,
    wheelDamping: 1.6e5,
    structureStiffness: 2.0e6,
    structureDamping: 3.0e5,
    rollingResistance: 0.018,
    brakeFriction: 0.45,
    lateralFriction: 0.8,
    structureFriction: 0.5,
    maxSteerDeg: 55,
  },
  contacts: [
    { name: 'Nose gear', kind: 'wheel', position: [0, -3.3, -12.5], steerable: true },
    { name: 'Left main gear', kind: 'wheel', position: [-3.8, -3.3, 1.6], braked: true },
    { name: 'Right main gear', kind: 'wheel', position: [3.8, -3.3, 1.6], braked: true },
    { name: 'Forward belly', kind: 'structure', position: [0, -2.0, -9] },
    { name: 'Aft belly', kind: 'structure', position: [0, -1.9, 7] },
    { name: 'Tail', kind: 'structure', position: [0, -0.6, 15.5] },
    { name: 'Left engine', kind: 'critical', position: [-5.7, -3.05, -4] },
    { name: 'Right engine', kind: 'critical', position: [5.7, -3.05, -4] },
    { name: 'Left wingtip', kind: 'critical', position: [-17.0, 0.3, 4.2] },
    { name: 'Right wingtip', kind: 'critical', position: [17.0, 0.3, 4.2] },
  ],
  flaps: [
    { name: 'UP', deflection: 0, maxSpeedKt: 350 },
    { name: 'TAKEOFF', deflection: 0.45, maxSpeedKt: 215 },
    { name: 'LANDING', deflection: 1, maxSpeedKt: 177 },
  ],
  cockpitEye: [0, 1.05, -16.3],
  gearTransitionS: 7,
  flapRatePerS: 0.12,
};
