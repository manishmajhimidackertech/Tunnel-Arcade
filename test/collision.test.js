import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointInPolygon,
  distanceToSegment,
  circleFitsInHoles,
  circleHitsBars,
  sweptOverlap,
  sweptPointDistance,
  regularPolygon,
  polygonArea,
  rotate2,
} from '../src/logic/collision.js';
import {
  DOOR_TEMPLATES,
  BAR_TEMPLATES,
  chooseObstacle,
  mulberry32,
  obstacleGapTime,
} from '../src/logic/patterns.js';
import { SHIP_RADIUS, SHIP_LIMIT } from '../src/config.js';

const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

test('pointInPolygon handles convex and concave shapes', () => {
  assert.equal(pointInPolygon(0, 0, square), true);
  assert.equal(pointInPolygon(2, 0, square), false);
  const ell = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
  assert.equal(pointInPolygon(0.5, 1.5, ell), true);
  assert.equal(pointInPolygon(1.5, 1.5, ell), false);
});

test('distanceToSegment clamps to the segment ends', () => {
  assert.equal(distanceToSegment(0, 1, -1, 0, 1, 0), 1);
  assert.equal(distanceToSegment(3, 0, -1, 0, 1, 0), 2);
});

test('circleFitsInHoles respects the ship radius', () => {
  assert.equal(circleFitsInHoles(0, 0, 0.5, [square]), true);
  assert.equal(circleFitsInHoles(0.8, 0, 0.5, [square]), false);
  assert.equal(circleFitsInHoles(5, 5, 0.1, [square]), false);
});

test('circleHitsBars uses bar and ship radius', () => {
  const bars = [{ a: [-5, 0], b: [5, 0], r: 0.4 }];
  assert.equal(circleHitsBars(0, 0.7, 0.4, bars), true);
  assert.equal(circleHitsBars(0, 0.9, 0.4, bars), false);
});

test('swept checks catch obstacles skipped between frames', () => {
  // A 0.5 thick slab at s = 10 passed during a single large step.
  assert.equal(sweptOverlap(5, 15, 10, 0.25), true);
  assert.equal(sweptOverlap(11, 15, 10, 0.25), false);
  assert.equal(sweptPointDistance(0, 0, 0, 20, 0, 0.5, 10), 0.5);
});

test('regular polygons are counter-clockwise and rotate2 keeps length', () => {
  assert.ok(polygonArea(regularPolygon(0, 0, 1, 6)) > 0);
  const [x, y] = rotate2(3, 4, 1.234);
  assert.ok(Math.abs(Math.hypot(x, y) - 5) < 1e-9);
});

// Sample the reachable disc and return the fraction of points where the ship survives.
function freeFraction(isFree) {
  let free = 0;
  let total = 0;
  for (let x = -SHIP_LIMIT; x <= SHIP_LIMIT; x += 0.1) {
    for (let y = -SHIP_LIMIT; y <= SHIP_LIMIT; y += 0.1) {
      if (x * x + y * y > SHIP_LIMIT * SHIP_LIMIT) continue;
      total++;
      if (isFree(x, y)) free++;
    }
  }
  return free / total;
}

for (const [name, tpl] of Object.entries(DOOR_TEMPLATES)) {
  test(`door "${name}" always leaves a way through`, () => {
    const fraction = freeFraction((x, y) => circleFitsInHoles(x, y, SHIP_RADIUS, tpl.holes));
    assert.ok(fraction > 0.04, `only ${(fraction * 100).toFixed(1)}% passable`);
    assert.ok(fraction < 0.8, `door "${name}" barely blocks anything`);
  });
}

for (const [name, tpl] of Object.entries(BAR_TEMPLATES)) {
  test(`bars "${name}" always leave a way through`, () => {
    const fraction = freeFraction((x, y) => !circleHitsBars(x, y, SHIP_RADIUS, tpl.bars));
    assert.ok(fraction > 0.3, `only ${(fraction * 100).toFixed(1)}% passable`);
    assert.ok(fraction < 0.97, `bars "${name}" barely block anything`);
  });
}

test('chooseObstacle only uses unlocked patterns and respects the mode', () => {
  const rng = mulberry32(1234);
  let mines = 0;
  for (let i = 0; i < 500; i++) {
    const o = chooseObstacle(rng, 0, 'classic');
    assert.notEqual(o.kind, 'mines');
    const tpl = o.kind === 'door' ? DOOR_TEMPLATES[o.template] : BAR_TEMPLATES[o.template];
    assert.equal(tpl.minDifficulty, 0);
    assert.equal(o.spin, 0, 'no spinning obstacles at the start');
    if (chooseObstacle(rng, 0.5, 'mines').kind === 'mines') mines++;
  }
  assert.ok(mines > 150 && mines < 350);
});

test('mine clusters stay inside the reachable area', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 200; i++) {
    const o = chooseObstacle(rng, 1, 'mines');
    if (o.kind !== 'mines') continue;
    for (const m of o.mines) assert.ok(Math.hypot(m.x, m.y) <= SHIP_LIMIT);
  }
});

test('obstacle gaps start relaxed and shrink with difficulty but stay reactable', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    assert.ok(obstacleGapTime(rng, 1) >= 0.85);
    const early = obstacleGapTime(rng, 0);
    assert.ok(early >= 2 && early <= 2.6);
  }
});
