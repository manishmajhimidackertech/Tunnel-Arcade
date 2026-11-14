// Ear-clipping triangulation of a flat polygon with holes (doors, ribs, wings).

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const EPS = 1e-9;

function onSegment(a, b, p) {
  if (Math.abs(orient(a, b, p)) > EPS) return false;
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

// Does the edge a-b get in the way of a bridge from m to p?
function blocks(m, p, a, b) {
  const aShared = same(a, m) || same(a, p);
  const bShared = same(b, m) || same(b, p);
  if (aShared && bShared) return false;
  if (aShared) return onSegment(m, p, b);
  if (bShared) return onSegment(m, p, a);
  const d1 = orient(m, p, a);
  const d2 = orient(m, p, b);
  const d3 = orient(a, b, m);
  const d4 = orient(a, b, p);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  return onSegment(m, p, a) || onSegment(m, p, b) || onSegment(a, b, m) || onSegment(a, b, p);
}

// Cut a zero-width corridor from the outer loop to the hole so they become one loop.
function bridge(loop, hole, pts, loops, used) {
  let mi = 0;
  for (let i = 1; i < hole.length; i++) if (pts[hole[i]][0] > pts[hole[mi]][0]) mi = i;
  const m = pts[hole[mi]];
  const order = loop
    .map((index, j) => ({ j, index, d: (pts[index][0] - m[0]) ** 2 + (pts[index][1] - m[1]) ** 2 }))
    .filter((c) => !used.has(c.index))
    .sort((a, b) => a.d - b.d);
  const visible = ({ index }) => {
    const p = pts[index];
    for (const l of loops) {
      for (let i = 0; i < l.length; i++) {
        if (blocks(m, p, pts[l[i]], pts[l[(i + 1) % l.length]])) return false;
      }
    }
    return true;
  };
  const best = order.find(visible) ?? order[0];
  used.add(best.index).add(hole[mi]);
  const rotated = [...hole.slice(mi), ...hole.slice(0, mi)];
  return [...loop.slice(0, best.j + 1), ...rotated, rotated[0], best.index, ...loop.slice(best.j + 1)];
}

function inTriangle(p, a, b, c) {
  return orient(a, b, p) >= -EPS && orient(b, c, p) >= -EPS && orient(c, a, p) >= -EPS;
}

function clip(loop, pts) {
  const v = loop.slice();
  const tris = [];
  while (v.length > 3) {
    const n = v.length;
    let ear = -1;
    let flattest = 0;
    let flatness = Infinity;
    for (let i = 0; i < n && ear < 0; i++) {
      const a = pts[v[(i + n - 1) % n]];
      const b = pts[v[i]];
      const c = pts[v[(i + 1) % n]];
      const o = orient(a, b, c);
      if (Math.abs(o) < flatness) {
        flatness = Math.abs(o);
        flattest = i;
      }
      if (o <= EPS) continue;
      let empty = true;
      for (let k = 0; k < n && empty; k++) {
        const p = pts[v[k]];
        if (same(p, a) || same(p, b) || same(p, c)) continue;
        if (inTriangle(p, a, b, c)) empty = false;
      }
      if (empty) ear = i;
    }
    if (ear < 0) {
      v.splice(flattest, 1); // degenerate corner (e.g. a collinear point): drop it
      continue;
    }
    tris.push(v[(ear + n - 1) % n], v[ear], v[(ear + 1) % n]);
    v.splice(ear, 1);
  }
  if (v.length === 3 && orient(pts[v[0]], pts[v[1]], pts[v[2]]) > EPS) tris.push(v[0], v[1], v[2]);
  return tris;
}

// Returns the contours wound consistently (outer counter-clockwise, holes clockwise), their
// points in one list, and counter-clockwise triangles indexing that list.
export function triangulate(outer, holes = []) {
  const points = [];
  const ring = (poly, ccw) => {
    const p = signedArea(poly) > 0 === ccw ? poly : [...poly].reverse();
    const start = points.length;
    points.push(...p);
    return p.map((_, i) => start + i);
  };
  const outerLoop = ring(outer, true);
  const holeLoops = holes.map((h) => ring(h, false));
  const maxX = (l) => Math.max(...l.map((i) => points[i][0]));
  const pending = [...holeLoops].sort((a, b) => maxX(b) - maxX(a));
  const used = new Set();
  let loop = outerLoop;
  while (pending.length) {
    loop = bridge(loop, pending[0], points, [loop, ...pending], used);
    pending.shift();
  }
  return { points, contours: [outerLoop, ...holeLoops], triangles: clip(loop, points) };
}
