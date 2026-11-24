import { Quaternion, Vector3 } from 'three';
import type { AircraftConfiguration, ContactPoint } from '../data/aircraft';
import { LocalTangentPlane, directionToHeading, headingToQuaternion } from '../geo/Geodesy';
import { clamp, degToRad, knotsToMps, moveTowards, radToDeg } from '../utils/MathUtils';
import { SEA_LEVEL_DENSITY, sampleAtmosphere } from './Atmosphere';

export const GRAVITY = 9.80665;

/** Pilot control demands, each in [-1, 1]. Positive = pitch up / roll right / yaw right. */
export interface ControlInputs {
  pitch: number;
  roll: number;
  yaw: number;
}

export type FlightEvent =
  | { readonly type: 'takeoff' }
  | { readonly type: 'landing'; readonly sinkRateMps: number; readonly onRunway: boolean; readonly hard: boolean }
  | { readonly type: 'stall' }
  | { readonly type: 'stall-recovered' }
  | { readonly type: 'runway-departure' }
  | { readonly type: 'crash'; readonly reason: string }
  | { readonly type: 'gear-blocked' }
  | { readonly type: 'flap-overspeed' };

/** Geometry the physics needs from the world: the ground plane and runway rectangles. */
export interface SimulationFrame {
  readonly ltp: LocalTangentPlane;
  /** Ellipsoid − MSL at the airport, used to report MSL altitude from geodetic height. */
  readonly geoidUndulationM: number;
  groundHeightAt(x: number, z: number): number;
  isOnRunway(x: number, z: number): boolean;
}

/**
 * Canonical aircraft state. Position/velocity are in the local East-Up-South frame (metres),
 * orientation is a quaternion, angular velocity is in BODY axes (x = pitch-up-negative? see below).
 * Body angular velocity components: x about right axis (+ = nose up), y about up axis (+ = nose left),
 * z about the aft axis (+ = roll left).
 */
export class AircraftState {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly acceleration = new Vector3();
  readonly quaternion = new Quaternion();
  readonly angularVelocity = new Vector3();
  throttleCommand = 0;
  throttle = 0;
  flapIndex = 0;
  flapPosition = 0;
  gearDown = true;
  gearPosition = 1;
  brakes = true;
  spoilers = 0;
  crashed = false;
  // Derived each step (never integrated):
  alphaRad = 0;
  betaRad = 0;
  trueAirspeed = 0;
  indicatedAirspeed = 0;
  groundSpeed = 0;
  verticalSpeed = 0;
  altitudeMslM = 0;
  heightAglM = 0;
  pitchDeg = 0;
  bankDeg = 0;
  headingDeg = 0;
  mach = 0;
  onGround = true;
  wheelsOnGround = 0;
  stalled = false;
  stallWarning = false;
  onRunway = true;
  liftN = 0;
  dragN = 0;
  thrustN = 0;
  noseSteerDeg = 0;
  elevator = 0;
  aileron = 0;
  rudder = 0;
}

export interface SpawnConfiguration {
  readonly position: Vector3;
  readonly headingDeg: number;
  readonly airborneSpeedKt?: number;
}

const tmp = {
  fwd: new Vector3(), up: new Vector3(), right: new Vector3(), air: new Vector3(), force: new Vector3(),
  torque: new Vector3(), liftDir: new Vector3(), r: new Vector3(), p: new Vector3(), vp: new Vector3(),
  wWorld: new Vector3(), rollDir: new Vector3(), latDir: new Vector3(), f: new Vector3(), qInv: new Quaternion(),
  dq: new Quaternion(), axis: new Vector3(), angAcc: new Vector3(), contactTorque: new Vector3(),
};

/**
 * Six-degree-of-freedom arcade-simulation hybrid. Forces (lift, drag, side force, thrust,
 * gravity, gear contacts) are integrated with semi-implicit Euler at a fixed timestep.
 * Rotational dynamics use a simplified moment model expressed directly as angular accelerations,
 * scaled by dynamic pressure, plus true torques from ground contacts divided by inertia.
 */
export class FlightModel {
  readonly state = new AircraftState();
  readonly previousPosition = new Vector3();
  readonly previousQuaternion = new Quaternion();
  /** Flight-assist strength 0..1 (rate damping, auto-trim, bank limit). */
  assist = 0.7;
  readonly wind = new Vector3();
  private trimAlpha: number;
  private wasAirborne = false;
  private airborneTimer = 0;
  private runwayDepartureReported = false;
  private readonly contactVectors: Array<{ point: ContactPoint; body: Vector3 }>;
  private readonly aspectRatio: number;

  constructor(readonly config: AircraftConfiguration, readonly frame: SimulationFrame, private readonly emit: (e: FlightEvent) => void = () => undefined) {
    this.trimAlpha = degToRad(config.control.trimAlphaDeg);
    this.contactVectors = config.contacts.map((point) => ({ point, body: new Vector3(...point.position) }));
    this.aspectRatio = (config.wingSpanM * config.wingSpanM) / config.wingAreaM2;
  }

  reset(spawn: SpawnConfiguration): void {
    const s = this.state;
    headingToQuaternion(spawn.headingDeg, s.quaternion);
    s.position.copy(spawn.position);
    s.angularVelocity.set(0, 0, 0);
    s.acceleration.set(0, 0, 0);
    s.crashed = false;
    s.spoilers = 0;
    if (spawn.airborneSpeedKt !== undefined) {
      s.velocity.set(0, 0, -knotsToMps(spawn.airborneSpeedKt)).applyQuaternion(s.quaternion);
      s.gearDown = false; s.gearPosition = 0; s.flapIndex = 0; s.flapPosition = 0; s.brakes = false;
      s.throttleCommand = s.throttle = 0.55;
      this.wasAirborne = true;
    } else {
      // Rest on the gear: wheel bottoms at y = -3.3 in body axes, minus static compression.
      s.position.y = this.frame.groundHeightAt(spawn.position.x, spawn.position.z) + 3.3 - 0.07;
      s.velocity.set(0, 0, 0);
      s.gearDown = true; s.gearPosition = 1; s.flapIndex = 1; s.flapPosition = this.config.flaps[1]?.deflection ?? 0;
      s.brakes = true; s.throttleCommand = 0; s.throttle = 0;
      this.wasAirborne = false;
    }
    this.trimAlpha = degToRad(this.config.control.trimAlphaDeg);
    this.runwayDepartureReported = false;
    this.airborneTimer = 0;
    this.previousPosition.copy(s.position);
    this.previousQuaternion.copy(s.quaternion);
    this.updateDerived();
  }

  setThrottle(value: number): void {
    this.state.throttleCommand = clamp(value, 0, 1);
  }

  toggleGear(): boolean {
    const s = this.state;
    if (s.gearDown && s.wheelsOnGround > 0) {
      this.emit({ type: 'gear-blocked' });
      return false;
    }
    s.gearDown = !s.gearDown;
    return true;
  }

  cycleFlaps(): void {
    const s = this.state;
    s.flapIndex = (s.flapIndex + 1) % this.config.flaps.length;
    const setting = this.config.flaps[s.flapIndex];
    if (setting && s.indicatedAirspeed > knotsToMps(setting.maxSpeedKt)) this.emit({ type: 'flap-overspeed' });
  }

  toggleBrakes(): void {
    this.state.brakes = !this.state.brakes;
  }

  step(dt: number, input: ControlInputs): void {
    const s = this.state;
    const c = this.config;
    this.previousPosition.copy(s.position);
    this.previousQuaternion.copy(s.quaternion);
    if (s.crashed) return;

    // --- Systems -----------------------------------------------------------------------
    s.throttle += (s.throttleCommand - s.throttle) * (1 - Math.exp(-dt / c.spoolTimeConstantS));
    s.gearPosition = moveTowards(s.gearPosition, s.gearDown ? 1 : 0, dt / c.gearTransitionS);
    s.flapPosition = moveTowards(s.flapPosition, c.flaps[s.flapIndex]?.deflection ?? 0, c.flapRatePerS * dt);
    const groundSpoilers = s.wheelsOnGround >= 2 && s.brakes && s.throttleCommand < 0.05 && s.groundSpeed > 15;
    s.spoilers = moveTowards(s.spoilers, groundSpoilers ? 1 : 0, dt * 2);

    // --- Air data ---------------------------------------------------------------------
    const atm = sampleAtmosphere(s.altitudeMslM);
    const fwd = tmp.fwd.set(0, 0, -1).applyQuaternion(s.quaternion);
    const up = tmp.up.set(0, 1, 0).applyQuaternion(s.quaternion);
    const right = tmp.right.set(1, 0, 0).applyQuaternion(s.quaternion);
    const air = tmp.air.subVectors(s.velocity, this.wind);
    const V = air.length();
    const u = air.dot(fwd);
    const w = air.dot(up);
    const v = air.dot(right);
    const alpha = V > 2 ? Math.atan2(-w, Math.max(u, 0.1)) : 0;
    const beta = V > 2 ? Math.asin(clamp(v / V, -1, 1)) : 0;
    const q = 0.5 * atm.density * V * V;
    const mach = V / atm.speedOfSound;

    // --- Aerodynamic coefficients -------------------------------------------------------
    const a = c.aero;
    const dClFlap = a.flapClMax * s.flapPosition;
    const stallAlpha = degToRad(a.stallAlphaDeg - a.flapStallAlphaReductionDeg * s.flapPosition);
    const negStall = degToRad(a.negativeStallAlphaDeg);
    let cl: number;
    let stallExcess = 0;
    if (alpha > stallAlpha) {
      stallExcess = alpha - stallAlpha;
      const peak = a.cl0 + a.clAlphaPerRad * stallAlpha + dClFlap;
      cl = peak * Math.max(0.5, 1 - stallExcess / degToRad(12));
    } else if (alpha < negStall) {
      stallExcess = negStall - alpha;
      const peak = a.cl0 + a.clAlphaPerRad * negStall + dClFlap;
      cl = peak * Math.max(0.5, 1 - stallExcess / degToRad(12));
    } else {
      cl = a.cl0 + a.clAlphaPerRad * alpha + dClFlap;
    }
    // Lift fades out at very low speeds/large alpha while taxiing to avoid spurious forces.
    const induced = (cl * cl) / (Math.PI * a.oswald * this.aspectRatio);
    const machDrag = mach > a.dragRiseMach ? 12 * (mach - a.dragRiseMach) ** 2 : 0;
    const cd = a.cd0 + induced + a.flapCdMax * s.flapPosition + a.gearCd * s.gearPosition + a.spoilerCd * s.spoilers + stallExcess * 1.4 + machDrag;
    const S = c.wingAreaM2;
    const lift = q * S * cl * (1 - 0.5 * s.spoilers);
    const drag = q * S * cd;
    const side = -q * S * a.sideForcePerRad * beta;
    const densityRatio = atm.density / SEA_LEVEL_DENSITY;
    const thrustFraction = c.idleThrustFraction + (1 - c.idleThrustFraction) * s.throttle;
    const thrust = c.engineCount * c.maxThrustPerEngineN * thrustFraction * Math.pow(densityRatio, 0.75) * (1 - 0.25 * Math.min(1, mach));

    const F = tmp.force.set(0, -c.massKg * GRAVITY, 0);
    F.addScaledVector(fwd, thrust);
    if (V > 0.5) {
      F.addScaledVector(air, -drag / V);
      const liftDir = tmp.liftDir.crossVectors(right, air);
      if (liftDir.lengthSq() > 1e-6) F.addScaledVector(liftDir.normalize(), lift);
      F.addScaledVector(right, side);
    }

    // --- Moments (body axes, rad/s²) -----------------------------------------------------
    const k = c.control;
    const vRef = knotsToMps(k.referenceSpeedKt);
    const qRef = 0.5 * SEA_LEVEL_DENSITY * vRef * vRef;
    const eff = clamp(q / qRef, 0, 2.2);
    const effD = clamp(V / vRef, 0, 1.8);
    const W = s.angularVelocity;
    const airborne = s.wheelsOnGround === 0;
    const pitchRate = W.x;
    const rollRateRight = -W.z;

    // Flight assist: rate-command behaviour with auto-trim and a soft bank limit.
    const maxPitchRate = degToRad(k.maxPitchRateDeg);
    const maxRollRate = degToRad(k.maxRollRateDeg);
    let elevator = input.pitch;
    let aileron = input.roll;
    if (airborne && this.assist > 0) {
      elevator = clamp(input.pitch + this.assist * 1.6 * (input.pitch * maxPitchRate - pitchRate) / maxPitchRate, -1, 1);
      aileron = input.roll + this.assist * 1.2 * (input.roll * maxRollRate - rollRateRight) / maxRollRate;
      const bankLimit = 33;
      if (Math.abs(s.bankDeg) > bankLimit && Math.sign(input.roll) !== Math.sign(s.bankDeg)) {
        aileron -= this.assist * 0.05 * (s.bankDeg - Math.sign(s.bankDeg) * bankLimit);
      }
      aileron = clamp(aileron, -1, 1);
      if (Math.abs(input.pitch) < 0.05) {
        // Auto-trim: the trimmed alpha follows the current alpha so releasing the stick holds attitude.
        this.trimAlpha += (clamp(alpha, degToRad(-3), stallAlpha - degToRad(3)) - this.trimAlpha) * (1 - Math.exp(-dt * this.assist * 0.8));
      }
    } else if (!airborne) {
      this.trimAlpha += (degToRad(k.trimAlphaDeg) - this.trimAlpha) * (1 - Math.exp(-dt));
    }
    const rudder = clamp(input.yaw, -1, 1);
    s.elevator = elevator; s.aileron = aileron; s.rudder = rudder;

    const angAcc = tmp.angAcc.set(
      k.pitchAuthority * elevator * eff - k.pitchStability * (alpha - this.trimAlpha) * eff - k.pitchDamping * effD * W.x - k.stallPitchDown * Math.max(0, alpha - stallAlpha) * Math.max(eff, 0.3),
      -k.yawAuthority * rudder * eff - k.yawStability * beta * eff - k.yawDamping * effD * W.y,
      -k.rollAuthority * aileron * eff + k.dihedralEffect * beta * eff - k.rollDamping * effD * W.z,
    );

    // --- Ground contacts -------------------------------------------------------------------
    this.applyContacts(F, angAcc, rudder);

    // --- Integration (semi-implicit Euler) ------------------------------------------------
    s.acceleration.copy(F).divideScalar(c.massKg);
    s.velocity.addScaledVector(s.acceleration, dt);
    s.position.addScaledVector(s.velocity, dt);
    W.addScaledVector(angAcc, dt);
    const wLen = W.length();
    if (wLen > 1e-9) {
      tmp.dq.setFromAxisAngle(tmp.axis.copy(W).divideScalar(wLen), wLen * dt);
      s.quaternion.multiply(tmp.dq).normalize();
    }
    s.liftN = lift; s.dragN = drag; s.thrustN = thrust;
    s.alphaRad = alpha; s.betaRad = beta; s.mach = mach;
    s.trueAirspeed = V;
    s.indicatedAirspeed = V * Math.sqrt(atm.density / SEA_LEVEL_DENSITY);
    this.updateDerived();
    this.detectEvents(dt, stallAlpha);
  }

  private applyContacts(F: Vector3, angAcc: Vector3, rudder: number): void {
    const s = this.state;
    const c = this.config;
    const g = c.ground;
    const wWorld = tmp.wWorld.copy(s.angularVelocity).applyQuaternion(s.quaternion);
    const fwd = tmp.fwd.set(0, 0, -1).applyQuaternion(s.quaternion);
    const torque = tmp.contactTorque.set(0, 0, 0);
    let wheels = 0;
    const gearDown = s.gearPosition > 0.97;
    // Nose-wheel steering authority fades with speed (tiller at low speed, rudder pedals at high).
    const steerDeg = rudder * (g.maxSteerDeg * clamp(1 - s.groundSpeed / 40, 0.12, 1));
    s.noseSteerDeg = steerDeg;
    for (const { point, body } of this.contactVectors) {
      if (point.kind === 'wheel' && !gearDown) continue;
      const r = tmp.r.copy(body).applyQuaternion(s.quaternion);
      const p = tmp.p.addVectors(s.position, r);
      const groundY = this.frame.groundHeightAt(p.x, p.z);
      const pen = groundY - p.y;
      if (pen <= 0) continue;
      const vp = tmp.vp.crossVectors(wWorld, r).add(s.velocity);
      const isWheel = point.kind === 'wheel';
      const kSpring = isWheel ? g.wheelStiffness : g.structureStiffness;
      const cDamp = isWheel ? g.wheelDamping : g.structureDamping;
      const normal = Math.max(0, kSpring * pen - cDamp * vp.y);
      const f = tmp.f.set(0, normal, 0);
      if (isWheel) {
        wheels++;
        // Rolling direction = horizontal forward, rotated by steering for the nose wheel.
        const rollDir = tmp.rollDir.set(fwd.x, 0, fwd.z).normalize();
        if (point.steerable) rollDir.applyAxisAngle(tmp.axis.set(0, 1, 0), -degToRad(steerDeg));
        const latDir = tmp.latDir.set(-rollDir.z, 0, rollDir.x);
        const vLong = vp.dot(rollDir);
        const vLat = vp.dot(latDir);
        const brake = point.braked && s.brakes ? g.brakeFriction : 0;
        const longMu = g.rollingResistance + brake;
        f.addScaledVector(rollDir, -Math.tanh(vLong / 0.3) * longMu * normal);
        f.addScaledVector(latDir, -clamp(vLat / 0.25, -1, 1) * g.lateralFriction * normal);
      } else {
        const hv = Math.hypot(vp.x, vp.z);
        if (hv > 1e-4) {
          const scale = -Math.tanh(hv / 0.3) * g.structureFriction * normal / hv;
          f.x += vp.x * scale;
          f.z += vp.z * scale;
        }
        const impact = -vp.y;
        if (point.kind === 'critical' || impact > 4 || pen > 1.2) {
          s.crashed = true;
          this.emit({ type: 'crash', reason: point.kind === 'critical' ? `${point.name} struck the ground` : 'Fuselage impact' });
        }
      }
      F.add(f);
      torque.add(tmp.torque.crossVectors(r, f));
    }
    if (wheels === 0) {
      s.wheelsOnGround = 0;
    } else {
      s.wheelsOnGround = wheels;
    }
    // Convert world torque into body axes and apply per-axis inertia.
    tmp.qInv.copy(s.quaternion).invert();
    torque.applyQuaternion(tmp.qInv);
    angAcc.x += torque.x / c.inertia.pitch;
    angAcc.y += torque.y / c.inertia.yaw;
    angAcc.z += torque.z / c.inertia.roll;
  }

  /** Recomputes every display/derived value from the canonical state. */
  private updateDerived(): void {
    const s = this.state;
    const fwd = tmp.fwd.set(0, 0, -1).applyQuaternion(s.quaternion);
    const up = tmp.up.set(0, 1, 0).applyQuaternion(s.quaternion);
    const right = tmp.right.set(1, 0, 0).applyQuaternion(s.quaternion);
    s.pitchDeg = radToDeg(Math.asin(clamp(fwd.y, -1, 1)));
    s.bankDeg = radToDeg(Math.atan2(-right.y, up.y));
    s.headingDeg = directionToHeading(fwd);
    s.groundSpeed = Math.hypot(s.velocity.x, s.velocity.z);
    s.verticalSpeed = s.velocity.y;
    const geo = this.frame.ltp.localToGeodetic(s.position);
    s.altitudeMslM = geo.heightM - this.frame.geoidUndulationM;
    s.heightAglM = Math.max(0, s.position.y - this.frame.groundHeightAt(s.position.x, s.position.z) - 3.3 * (s.gearPosition > 0.5 ? 1 : 0.6));
    s.onGround = s.wheelsOnGround > 0;
    s.onRunway = this.frame.isOnRunway(s.position.x, s.position.z);
  }

  private detectEvents(dt: number, stallAlpha: number): void {
    const s = this.state;
    const airborneNow = s.wheelsOnGround === 0 && s.heightAglM > 1.5;
    if (airborneNow) this.airborneTimer += dt; else this.airborneTimer = 0;
    if (!this.wasAirborne && this.airborneTimer > 0.5 && s.heightAglM > 5) {
      this.wasAirborne = true;
      this.emit({ type: 'takeoff' });
    } else if (this.wasAirborne && s.wheelsOnGround >= 2) {
      this.wasAirborne = false;
      const sink = Math.max(0, -s.velocity.y);
      if (sink > 6) {
        s.crashed = true;
        this.emit({ type: 'crash', reason: `Touchdown at ${Math.round(sink * 196.85)} fpm exceeded structural limits` });
      } else {
        this.emit({ type: 'landing', sinkRateMps: sink, onRunway: s.onRunway, hard: sink > 3 });
      }
    }
    const stallNow = !s.onGround && s.trueAirspeed > 20 && s.alphaRad > stallAlpha;
    const warn = !s.onGround && s.trueAirspeed > 20 && s.alphaRad > stallAlpha - degToRad(2.5);
    if (stallNow && !s.stalled) this.emit({ type: 'stall' });
    if (!stallNow && s.stalled) this.emit({ type: 'stall-recovered' });
    s.stalled = stallNow;
    s.stallWarning = warn;
    if (s.onGround && s.groundSpeed > 5 && !s.onRunway) {
      if (!this.runwayDepartureReported) {
        this.runwayDepartureReported = true;
        this.emit({ type: 'runway-departure' });
      }
    } else if (s.onRunway) {
      this.runwayDepartureReported = false;
    }
  }
}
