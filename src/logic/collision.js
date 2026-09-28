// Pure 2D/3D helpers used for obstacle collision. No Three.js here so they can be unit tested.

export function rotate2(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

// Even-odd rule; works for concave polygons. poly is [[x, y], ...].
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}

export function distanceToPolygonEdge(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distanceToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// True when a circle of `radius` centred at (x, y) fits entirely inside one of the holes.
export function circleFitsInHoles(x, y, radius, holes) {
  for (const hole of holes) {
    if (pointInPolygon(x, y, hole) && distanceToPolygonEdge(x, y, hole) >= radius) return true;
  }
  return false;
}

// Bars are 2D segments in the tunnel cross-section: { a: [x, y], b: [x, y], r }.
export function circleHitsBars(x, y, radius, bars) {
  for (const bar of bars) {
    if (distanceToSegment(x, y, bar.a[0], bar.a[1], bar.b[0], bar.b[1]) < bar.r + radius) return true;
  }
  return false;
}

// Did something travelling from s0 to s1 (s1 >= s0) overlap the slab [center - half, center + half]?
export function sweptOverlap(s0, s1, center, half) {
  return s1 >= center - half && s0 <= center + half;
}

// Closest distance between a sphere moving along the tunnel axis (s0 -> s1, fixed x/y)
// and a static point, used for mines.
export function sweptPointDistance(x, y, s0, s1, px, py, ps) {
  const s = Math.max(s0, Math.min(s1, ps));
  const dx = x - px;
  const dy = y - py;
  const ds = s - ps;
  return Math.sqrt(dx * dx + dy * dy + ds * ds);
}

export function regularPolygon(cx, cy, radius, sides, rotation = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pts;
}

// Signed area; positive when counter-clockwise.
export function polygonArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  }
  return area / 2;
}
