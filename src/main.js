import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import './style.css';
import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { loadSettings, saveSettings, loadBest } from './storage.js';
import { MODES } from './config.js';
import { setupPwa } from './pwa.js';
import { Tilt } from './tilt.js';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
const ui = new UI();
const audio = new AudioEngine(settings);
const input = new Input({
  surface: document.getElementById('touch-layer'),
  joystick: document.getElementById('joystick'),
  knob: document.querySelector('#joystick .knob'),
});
input.invertY = settings.invertY;
const tilt = new Tilt();
input.tilt = tilt;
const tiltSupported = Tilt.supported();
if (!tiltSupported) settings.tilt = false;

let game;
try {
  game = new Game({
    canvas: document.getElementById('scene'),
    ui,
    input,
    audio,
    settings,
    debug: { god: params.has('god') },
  });
} catch (err) {
  console.error(err);
  document.getElementById('no-webgl').hidden = false;
  throw err;
}

for (const mode of Object.keys(MODES)) ui.setBest(mode, loadBest(mode));
document.getElementById('tgl-tilt').hidden = !tiltSupported;
ui.setToggles(settings);
ui.show('menu');

let lastMode = 'classic';

// Phones play in landscape: go fullscreen and lock the orientation where the browser allows it
// (Android Chrome); elsewhere the rotate prompt below asks the player to turn the phone.
function enterFullscreen() {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (!touch) return;
  const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
  if (standalone || document.fullscreenElement) return lock();
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(lock)
    .catch(() => {});
}

function start(mode) {
  lastMode = mode;
  audio.unlock();
  audio.click();
  enterFullscreen();
  // iOS forgets sensor permission between visits; this tap lets us ask again
  if (settings.tilt && !tilt.enabled) tilt.enable();
  game.startRun(mode);
}

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => start(btn.dataset.mode));
});

const on = (id, fn) =>
  document.getElementById(id).addEventListener('click', () => {
    audio.unlock();
    audio.click();
    fn();
  });

on('btn-pause', () => game.pause());
on('btn-resume', () => game.resume());
on('btn-quit', () => game.toMenu());
on('btn-retry', () => start(lastMode));
on('btn-menu', () => game.toMenu());

function toggle(key) {
  settings[key] = !settings[key];
  saveSettings(settings);
  ui.setToggles(settings);
  audio.applySettings();
  input.invertY = settings.invertY;
}
on('tgl-sound', () => toggle('sound'));
on('tgl-music', () => {
  toggle('music');
  audio.startMusic();
});
on('tgl-invert', () => toggle('invertY'));
document.getElementById('tgl-tilt').addEventListener('click', async () => {
  audio.unlock();
  audio.click();
  if (settings.tilt) {
    tilt.disable();
    toggle('tilt');
    return;
  }
  if (await tilt.enable()) toggle('tilt');
  else ui.toast('Motion sensor access was not allowed. Tap to dismiss.');
});
if (settings.tilt) tilt.enable(); // works without a tap on Android; iOS asks again on Play

// Ask phone players to turn to landscape; the run pauses while the phone is upright.
const rotatePrompt = document.getElementById('rotate');
const portraitPhone = matchMedia('(orientation: portrait) and (pointer: coarse)');
let portraitAllowed = false;
function checkOrientation() {
  const show = portraitPhone.matches && !portraitAllowed;
  rotatePrompt.hidden = !show;
  if (show) game.pause();
}
portraitPhone.addEventListener('change', checkOrientation);
document.getElementById('btn-portrait').addEventListener('click', () => {
  portraitAllowed = true;
  checkOrientation();
});
checkOrientation();

// Keyboard / gamepad shortcuts mirror the on-screen buttons.
input.on('confirm', () => {
  if (game.state === 'menu') start(lastMode);
  else if (game.state === 'gameover') start(lastMode);
  else if (game.state === 'paused') game.resume();
});
input.on('pause', () => {
  if (game.state === 'paused') game.resume();
  else if (game.running) game.pause();
  else if (game.state === 'gameover') game.toMenu();
});

// Music may play on the menu once the browser allows audio.
window.addEventListener(
  'pointerdown',
  () => {
    audio.unlock();
    audio.startMusic();
  },
  { once: true },
);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.pause();
    audio.suspend();
  } else if (game.state !== 'paused') {
    audio.resume();
  }
});

setupPwa(ui);

if (params.has('debug')) window.game = game;
