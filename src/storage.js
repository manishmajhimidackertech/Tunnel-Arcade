// localStorage wrappers that never throw (private mode, blocked storage, etc.).
const PREFIX = 'tunnel-arcade.';
const OLD_PREFIX = 'tunnel-trouble-3d.'; // before the game was renamed; still read so scores carry over

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key) ?? localStorage.getItem(OLD_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

export const SENSITIVITY_MIN = 0.5;
export const SENSITIVITY_MAX = 1.5;

export function loadSettings() {
  const settings = { sound: true, music: true, invertY: false, tilt: false, sensitivity: 1, ...read('settings', {}) };
  const s = Number(settings.sensitivity);
  settings.sensitivity = Number.isFinite(s) ? Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, s)) : 1;
  return settings;
}

export function saveSettings(settings) {
  write('settings', settings);
}

export function loadBest(mode) {
  return Number(read(`best.${mode}`, 0)) || 0;
}

export function saveBest(mode, score) {
  write(`best.${mode}`, score);
}
