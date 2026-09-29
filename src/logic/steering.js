// Steering feel: stick response curve and velocity easing. Pure functions so they can be unit tested.

export const STICK_DEADZONE = 0.08;
export const STICK_EXPO = 1.7;

// Deadzone plus an expo curve: small stick movements give fine, slow corrections while
// full deflection still reaches full speed. Digital input (keys) always has magnitude >= 1.
export function shapeAxis(x, y, deadzone = STICK_DEADZONE, expo = STICK_EXPO) {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return [0, 0];
  const m = Math.min(1, (len - deadzone) / (1 - deadzone));
  const scale = m ** expo / len;
  return [x * scale, y * scale];
}

// Eases `vel` toward `target`. Speeding up uses `accel`; slowing down or reversing uses the
// firmer `brake`, so the ship glides into a move but doesn't drift past the gap you aimed for.
export function steerVelocity(vel, tx, ty, dt, accel, brake) {
  const dx = tx - vel.x;
  const dy = ty - vel.y;
  const slowing = dx * vel.x + dy * vel.y < 0;
  const k = 1 - Math.exp(-dt * (slowing ? brake : accel));
  vel.x += dx * k;
  vel.y += dy * k;
  return vel;
}
