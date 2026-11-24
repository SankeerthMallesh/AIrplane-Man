import { describe, expect, it } from 'vitest';
import { ControlState } from '../src/input/ControlState';

describe('control state', () => {
  it('W/S, A/D, Q/E ramp axes and return to neutral', () => {
    const c = new ControlState();
    c.keyDown('KeyW', false); c.keyDown('KeyD', false); c.keyDown('KeyE', false);
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    expect(c.pitch).toBe(1); expect(c.roll).toBe(1); expect(c.yaw).toBe(1);
    c.keyUp('KeyW'); c.keyUp('KeyD'); c.keyUp('KeyE');
    c.keyDown('KeyS', false); c.keyDown('KeyA', false); c.keyDown('KeyQ', false);
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.pitch).toBe(-1); expect(c.roll).toBe(-1); expect(c.yaw).toBe(-1);
    c.releaseAll();
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    expect(c.pitch).toBe(0);
  });
  it('throttle is bounded', () => {
    const c = new ControlState();
    c.keyDown('ShiftLeft', false);
    for (let i = 0; i < 600; i++) c.update(1 / 60);
    expect(c.throttle).toBe(1);
    c.keyUp('ShiftLeft'); c.keyDown('ControlLeft', false);
    for (let i = 0; i < 600; i++) c.update(1 / 60);
    expect(c.throttle).toBe(0);
  });
  it('toggles are edge-triggered and ignore key repeat', () => {
    const c = new ControlState();
    c.keyDown('KeyG', false); c.keyDown('KeyG', true); c.keyDown('KeyG', true);
    c.keyDown('KeyF', false); c.keyDown('KeyC', false); c.keyDown('Space', false); c.keyDown('Escape', false);
    expect(c.consumeActions()).toEqual(['toggleGear', 'cycleFlaps', 'cycleCamera', 'toggleBrakes', 'pause']);
    expect(c.consumeActions()).toEqual([]);
  });
});
