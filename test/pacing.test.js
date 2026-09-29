import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speedAt, START_SPEED, MAX_SPEED, ACCELERATION } from '../src/config.js';
import { shapeAxis, steerVelocity } from '../src/logic/steering.js';

// Distance flown after `seconds`, integrating the speed curve like the game loop does.
function fly(seconds, dt = 1 / 60) {
  let d = 0;
  for (let t = 0; t < seconds; t += dt) d += speedAt(d) * dt;
  return d;
}

test('runs start slow and the pace builds up gradually', () => {
  assert.equal(speedAt(0), START_SPEED);
  assert.ok(START_SPEED <= 18, 'opening speed should be calm');
  // Speed rises by the same small amount every second, not in a burst at the start.
  const after = (s) => speedAt(fly(s));
  assert.ok(Math.abs(after(30) - (START_SPEED + ACCELERATION * 30)) < 0.5);
  assert.ok(after(30) < 25, `too fast after 30 s: ${after(30).toFixed(1)}`);
  assert.ok(after(60) < 33, `too fast after 60 s: ${after(60).toFixed(1)}`);
  assert.ok(after(120) > 40, 'the pace should keep building');
});

test('speed never decreases and is capped', () => {
  let prev = 0;
  for (let d = 0; d < 30000; d += 50) {
    const v = speedAt(d);
    assert.ok(v >= prev);
    prev = v;
  }
  assert.equal(speedAt(1e7), MAX_SPEED);
});

test('stick response: deadzone, soft centre, full speed at full deflection', () => {
  assert.deepEqual(shapeAxis(0.05, 0), [0, 0]);
  const [half] = shapeAxis(0.5, 0);
  assert.ok(half > 0.2 && half < 0.4, `half deflection gave ${half}`);
  const [full] = shapeAxis(1, 0);
  assert.ok(Math.abs(full - 1) < 1e-9);
  // Diagonal keyboard input is normalised, not faster.
  const [dx, dy] = shapeAxis(1, 1);
  assert.ok(Math.abs(Math.hypot(dx, dy) - 1) < 1e-9);
});

test('steering eases in and stops firmly', () => {
  const vel = { x: 0, y: 0 };
  const step = (seconds, target) => {
    for (let t = 0; t < seconds; t += 1 / 60) steerVelocity(vel, target, 0, 1 / 60, 5, 8);
  };
  step(0.1, 10);
  assert.ok(vel.x > 2 && vel.x < 5, `no instant jump to full speed (got ${vel.x.toFixed(2)})`);
  step(0.5, 10);
  assert.ok(vel.x > 9, 'reaches full speed within about half a second');
  step(0.3, 0);
  assert.ok(vel.x < 1, `stops quickly after letting go (got ${vel.x.toFixed(2)})`);
});
