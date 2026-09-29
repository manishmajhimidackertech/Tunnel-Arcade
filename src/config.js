// Shared tuning constants. Units are roughly metres; the tunnel runs along -Z.

export const TUNNEL_RADIUS = 6; // circumradius of the polygonal tunnel
export const TUNNEL_SIDES = 12;
export const SEGMENT_LENGTH = 16;
export const SEGMENT_COUNT = 17; // segments kept alive (~270 units of tunnel)
export const THEME_LENGTH = 900; // distance before the tunnel changes style

export const SHIP_RADIUS = 0.42; // collision radius (smaller than the model on purpose)
export const SHIP_LIMIT = TUNNEL_RADIUS - 1.4; // max distance from the axis (keeps wingtips out of the walls)
export const SHIP_LATERAL_SPEED = 6.5; // steering speed at the start of a run
export const SHIP_LATERAL_BONUS = 2.5; // extra steering speed at top speed, so late gaps stay reachable
export const SHIP_ACCEL = 5; // 1/s: how quickly steering eases up to speed (~0.45 s to 90%)
export const SHIP_BRAKE = 8; // 1/s: stopping is a little firmer than starting

export const CAMERA_DISTANCE = 7.2; // camera sits this far behind the ship
export const SPAWN_AHEAD = 240; // obstacles are created this far in front of the ship
export const DESPAWN_BEHIND = CAMERA_DISTANCE + 6;

// Constant, gentle acceleration: ~16 u/s at GO, ~31 after a minute, ~46 after two, capped
// after about 3.5 minutes. (The old exponential ramp was steepest right at the start.)
export const START_SPEED = 16;
export const MAX_SPEED = 72;
export const ACCELERATION = 0.25; // units/s^2
export const SCORE_PER_UNIT = 0.25;
// The first slow-motion pickup waits until the run has built up real pace (~1 minute in);
// after that they appear every few obstacles.
export const FIRST_PICKUP_SPEED = 30;

export const COUNTDOWN_STEP = 0.75; // seconds per "3", "2", "1", "GO!"

export const MODES = {
  classic: { id: 'classic', label: 'Classic', mines: false },
  mines: { id: 'mines', label: 'Mine Mode', mines: true },
};

// v^2 = v0^2 + 2ad: speed after flying `distance` units with constant acceleration.
export function speedAt(distance) {
  return Math.min(MAX_SPEED, Math.sqrt(START_SPEED ** 2 + 2 * ACCELERATION * Math.max(0, distance)));
}

// 0 at the start of a run, reaching 1 after roughly 2.5-3 minutes of flight.
export function difficultyAt(distance) {
  return Math.min(1, distance / 6000);
}
