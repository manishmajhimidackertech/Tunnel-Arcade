// Placement of the slow-motion pickup. It is never dropped at random: it always marks a
// safe line, meaning that if you grab it and keep flying straight you clear the next
// obstacle. Spinning doors/bars and drifting mines are predicted for the moment you arrive.
import { rotate2, circleFitsInHoles, circleHitsBars } from './collision.js';
import { DOOR_TEMPLATES, BAR_TEMPLATES } from './patterns.js';
import { SHIP_RADIUS, SHIP_LIMIT } from '../config.js';

export const PICKUP_MARGIN = 0.35; // extra clearance on top of the ship's collision radius
export const MINE_CLEARANCE = 0.9 + SHIP_RADIUS + 0.45; // mine radius + ship + margin
const TIMING_SLACK = 0.3; // seconds of arrival-time error tolerated for moving obstacles
const SAMPLES = 60;

// The tunnel slowly rolls, so a player who holds the ship still *on screen* drifts a little in
// the tunnel's own frame. `rollOffset(ds)` is that drift angle by the time they reach `ds`
// units past the obstacle's start; we accept a spot only if both ways of "flying straight"
// (still in the tunnel, or still on screen) are safe.
function linePoints(x, y, offset) {
  return [0, 0.5, 1].map((f) => rotate2(x, y, -offset * f));
}

// Is flying straight through (x, y) safe for `spec`? `timeToArrive(ds)` is the number of
// seconds until the ship reaches `ds` units past the obstacle's start.
export function isSafeLine(x, y, spec, timeToArrive, rollOffset = () => 0) {
  const r = SHIP_RADIUS + PICKUP_MARGIN;
  if (spec.kind === 'mines') {
    return spec.mines.every((m) => {
      const t = timeToArrive(m.ds);
      const points = linePoints(x, y, rollOffset(m.ds));
      for (const dt of [-TIMING_SLACK, 0, TIMING_SLACK]) {
        const [mx, my] = rotate2(m.x, m.y, m.drift * Math.max(0, t + dt));
        for (const [px, py] of points) if (Math.hypot(mx - px, my - py) < MINE_CLEARANCE) return false;
      }
      return true;
    });
  }
  const t = timeToArrive(0);
  const points = linePoints(x, y, rollOffset(0));
  // sample the rotation over the arrival window (a single sample when it doesn't spin)
  const steps = spec.spin ? 5 : 1;
  for (let i = 0; i < steps; i++) {
    const dt = steps === 1 ? 0 : -TIMING_SLACK + (2 * TIMING_SLACK * i) / (steps - 1);
    const angle = spec.rotation + spec.spin * Math.max(0, t + dt);
    for (const [px, py] of points) {
      const [lx, ly] = rotate2(px, py, -angle);
      if (spec.kind === 'door' && !circleFitsInHoles(lx, ly, r, DOOR_TEMPLATES[spec.template].holes)) return false;
      if (spec.kind === 'bars' && circleHitsBars(lx, ly, r, BAR_TEMPLATES[spec.template].bars)) return false;
    }
  }
  return true;
}

// Returns a safe [x, y] for a pickup placed ahead of `spec`, or null if there is none.
export function findPickupSpot(rng, spec, timeToArrive, rollOffset) {
  const reach = SHIP_LIMIT - 0.4;
  for (let i = 0; i < SAMPLES; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * reach;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (isSafeLine(x, y, spec, timeToArrive, rollOffset)) return [x, y];
  }
  return null;
}
