import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ATLAS_AJ220 } from '../src/data/aircraft';
import { AIRPORTS, findRunwayEnd } from '../src/data/airports';
import { FlightModel, type FlightEvent } from '../src/physics/FlightModel';
import { AirportFrame } from '../src/world/AirportFrame';
import { sampleAtmosphere } from '../src/physics/Atmosphere';

const airport = AIRPORTS[0]!;
const frame = new AirportFrame(airport, findRunwayEnd(airport, airport.defaultRunwayEnd)!);
const neutral = { pitch: 0, roll: 0, yaw: 0 };
const run = (m: FlightModel, seconds: number, input = neutral): void => {
  for (let i = 0; i < seconds * 120; i++) m.step(1 / 120, input);
};

describe('flight model', () => {
  it('atmosphere density decreases with altitude', () => {
    expect(sampleAtmosphere(0).density).toBeCloseTo(1.225, 2);
    expect(sampleAtmosphere(10000).density).toBeLessThan(0.45);
  });
  it('rests stably on the gear with brakes set', () => {
    const m = new FlightModel(ATLAS_AJ220, frame);
    m.reset(frame.spawn());
    run(m, 5);
    expect(m.state.wheelsOnGround).toBe(3);
    expect(m.state.groundSpeed).toBeLessThan(0.2);
    expect(Math.abs(m.state.pitchDeg)).toBeLessThan(2);
  });
  it('gravity pulls down when airborne without lift', () => {
    const m = new FlightModel(ATLAS_AJ220, frame);
    m.reset({ position: new Vector3(0, 2000, 0), headingDeg: 90, airborneSpeedKt: 0 });
    m.state.velocity.set(0, 0, 0);
    m.state.throttle = 0;
    m.setThrottle(0);
    m.step(1 / 120, neutral);
    expect(m.state.acceleration.y).toBeLessThan(-9);
    expect(Math.abs(m.state.acceleration.x) + Math.abs(m.state.acceleration.z)).toBeLessThan(1);
  });
  it('accelerates with thrust and takes off when rotated', () => {
    const events: FlightEvent[] = [];
    const m = new FlightModel(ATLAS_AJ220, frame, (e) => events.push(e));
    m.reset(frame.spawn());
    m.toggleBrakes();
    m.setThrottle(1);
    run(m, 10);
    expect(m.state.groundSpeed).toBeGreaterThan(20);
    run(m, 22);
    run(m, 12, { pitch: 0.7, roll: 0, yaw: 0 });
    run(m, 10);
    expect(events.some((e) => e.type === 'takeoff')).toBe(true);
    expect(m.state.position.y).toBeGreaterThan(50);
  });
  it('lift grows with airspeed and flaps add lift', () => {
    const lift = (kt: number, flaps: number): number => {
      const m = new FlightModel(ATLAS_AJ220, frame);
      m.reset({ position: new Vector3(0, 1500, 0), headingDeg: 0, airborneSpeedKt: kt });
      m.state.flapIndex = flaps;
      m.state.flapPosition = ATLAS_AJ220.flaps[flaps]!.deflection;
      m.step(1 / 120, neutral);
      return m.state.liftN;
    };
    expect(lift(250, 0)).toBeGreaterThan(lift(150, 0));
    expect(lift(150, 2)).toBeGreaterThan(lift(150, 0));
  });
  it('roll input banks right, yaw input yaws right, pitch input pitches up', () => {
    const mk = (): FlightModel => {
      const m = new FlightModel(ATLAS_AJ220, frame);
      m.reset({ position: new Vector3(0, 1500, 0), headingDeg: 0, airborneSpeedKt: 250 });
      return m;
    };
    const r = mk(); run(r, 1.5, { pitch: 0, roll: 1, yaw: 0 }); expect(r.state.bankDeg).toBeGreaterThan(5);
    const y = mk(); run(y, 1.5, { pitch: 0, roll: 0, yaw: 1 }); expect(y.state.headingDeg).toBeGreaterThan(0.5);
    expect(y.state.headingDeg).toBeLessThan(90);
    const p = mk(); run(p, 1.5, { pitch: 1, roll: 0, yaw: 0 }); expect(p.state.pitchDeg).toBeGreaterThan(2);
  });
  it('detects stall at high alpha and recovers', () => {
    const events: FlightEvent[] = [];
    const m = new FlightModel(ATLAS_AJ220, frame, (e) => events.push(e));
    m.reset({ position: new Vector3(0, 3000, 0), headingDeg: 0, airborneSpeedKt: 150 });
    m.setThrottle(0);
    run(m, 20, { pitch: 1, roll: 0, yaw: 0 });
    expect(events.some((e) => e.type === 'stall')).toBe(true);
    m.setThrottle(1);
    run(m, 15, { pitch: -0.5, roll: 0, yaw: 0 });
    expect(m.state.stalled).toBe(false);
  });
  it('gear adds drag', () => {
    const drag = (gear: boolean): number => {
      const m = new FlightModel(ATLAS_AJ220, frame);
      m.reset({ position: new Vector3(0, 1500, 0), headingDeg: 0, airborneSpeedKt: 180 });
      m.state.gearPosition = gear ? 1 : 0;
      m.state.gearDown = gear;
      m.step(1 / 120, neutral);
      return m.state.dragN;
    };
    expect(drag(true)).toBeGreaterThan(drag(false));
  });
});
