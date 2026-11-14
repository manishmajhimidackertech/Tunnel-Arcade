// Small maths helpers for the renderer: colours, vectors and column-major 4x4 matrices.

const srgbToLinear = (c) => (c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// Colour stored in linear RGB (what lighting works in); written as '#rrggbb' sRGB.
export class Color {
  constructor(hex = '#ffffff') {
    this.set(hex);
  }

  set(hex) {
    const n = parseInt(hex.slice(1), 16);
    this.r = srgbToLinear(((n >> 16) & 255) / 255);
    this.g = srgbToLinear(((n >> 8) & 255) / 255);
    this.b = srgbToLinear((n & 255) / 255);
    return this;
  }

  lerp(to, k) {
    this.r += (to.r - this.r) * k;
    this.g += (to.g - this.g) * k;
    this.b += (to.b - this.b) * k;
    return this;
  }

  // Display-space (sRGB) components, for the clear colour and fog.
  toSrgb(out = [0, 0, 0]) {
    out[0] = linearToSrgb(this.r);
    out[1] = linearToSrgb(this.g);
    out[2] = linearToSrgb(this.b);
    return out;
  }
}

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setScalar(s) {
    return this.set(s, s, s);
  }

  copy(v) {
    return this.set(v.x, v.y, v.z);
  }
}

export function normalize3([x, y, z]) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export const mat4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// out = a * b
export function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// Local transform from position, XYZ Euler angles (or an axis + angle) and scale.
export function compose(out, p, r, s, spin) {
  if (spin) {
    const [x, y, z] = spin.axis;
    const c = Math.cos(spin.angle);
    const si = Math.sin(spin.angle);
    const t = 1 - c;
    out[0] = t * x * x + c;
    out[1] = t * x * y + si * z;
    out[2] = t * x * z - si * y;
    out[4] = t * x * y - si * z;
    out[5] = t * y * y + c;
    out[6] = t * y * z + si * x;
    out[8] = t * x * z + si * y;
    out[9] = t * y * z - si * x;
    out[10] = t * z * z + c;
  } else {
    const a = Math.cos(r.x);
    const b = Math.sin(r.x);
    const c = Math.cos(r.y);
    const d = Math.sin(r.y);
    const e = Math.cos(r.z);
    const f = Math.sin(r.z);
    out[0] = c * e;
    out[1] = a * f + b * e * d;
    out[2] = b * f - a * e * d;
    out[4] = -c * f;
    out[5] = a * e - b * f * d;
    out[6] = b * e + a * f * d;
    out[8] = d;
    out[9] = -b * c;
    out[10] = a * c;
  }
  out[0] *= s.x;
  out[1] *= s.x;
  out[2] *= s.x;
  out[4] *= s.y;
  out[5] *= s.y;
  out[6] *= s.y;
  out[8] *= s.z;
  out[9] *= s.z;
  out[10] *= s.z;
  out[3] = out[7] = out[11] = 0;
  out[12] = p.x;
  out[13] = p.y;
  out[14] = p.z;
  out[15] = 1;
  return out;
}

export function perspective(out, fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

// View matrix for a camera at `eye` looking at `target` (Y up).
export function lookAt(out, eye, target) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3([0, 1, 0], z));
  const y = cross3(z, x);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[3] = 0;
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[7] = 0;
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[11] = 0;
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

// Inverse transpose of the upper 3x3 of `m` (transforms normals). Returns the determinant,
// which is negative for mirrored objects.
export function normalMatrix(out, m) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[4], e = m[5], f = m[6];
  const g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = 1 / (det || 1);
  out[0] = A * inv;
  out[1] = B * inv;
  out[2] = C * inv;
  out[3] = (c * h - b * i) * inv;
  out[4] = (a * i - c * g) * inv;
  out[5] = (b * g - a * h) * inv;
  out[6] = (b * f - c * e) * inv;
  out[7] = (c * d - a * f) * inv;
  out[8] = (a * e - b * d) * inv;
  return det;
}
