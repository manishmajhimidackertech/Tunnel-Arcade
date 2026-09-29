// Tilt steering maths. Pure so it can be unit tested.
//
// Reading `beta`/`gamma` directly breaks in landscape: `gamma` wraps from +90 to -90 when the
// phone is held upright. Instead we turn the orientation into the direction of gravity (which
// changes smoothly) and express it in screen coordinates, so "tilt the right side of the
// screen down" always steers right, whichever way the phone is rotated.

const DEG = Math.PI / 180;
export const TILT_FULL = 18; // degrees of tilt from the calibrated pose for full deflection
export const TILT_DEADZONE = 1.5; // degrees ignored around the calibrated pose

// Unit "down" vector in screen coordinates: x toward the screen's right edge, y toward its top.
// beta/gamma are DeviceOrientationEvent angles; angle is screen.orientation.angle.
export function gravityOnScreen(beta, gamma, angle) {
  const b = beta * DEG;
  const g = gamma * DEG;
  // "down" in device coordinates for the W3C Z-X'-Y'' Euler angles (alpha doesn't matter)
  const dx = Math.sin(g) * Math.cos(b);
  const dy = -Math.sin(b);
  const a = (((angle % 360) + 360) % 360) * DEG;
  // screen right = (cos a, -sin a), screen up = (sin a, cos a) in device coordinates
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

// Steering axis in [-1, 1] from how far the screen-space gravity has moved away from the
// neutral pose captured at calibration. The ship moves toward the lower side of the screen,
// like a ball on a tray.
export function tiltAxis([sx, sy], [nx, ny]) {
  const full = Math.sin(TILT_FULL * DEG);
  const dead = Math.sin(TILT_DEADZONE * DEG);
  const shape = (v) => {
    const m = Math.abs(v);
    if (m <= dead) return 0;
    return Math.sign(v) * Math.min(1, (m - dead) / (full - dead));
  };
  return [shape(sx - nx), shape(sy - ny)];
}
