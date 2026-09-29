// Obstacle layouts. Everything here is plain data in tunnel cross-section coordinates
// (x right, y up, origin on the tunnel axis) so it can be validated in unit tests.

import { regularPolygon } from './collision.js';
import { TUNNEL_RADIUS, SHIP_LIMIT } from '../config.js';

const R = TUNNEL_RADIUS;
const OUTER = R - 0.15; // holes may reach into the wall; the ship can't, which is fine
const DEG = Math.PI / 180;

function arc(radius, from, to, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (from + ((to - from) * i) / steps) * DEG;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

// Pie-slice triangle pointing at the tunnel centre, like the red-rimmed doors in the original.
function wedge(angle, halfWidth, apex = 0.95, outer = OUTER) {
  const a = angle * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const p = (r, t) => [Math.cos(a + t * DEG) * r, Math.sin(a + t * DEG) * r];
  return [[ca * apex, sa * apex], p(outer, -halfWidth), p(outer, halfWidth)];
}

function sector(from, to, inner, outer = OUTER) {
  return [...arc(outer, from, to, 6), ...arc(inner, to, from, 3)];
}

export const DOOR_TEMPLATES = {
  tri3: { minDifficulty: 0, weight: 3, holes: [wedge(90, 27), wedge(210, 27), wedge(330, 27)] },
  half: { minDifficulty: 0, weight: 3, holes: [[...arc(OUTER, -84, 84, 14)]] },
  circle: { minDifficulty: 0, weight: 2, holes: [regularPolygon(0, 2.35, 2.35, 20)] },
  slot: {
    minDifficulty: 0,
    weight: 2,
    holes: [[[-OUTER, -1.3], [OUTER, -1.3], [OUTER, 1.3], [-OUTER, 1.3]]],
  },
  tri2: { minDifficulty: 0.1, weight: 2, holes: [wedge(0, 30), wedge(180, 30)] },
  twoCircles: {
    minDifficulty: 0.12,
    weight: 2,
    holes: [regularPolygon(0, 3.05, 1.75, 18), regularPolygon(0, -3.05, 1.75, 18)],
  },
  cross: {
    minDifficulty: 0.15,
    weight: 2,
    holes: [
      [
        [-1.3, -OUTER], [1.3, -OUTER], [1.3, -1.3], [OUTER, -1.3], [OUTER, 1.3], [1.3, 1.3],
        [1.3, OUTER], [-1.3, OUTER], [-1.3, 1.3], [-OUTER, 1.3], [-OUTER, -1.3], [-1.3, -1.3],
      ],
    ],
  },
  spokes4: {
    minDifficulty: 0.3,
    weight: 2,
    holes: [sector(12, 78, 2.0), sector(102, 168, 2.0), sector(192, 258, 2.0), sector(282, 348, 2.0)],
  },
  tri1: { minDifficulty: 0.35, weight: 1.5, holes: [wedge(90, 36, 0.6)] },
  core: { minDifficulty: 0.55, weight: 1, holes: [regularPolygon(0, 0, 1.75, 6, Math.PI / 6)] },
};

const BAR_R = 0.55;
const LONG = R + 0.6; // bar ends are buried in the wall

function bar(angle, from, to, offset = 0) {
  const a = angle * DEG;
  const nx = -Math.sin(a) * offset;
  const ny = Math.cos(a) * offset;
  return {
    a: [Math.cos(a) * from + nx, Math.sin(a) * from + ny],
    b: [Math.cos(a) * to + nx, Math.sin(a) * to + ny],
    r: BAR_R,
  };
}

export const BAR_TEMPLATES = {
  bar: { minDifficulty: 0, weight: 3, bars: [bar(0, -LONG, LONG)] },
  halfBar: { minDifficulty: 0, weight: 3, bars: [bar(0, -LONG, 0.9)] },
  yBars: { minDifficulty: 0.12, weight: 2, bars: [bar(90, 0, LONG), bar(210, 0, LONG), bar(330, 0, LONG)] },
  twin: { minDifficulty: 0.12, weight: 2, bars: [bar(0, -LONG, LONG, 2.3), bar(0, -LONG, LONG, -2.3)] },
  plus: { minDifficulty: 0.3, weight: 2, bars: [bar(0, -LONG, LONG), bar(90, -LONG, LONG)] },
  chord: { minDifficulty: 0.3, weight: 1.5, bars: [bar(0, -LONG, LONG, 1.2), bar(90, 1.0, LONG)] },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, table, difficulty) {
  const entries = Object.entries(table).filter(([, t]) => difficulty >= t.minDifficulty);
  const total = entries.reduce((sum, [, t]) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const [name, t] of entries) {
    roll -= t.weight;
    if (roll <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

function spinFor(rng, difficulty) {
  const chance = Math.max(0, (difficulty - 0.25) * 0.9);
  if (rng() > chance) return 0;
  const speed = 0.5 + rng() * (0.4 + difficulty * 0.8);
  return rng() < 0.5 ? -speed : speed;
}

// Mines are spread over a stretch of tunnel; `ds` is the offset from the cluster start.
function mineCluster(rng, difficulty) {
  const count = 3 + Math.floor(rng() * (2 + difficulty * 5));
  const length = 28 + count * 5;
  const mines = [];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng()) * (SHIP_LIMIT - 0.2);
    const a = rng() * Math.PI * 2;
    mines.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      ds: (i / Math.max(1, count - 1)) * length + (rng() - 0.5) * 4,
      drift: (rng() - 0.5) * (0.3 + difficulty * 0.9), // angular drift around the axis
    });
  }
  return { kind: 'mines', mines, length };
}

export function chooseObstacle(rng, difficulty, mode) {
  if (mode === 'mines' && rng() < 0.5) return mineCluster(rng, difficulty);
  const rotation = rng() * Math.PI * 2;
  const spin = spinFor(rng, difficulty);
  if (rng() < 0.62) {
    return { kind: 'door', template: pickWeighted(rng, DOOR_TEMPLATES, difficulty), rotation, spin };
  }
  return { kind: 'bars', template: pickWeighted(rng, BAR_TEMPLATES, difficulty), rotation, spin };
}

// Seconds of flight between consecutive obstacles; shrinks as the run gets harder.
export function obstacleGapTime(rng, difficulty) {
  return 2.1 - difficulty * 1.2 + rng() * 0.4;
}
