// Shared tuning constants. Units are roughly metres; the tunnel runs along -Z.

export const TUNNEL_RADIUS = 6; // circumradius of the polygonal tunnel
export const TUNNEL_SIDES = 12;
export const SEGMENT_LENGTH = 16;
export const SEGMENT_COUNT = 17; // segments kept alive (~270 units of tunnel)
export const THEME_LENGTH = 900; // distance before the tunnel changes style

export const SHIP_RADIUS = 0.42; // collision radius (smaller than the model on purpose)
export const SHIP_LIMIT = TUNNEL_RADIUS - 1.4; // max distance from the axis (keeps wingtips out of the walls)
export const SHIP_LATERAL_SPEED = 9.5;

export const CAMERA_DISTANCE = 7.2; // camera sits this far behind the ship
export const SPAWN_AHEAD = 240; // obstacles are created this far in front of the ship
export const DESPAWN_BEHIND = CAMERA_DISTANCE + 6;

export const START_SPEED = 30;
export const MAX_SPEED = 88;
export const SPEED_RAMP = 2600; // distance constant of the exponential speed ramp
export const SCORE_PER_UNIT = 0.25;

export const COUNTDOWN_STEP = 0.75; // seconds per "3", "2", "1", "GO!"

export const MODES = {
  classic: { id: 'classic', label: 'Classic', mines: false },
  mines: { id: 'mines', label: 'Mine Mode', mines: true },
};

export function speedAt(distance) {
  return START_SPEED + (MAX_SPEED - START_SPEED) * (1 - Math.exp(-distance / SPEED_RAMP));
}

// 0 at the start of a run, approaching 1 after a few thousand units.
export function difficultyAt(distance) {
  return Math.min(1, distance / 5200);
}
