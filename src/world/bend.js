// "Curved world" trick: collision happens in a straight tunnel, but the vertex shaders bend
// everything in the tunnel sideways in view space by bend * depth^2 (see gl/shaders.js), so
// the tunnel appears to snake and twist ahead of the ship while staying trivial to simulate.

// Smooth pseudo-random curvature driven by distance travelled; writes [x, y] into `out`.
export function bendAt(distance, strength, out) {
  const s = distance;
  const k = 0.00042 * strength;
  out[0] = (Math.sin(s * 0.0021 + 1.3) * 0.62 + Math.sin(s * 0.0053) * 0.38) * k;
  out[1] = (Math.sin(s * 0.0017 + 4.1) * 0.55 + Math.sin(s * 0.0041 + 0.7) * 0.45) * k;
  return out;
}

// Slow roll of the whole tunnel around its axis (gives the spiral feel of the original).
export function rollAt(distance, strength) {
  return (Math.sin(distance * 0.0013) * 0.9 + Math.sin(distance * 0.0031 + 2) * 0.45) * strength;
}
