import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulate, signedArea } from '../src/gl/triangulate.js';
import { cylinder, cone, sphere, torus, lathe, icosphere, extrude, circle, merge } from '../src/gl/geometry.js';
import { DOOR_TEMPLATES } from '../src/logic/patterns.js';
import { regularPolygon } from '../src/logic/collision.js';
import { TUNNEL_RADIUS } from '../src/config.js';

function triangleAreas(points, triangles) {
  const areas = [];
  for (let i = 0; i < triangles.length; i += 3) {
    areas.push(signedArea([points[triangles[i]], points[triangles[i + 1]], points[triangles[i + 2]]]));
  }
  return areas;
}

test('every door triangulates to exactly its area, with no flipped triangles', () => {
  const disc = regularPolygon(0, 0, TUNNEL_RADIUS + 0.4, 48);
  for (const [name, tpl] of Object.entries(DOOR_TEMPLATES)) {
    const { points, triangles } = triangulate(disc, tpl.holes);
    const areas = triangleAreas(points, triangles);
    const expected = Math.abs(signedArea(disc)) - tpl.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0);
    assert.ok(areas.every((a) => a > 0), `${name}: a triangle is flipped or empty`);
    assert.ok(Math.abs(areas.reduce((a, b) => a + b, 0) - expected) < 1e-6, `${name}: area mismatch`);
  }
});

test('a ring (polygon with a concentric hole) triangulates correctly', () => {
  const outer = regularPolygon(0, 0, 6.3, 12, Math.PI / 12);
  const inner = regularPolygon(0, 0, 5.4, 12, Math.PI / 12);
  const { points, triangles } = triangulate(outer, [inner]);
  const total = triangleAreas(points, triangles).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - (Math.abs(signedArea(outer)) - Math.abs(signedArea(inner)))) < 1e-6);
});

// Volume enclosed by the triangles; positive when they are wound to face outward.
function volume(g) {
  let v = 0;
  const p = (i) => [g.position[i * 3], g.position[i * 3 + 1], g.position[i * 3 + 2]];
  for (let i = 0; i < g.index.length; i += 3) {
    const [a, b, c] = [p(g.index[i]), p(g.index[i + 1]), p(g.index[i + 2])];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

test('closed primitives face outward and enclose the expected volume', () => {
  const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual / expected - 1) < tolerance, `${actual} vs ${expected}`);
  near(volume(sphere(2, 32, 24)), (4 / 3) * Math.PI * 8, 0.02);
  near(volume(icosphere(2, 2)), (4 / 3) * Math.PI * 8, 0.12);
  near(volume(cylinder(1, 1, 3, 48)), Math.PI * 3, 0.01);
  near(volume(cone(1, 3, 48)), Math.PI, 0.01);
  near(volume(torus(2, 0.5, 24, 48)), 2 * Math.PI ** 2 * 2 * 0.25, 0.02);
  near(volume(extrude(regularPolygon(0, 0, 2, 64), [regularPolygon(0, 0, 1, 64)], 0.5)), Math.PI * 3 * 0.5, 0.01);
});

test('normals are unit length and point away from the surface', () => {
  const shapes = [sphere(1, 12, 8), cylinder(0.5, 0.7, 2, 10), torus(1, 0.2, 8, 16), circle(1, 12), merge([cone(1, 2, 8), sphere(1, 8, 6)])];
  shapes.push(lathe([[0, 1], [0.2, 0.6], [0.3, 0], [0.2, -0.6]], 12));
  for (const g of shapes) {
    for (let i = 0; i < g.index.length; i += 3) {
      const [a, b, c] = [g.index[i] * 3, g.index[i + 1] * 3, g.index[i + 2] * 3];
      const u = [0, 1, 2].map((k) => g.position[b + k] - g.position[a + k]);
      const v = [0, 1, 2].map((k) => g.position[c + k] - g.position[a + k]);
      const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(...face) < 1e-9) continue; // collapsed triangle at a pole or tip
      for (const n of [a, b, c]) {
        const normal = [g.normal[n], g.normal[n + 1], g.normal[n + 2]];
        assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-4);
        assert.ok(normal[0] * face[0] + normal[1] * face[1] + normal[2] * face[2] > 0);
      }
    }
  }
});
