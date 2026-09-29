import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slowmoScale, SLOWMO_TIME, SLOWMO_SCALE, SLOWMO_EASE_IN, SLOWMO_EASE_OUT } from '../src/logic/slowmo.js';
import { gravityOnScreen, tiltAxis } from '../src/logic/tilt.js';
import { speedAt, FIRST_PICKUP_SPEED, START_SPEED } from '../src/config.js';

const FRAME = 1 / 60;

test('slow motion eases down and back up without jumps or jerks', () => {
  let prev = slowmoScale(0);
  let prevRate = 0;
  let maxStep = 0;
  let maxRateChange = 0;
  for (let t = FRAME; t <= SLOWMO_TIME + 0.5; t += FRAME) {
    const v = slowmoScale(t);
    const rate = (v - prev) / FRAME;
    maxStep = Math.max(maxStep, Math.abs(v - prev));
    maxRateChange = Math.max(maxRateChange, Math.abs(rate - prevRate));
    prev = v;
    prevRate = rate;
  }
  assert.equal(slowmoScale(0), 1, 'starts at full pace (no instant drop)');
  assert.ok(Math.abs(slowmoScale(SLOWMO_EASE_IN) - SLOWMO_SCALE) < 1e-9, 'reaches slow motion after the ease-in');
  assert.equal(slowmoScale(SLOWMO_TIME), 1, 'ends exactly at full pace');
  assert.ok(maxStep < 0.02, `pace changes by at most 2% per frame (got ${(maxStep * 100).toFixed(2)}%)`);
  assert.ok(maxRateChange < 0.1, `no sudden change in how fast the pace changes (got ${maxRateChange.toFixed(3)})`);
  // gentle at both ends of each ramp: almost no change in the first/last frames
  assert.ok(1 - slowmoScale(FRAME) < 0.001);
  assert.ok(1 - slowmoScale(SLOWMO_TIME - FRAME) < 0.001);
  assert.ok(SLOWMO_EASE_OUT >= 1, 'regaining pace takes at least a second');
});

test('a second pickup mid-recovery continues from the current pace', () => {
  const current = slowmoScale(SLOWMO_TIME - SLOWMO_EASE_OUT / 2); // halfway back to full speed
  assert.ok(Math.abs(slowmoScale(0, current) - current) < 1e-12);
});

test('the first pickup waits until the run has real pace', () => {
  assert.ok(FIRST_PICKUP_SPEED >= START_SPEED * 1.7);
  // with constant acceleration it takes about a minute to get there
  let d = 0;
  let t = 0;
  while (speedAt(d) < FIRST_PICKUP_SPEED) {
    d += speedAt(d) * FRAME;
    t += FRAME;
  }
  assert.ok(t > 45 && t < 75, `first pickup possible after ${t.toFixed(0)} s`);
});

// Phone held upright facing the player, then rolled/pitched: beta = pitch, gamma = roll.
test('tilting the right side of the screen down steers right in every orientation', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  // portrait: right edge down is positive gamma
  const [px] = gravityOnScreen(60, 10, 0);
  assert.ok(px > 0);
  // landscape, rotated counter-clockwise (angle 90): the screen's right edge is the device's bottom
  // edge; lowering it = raising the device's top = larger beta
  const base90 = gravityOnScreen(0, -50, 90);
  const tilted90 = gravityOnScreen(10, -50, 90);
  assert.ok(tilted90[0] > base90[0]);
  // landscape the other way (angle 270): the screen's right edge is the device's top edge,
  // so lowering it = smaller beta
  const base270 = gravityOnScreen(0, 50, 270);
  const tilted270 = gravityOnScreen(-10, 50, 270);
  assert.ok(tilted270[0] > base270[0]);
  // tilting the top of the screen away (down) steers up, like a ball rolling downhill
  // (at angle 90 the screen's top edge is the device's right edge; raising gamma lowers it)
  const [, before] = gravityOnScreen(0, -40, 90);
  const [, after] = gravityOnScreen(0, -30, 90);
  assert.ok(after > before);
  // the vector is always unit length
  const [x, y] = gravityOnScreen(37, -71, 90);
  const z = Math.cos((37 * Math.PI) / 180) * Math.cos((-71 * Math.PI) / 180);
  assert.ok(close(x * x + y * y + z * z, 1));
});

test('tilt axis is relative to the calibrated pose, with deadzone and saturation', () => {
  const neutral = gravityOnScreen(0, -50, 90);
  assert.deepEqual(tiltAxis(neutral, neutral), [0, 0]);
  assert.deepEqual(tiltAxis(gravityOnScreen(1, -50, 90), neutral).map(Math.abs), [0, 0], 'small wobble ignored');
  const [full] = tiltAxis(gravityOnScreen(40, -50, 90), neutral);
  assert.equal(full, 1, 'big tilt saturates at full steering');
  const [half] = tiltAxis(gravityOnScreen(9, -50, 90), neutral);
  assert.ok(half > 0.3 && half < 0.7);
});
