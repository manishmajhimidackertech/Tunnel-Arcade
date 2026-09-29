// Time-scale curve for the slow-motion pickup. Pure so it can be unit tested.
//
// The world eases down to SLOWMO_SCALE, holds, then eases back up to full pace. Both ramps
// use smootherstep, whose first and second derivatives are zero at each end, so the change
// in pace starts and finishes gently instead of lurching.

export const SLOWMO_TIME = 5; // seconds per pickup (real time), ramps included
export const SLOWMO_SCALE = 0.45; // world speed while slowed; steering keeps full speed
export const SLOWMO_EASE_IN = 0.9; // seconds to slow down
export const SLOWMO_EASE_OUT = 1.6; // seconds to regain pace

export function smootherstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Time scale `elapsed` seconds after a pickup that started while the world ran at `from`
// (1 normally; lower if a second pickup is grabbed mid-ramp, so the pace never jumps).
export function slowmoScale(elapsed, from = 1) {
  if (elapsed >= SLOWMO_TIME) return 1;
  const outStart = SLOWMO_TIME - SLOWMO_EASE_OUT;
  if (elapsed >= outStart) {
    return SLOWMO_SCALE + (1 - SLOWMO_SCALE) * smootherstep((elapsed - outStart) / SLOWMO_EASE_OUT);
  }
  return from + (SLOWMO_SCALE - from) * smootherstep(elapsed / SLOWMO_EASE_IN);
}

// True once the pace has started coming back (used to time the "speed up" sound).
export function slowmoRecovering(elapsed) {
  return elapsed >= SLOWMO_TIME - SLOWMO_EASE_OUT;
}
