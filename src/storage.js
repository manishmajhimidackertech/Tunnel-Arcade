// localStorage wrappers that never throw (private mode, blocked storage, etc.).
const PREFIX = 'tunnel-trouble-3d.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
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

export function loadSettings() {
  return { sound: true, music: true, invertY: false, ...read('settings', {}) };
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
