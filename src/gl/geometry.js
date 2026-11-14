// Mesh data and the handful of primitive builders the game needs.
import { cross3, normalize3 } from './math.js';
import { triangulate } from './triangulate.js';

export class Geometry {
  constructor({ position, normal, uv, color, index, groups, dynamic = false }) {
    this.position = position instanceof Float32Array ? position : new Float32Array(position);
    this.normal = normal ? (normal instanceof Float32Array ? normal : new Float32Array(normal)) : null;
    this.uv = uv ? (uv instanceof Float32Array ? uv : new Float32Array(uv)) : null;
    this.color = color ?? null;
    this.index = index ? (index instanceof Uint16Array ? index : new Uint16Array(index)) : null;
    this.groups = groups ?? null; // [{ start, count, material }] when a mesh uses several materials
    this.dynamic = dynamic;
    this.needsUpdate = false; // set after changing a dynamic geometry's arrays
  }

  get vertexCount() {
    return this.position.length / 3;
  }

  clone() {
    return new Geometry({
      position: this.position.slice(),
      normal: this.normal?.slice(),
      uv: this.uv?.slice(),
      index: this.index?.slice(),
      groups: this.groups,
    });
  }

  translate(x, y, z) {
    const p = this.position;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += x;
      p[i + 1] += y;
      p[i + 2] += z;
    }
    return this;
  }

  // Rotate by the basis whose columns are x, y and z.
  rotate(x, y, z) {
    for (const a of [this.position, this.normal]) {
      if (!a) continue;
      for (let i = 0; i < a.length; i += 3) {
        const px = a[i];
        const py = a[i + 1];
        const pz = a[i + 2];
        a[i] = x[0] * px + y[0] * py + z[0] * pz;
        a[i + 1] = x[1] * px + y[1] * py + z[1] * pz;
        a[i + 2] = x[2] * px + y[2] * py + z[2] * pz;
      }
    }
    return this;
  }

  rotateX(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.rotate([1, 0, 0], [0, c, s], [0, -s, c]);
  }

  rotateY(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.rotate([c, 0, -s], [0, 1, 0], [s, 0, c]);
  }

  // Rotate so the geometry's +Y axis points along `dir`.
  alignY(dir) {
    const y = normalize3(dir);
    const x = normalize3(cross3(Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], y));
    return this.rotate(x, y, cross3(x, y));
  }
}

function eachTriangle(position, index, fn) {
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const ux = position[b] - position[a];
    const uy = position[b + 1] - position[a + 1];
    const uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a];
    const vy = position[c + 1] - position[a + 1];
    const vz = position[c + 2] - position[a + 2];
    fn(a, b, c, uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
}

// Builds a geometry from raw arrays: makes the triangles face outward (or along `facing`
// for flat shapes) and computes smooth normals, shared by vertices at the same position.
function finish(position, uv, index, facing) {
  let sum = 0;
  eachTriangle(position, index, (a, b, c, nx, ny, nz) => {
    sum += facing ? nx * facing[0] + ny * facing[1] + nz * facing[2] : position[a] * nx + position[a + 1] * ny + position[a + 2] * nz;
  });
  if (sum < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  const normal = new Float32Array(position.length);
  const welded = new Map();
  const keyOf = (i) => `${Math.round(position[i] * 1e4)},${Math.round(position[i + 1] * 1e4)},${Math.round(position[i + 2] * 1e4)}`;
  const keys = [];
  for (let i = 0; i < position.length; i += 3) {
    keys.push(keyOf(i));
    if (!welded.has(keys[i / 3])) welded.set(keys[i / 3], [0, 0, 0]);
  }
  eachTriangle(position, index, (a, b, c, nx, ny, nz) => {
    for (const v of [a, b, c]) {
      const n = welded.get(keys[v / 3]);
      n[0] += nx;
      n[1] += ny;
      n[2] += nz;
    }
  });
  for (let i = 0; i < position.length; i += 3) normal.set(normalize3(welded.get(keys[i / 3])), i);
  return new Geometry({ position, normal, uv, index });
}

// Surface sampled on a (nu + 1) x (nv + 1) grid; fn(u, v, i, j) returns [x, y, z, s, t].
function grid(nu, nv, fn, facing) {
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const [x, y, z, s, t] = fn(i / nu, j / nv, i, j);
      position.push(x, y, z);
      uv.push(s, t);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const d = a + nu + 1;
      index.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  return finish(position, uv, index, facing);
}

export function merge(geometries) {
  const total = geometries.reduce((n, g) => n + g.vertexCount, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const index = [];
  let offset = 0;
  for (const g of geometries) {
    position.set(g.position, offset * 3);
    normal.set(g.normal, offset * 3);
    uv.set(g.uv, offset * 2);
    for (const i of g.index) index.push(i + offset);
    offset += g.vertexCount;
  }
  return new Geometry({ position, normal, uv, index });
}

// Flat disc in the XZ plane at height y.
function cap(radius, y, segments, thetaStart) {
  const position = [0, y, 0];
  const uv = [0.5, 0.5];
  const index = [];
  for (let i = 0; i <= segments; i++) {
    const t = thetaStart + (i / segments) * Math.PI * 2;
    position.push(Math.sin(t) * radius, y, Math.cos(t) * radius);
    uv.push(Math.cos(t) * 0.5 + 0.5, Math.sin(t) * 0.5 * Math.sign(y) + 0.5);
    if (i < segments) index.push(0, i + 1, i + 2);
  }
  return finish(position, uv, index, [0, Math.sign(y), 0]);
}

// Cylinder along Y. u runs around it, v from 1 at the top to 0 at the bottom.
export function cylinder(radiusTop, radiusBottom, height, radialSegments, heightSegments = 1, openEnded = false, thetaStart = 0) {
  const side = grid(radialSegments, heightSegments, (u, v) => {
    const r = radiusTop + (radiusBottom - radiusTop) * v;
    const t = thetaStart + u * Math.PI * 2;
    return [Math.sin(t) * r, height / 2 - v * height, Math.cos(t) * r, u, 1 - v];
  });
  if (openEnded) return side;
  const parts = [side];
  if (radiusTop > 0) parts.push(cap(radiusTop, height / 2, radialSegments, thetaStart));
  if (radiusBottom > 0) parts.push(cap(radiusBottom, -height / 2, radialSegments, thetaStart));
  return merge(parts);
}

export const cone = (radius, height, radialSegments) => cylinder(0, radius, height, radialSegments);

export function sphere(radius, widthSegments, heightSegments) {
  return grid(widthSegments, heightSegments, (u, v) => {
    const phi = u * Math.PI * 2;
    const theta = v * Math.PI;
    return [-radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), u, 1 - v];
  });
}

// Ring around the Z axis.
export function torus(radius, tube, radialSegments, tubularSegments) {
  return grid(tubularSegments, radialSegments, (u, v) => {
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const r = radius + tube * Math.cos(b);
    return [r * Math.cos(a), r * Math.sin(a), tube * Math.sin(b), u, v];
  });
}

// Profile of [radius, y] points spun around the Y axis.
export function lathe(points, segments) {
  return grid(segments, points.length - 1, (u, v, i, j) => {
    const phi = u * Math.PI * 2;
    const [r, y] = points[j];
    return [Math.sin(phi) * r, y, Math.cos(phi) * r, u, v];
  });
}

// Flat disc / ring in the XY plane, facing +Z.
export function ring(inner, outer, segments) {
  return grid(
    segments,
    1,
    (u, v) => {
      const t = u * Math.PI * 2;
      const r = inner + (outer - inner) * v;
      return [Math.cos(t) * r, Math.sin(t) * r, 0, u, v];
    },
    [0, 0, 1],
  );
}

export const circle = (radius, segments) => ring(0, radius, segments);

const T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTICES = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T],
  [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
].map(normalize3);
const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// The 12 corner directions of an icosahedron.
export const icosahedronDirections = () => ICO_VERTICES.map((v) => [...v]);

// Icosahedron with every edge split into `detail + 1` pieces, pushed out onto a sphere.
export function icosphere(radius, detail = 0) {
  const n = detail + 1;
  const position = [];
  const uv = [];
  const index = [];
  for (const [ia, ib, ic] of ICO_FACES) {
    const a = ICO_VERTICES[ia];
    const b = ICO_VERTICES[ib];
    const c = ICO_VERTICES[ic];
    const start = position.length / 3;
    const at = (i, j) => start + (i * (2 * n + 3 - i)) / 2 + j; // row i has n + 1 - i points
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const wb = i / n;
        const wc = j / n;
        const wa = 1 - wb - wc;
        const p = normalize3([0, 1, 2].map((k) => a[k] * wa + b[k] * wb + c[k] * wc));
        position.push(p[0] * radius, p[1] * radius, p[2] * radius);
        uv.push(wb, wc);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        index.push(at(i, j), at(i + 1, j), at(i, j + 1));
        if (j < n - i - 1) index.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
  }
  return finish(position, uv, index);
}

// Flat shape (with optional holes) in the XY plane, extruded from z = 0 to z = depth.
// The two flat faces form material group 0 and use the shape's x/y as texture coordinates;
// the walls form group 1.
export function extrude(outline, holes, depth) {
  const { points, contours, triangles } = triangulate(outline, holes);
  const position = [];
  const normal = [];
  const uv = [];
  const index = [];
  for (const [z, nz] of [[depth, 1], [0, -1]]) {
    const start = position.length / 3;
    for (const [x, y] of points) {
      position.push(x, y, z);
      normal.push(0, 0, nz);
      uv.push(x, y);
    }
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
      if (nz > 0) index.push(start + a, start + b, start + c);
      else index.push(start + a, start + c, start + b);
    }
  }
  const capCount = index.length;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = points[contour[i]];
      const [x1, y1] = points[contour[(i + 1) % contour.length]];
      const [nx, ny] = normalize3([y1 - y0, x0 - x1, 0]);
      const start = position.length / 3;
      position.push(x0, y0, 0, x1, y1, 0, x1, y1, depth, x0, y0, depth);
      normal.push(nx, ny, 0, nx, ny, 0, nx, ny, 0, nx, ny, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      index.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  return new Geometry({
    position,
    normal,
    uv,
    index,
    groups: [
      { start: 0, count: capCount, material: 0 },
      { start: capCount, count: index.length - capCount, material: 1 },
    ],
  });
}
