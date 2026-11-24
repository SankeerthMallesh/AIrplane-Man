import type { AircraftState } from '../physics/FlightModel';
import { metersToFeet, mpsToFpm, mpsToKnots } from '../utils/MathUtils';
import type { AircraftConfiguration } from '../data/aircraft';

/** Display-ready flight values. Pure conversion from physical SI state; never feeds back into physics. */
export interface HudViewModel {
  readonly iasKt: number;
  readonly gsKt: number;
  readonly altitudeFt: number;
  readonly radioAltFt: number;
  readonly verticalSpeedFpm: number;
  readonly headingDeg: number;
  readonly pitchDeg: number;
  readonly bankDeg: number;
  readonly throttlePct: number;
  readonly flaps: string;
  readonly gear: 'DOWN' | 'UP' | 'TRANSIT';
  readonly brakes: boolean;
  readonly onGround: boolean;
  readonly stall: boolean;
  readonly stallWarning: boolean;
  readonly overspeed: boolean;
  readonly gearWarning: boolean;
  readonly offRunway: boolean;
  readonly mach: number;
}

export function formatFlightData(s: AircraftState, cfg: AircraftConfiguration): HudViewModel {
  const iasKt = mpsToKnots(s.indicatedAirspeed);
  const radioAltFt = metersToFeet(s.heightAglM);
  const vs = mpsToFpm(s.verticalSpeed);
  return {
    iasKt,
    gsKt: mpsToKnots(s.groundSpeed),
    altitudeFt: metersToFeet(s.altitudeMslM),
    radioAltFt,
    verticalSpeedFpm: vs,
    headingDeg: s.headingDeg,
    pitchDeg: s.pitchDeg,
    bankDeg: s.bankDeg,
    throttlePct: Math.round(s.throttleCommand * 100),
    flaps: cfg.flaps[s.flapIndex]?.name ?? 'UP',
    gear: s.gearPosition > 0.99 ? 'DOWN' : s.gearPosition < 0.01 ? 'UP' : 'TRANSIT',
    brakes: s.brakes,
    onGround: s.onGround,
    stall: s.stalled,
    stallWarning: s.stallWarning,
    overspeed: iasKt > cfg.vmoKt || iasKt > (cfg.flaps[s.flapIndex]?.maxSpeedKt ?? 999) + 5,
    gearWarning: !s.onGround && s.gearPosition < 0.99 && radioAltFt < 800 && vs < -200,
    offRunway: s.onGround && !s.onRunway && s.groundSpeed > 3,
    mach: s.mach,
  };
}

export const pad3 = (n: number): string => String(Math.round(n) % 360).padStart(3, '0');
