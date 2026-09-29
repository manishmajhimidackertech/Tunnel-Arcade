import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPickupSpot, isSafeLine } from '../src/logic/pickups.js';
import { chooseObstacle, mulberry32, DOOR_TEMPLATES, BAR_TEMPLATES } from '../src/logic/patterns.js';
import { rotate2, circleFitsInHoles, circleHitsBars } from '../src/logic/collision.js';
import { SHIP_RADIUS, SHIP_LIMIT } from '../src/config.js';

const MINE_HIT = 0.9 + SHIP_RADIUS;

// Independent check: does a ship flying straight through (x, y) survive `spec` when the
// obstacle's rotation/drift is exactly as predicted at arrival, with the tunnel rolled by `roll`?
function survives(x, y, spec, arrive, roll) {
  if (spec.kind === 'mines') {
    return spec.mines.every((m) => {
      const [px, py] = rotate2(x, y, -roll(m.ds));
      const [mx, my] = rotate2(m.x, m.y, m.drift * arrive(m.ds));
      return Math.hypot(mx - px, my - py) >= MINE_HIT;
    });
  }
  const [px, py] = rotate2(x, y, -roll(0));
  const [lx, ly] = rotate2(px, py, -(spec.rotation + spec.spin * arrive(0)));
  if (spec.kind === 'door') return circleFitsInHoles(lx, ly, SHIP_RADIUS, DOOR_TEMPLATES[spec.template].holes);
  return !circleHitsBars(lx, ly, SHIP_RADIUS, BAR_TEMPLATES[spec.template].bars);
}

test('pickups always mark a line that clears the next obstacle', () => {
  const rng = mulberry32(2024);
  let placed = 0;
  let tries = 0;
  for (const mode of ['classic', 'mines']) {
    for (let i = 0; i < 1500; i++) {
      const difficulty = rng();
      const spec = chooseObstacle(rng, difficulty, mode);
      const t0 = 1 + rng() * 5; // seconds until arrival
      const pace = 1 / (16 + rng() * 56); // seconds per unit
      const arrive = (ds) => t0 + ds * pace;
      const rollRate = (rng() - 0.5) * 0.004; // rad per unit, above the tunnel's real maximum
      const roll = (ds) => rollRate * (40 + ds);
      tries++;
      const spot = findPickupSpot(rng, spec, arrive, roll);
      if (!spot) continue;
      placed++;
      const [x, y] = spot;
      assert.ok(Math.hypot(x, y) <= SHIP_LIMIT, 'pickup must be reachable');
      // safe whether the player holds still in the tunnel's frame (no roll) or on screen (roll)
      assert.ok(survives(x, y, spec, arrive, () => 0), `unsafe (tunnel frame) before ${spec.kind} ${spec.template ?? ''}`);
      assert.ok(survives(x, y, spec, arrive, roll), `unsafe (screen frame) before ${spec.kind} ${spec.template ?? ''}`);
    }
  }
  assert.ok(placed / tries > 0.85, `a safe spot should nearly always exist (${placed}/${tries})`);
});

test('isSafeLine rejects spots in the solid part of a door', () => {
  const spec = { kind: 'door', template: 'half', rotation: 0, spin: 0 };
  // "half" opens the right-hand side of the tunnel only
  assert.equal(isSafeLine(3, 0, spec, () => 1), true);
  assert.equal(isSafeLine(-3, 0, spec, () => 1), false);
});

test('isSafeLine predicts where a spinning bar will be', () => {
  // a full bar through the centre, spinning a quarter turn by the time we arrive
  const spec = { kind: 'bars', template: 'bar', rotation: 0, spin: Math.PI / 2 };
  const arriveInOneSecond = () => 1;
  assert.equal(isSafeLine(3, 0, spec, arriveInOneSecond), true, 'bar will be vertical, right side clear');
  assert.equal(isSafeLine(0, 3, spec, arriveInOneSecond), false, 'bar will be vertical, top blocked');
});
