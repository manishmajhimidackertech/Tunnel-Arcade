// DOM overlay: menus, HUD, LED countdown and tip banners.
import { drawDotMatrix } from './dotmatrix.js';

const $ = (id) => document.getElementById(id);

const TIPS = {
  classic: [
    ['Control the spaceship by joystick', 'red'],
    ["Pass through the doors, but don't collide with them", 'green'],
    ['Make the highest score in the world', 'red'],
    ['Real 3D space adventure', 'blue'],
    ['Watch out for spinning bars', 'green'],
    ['Grab the hourglass to slow down time', 'blue'],
  ],
  mines: [
    ['Enjoy mine mode, be aware of mines', 'blue'],
    ['Grab the hourglass to slow down time', 'green'],
    ['Mines drift around the tunnel. Keep moving!', 'red'],
    ['Control the spaceship by joystick', 'green'],
  ],
};

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      score: $('score'),
      joystick: $('joystick'),
      countdown: $('countdown'),
      banner: $('banner'),
      flash: $('flash'),
      menu: $('menu'),
      pause: $('pause'),
      gameover: $('gameover'),
      finalScore: $('final-score'),
      finalBest: $('final-best'),
      finalMode: $('final-mode'),
      newRecord: $('new-record'),
      crashTitle: $('crash-title'),
      toast: $('toast'),
      slowmo: $('slowmo'),
      slowmoBar: document.querySelector('#slowmo b'),
      bonus: $('bonus'),
      install: $('btn-install'),
      sound: $('tgl-sound'),
      music: $('tgl-music'),
      invert: $('tgl-invert'),
    };
    this.lastScore = -1;
    this.countdownTimer = null;
    this.bannerTimer = null;
    drawDotMatrix(this.el.crashTitle, 'CRASH!', { dot: 7, color: '#ff4a3a', glow: '#ff2a1a' });
  }

  show(name) {
    for (const key of ['menu', 'pause', 'gameover']) this.el[key].hidden = key !== name;
    const playing = name === 'play';
    this.el.hud.hidden = !playing && name !== 'pause';
    this.el.joystick.hidden = !playing;
    document.body.dataset.screen = name;
  }

  setBest(mode, best) {
    const el = document.querySelector(`[data-best="${mode}"]`);
    if (el) el.textContent = best > 0 ? `Best ${best}` : 'No record yet';
  }

  setScore(score) {
    if (score === this.lastScore) return;
    this.lastScore = score;
    this.el.score.textContent = String(score);
  }

  setToggles(settings) {
    this.el.sound.textContent = `Sound: ${settings.sound ? 'On' : 'Off'}`;
    this.el.music.textContent = `Music: ${settings.music ? 'On' : 'Off'}`;
    this.el.invert.textContent = `Invert Y: ${settings.invertY ? 'On' : 'Off'}`;
    this.el.sound.setAttribute('aria-pressed', String(settings.sound));
    this.el.music.setAttribute('aria-pressed', String(settings.music));
    this.el.invert.setAttribute('aria-pressed', String(settings.invertY));
  }

  // fraction: remaining slow motion, 0..1 (0 hides the meter)
  setSlowmo(fraction) {
    const on = fraction > 0;
    if (this.slowmoOn !== on) {
      this.slowmoOn = on;
      this.el.slowmo.hidden = !on;
      document.body.classList.toggle('slowmo', on);
    }
    if (on) this.el.slowmoBar.style.transform = `scaleX(${fraction})`;
  }

  slowmoPickup(points) {
    const b = this.el.bonus;
    b.textContent = `+${points} SLOW-MO`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  countdown(text) {
    const c = this.el.countdown;
    const dot = Math.max(5, Math.min(16, window.innerWidth / 46, window.innerHeight / 30));
    drawDotMatrix(c, text, { dot });
    c.classList.remove('pop');
    void c.offsetWidth; // restart the CSS animation
    c.classList.add('pop');
    c.hidden = false;
    clearTimeout(this.countdownTimer);
    if (text.endsWith('!')) this.countdownTimer = setTimeout(() => (c.hidden = true), 900);
  }

  hideCountdown() {
    clearTimeout(this.countdownTimer);
    this.el.countdown.hidden = true;
  }

  tip(mode) {
    const list = TIPS[mode] || TIPS.classic;
    const [text, color] = list[Math.floor(Math.random() * list.length)];
    const b = this.el.banner;
    b.textContent = text;
    b.className = `banner banner-${color} visible`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('visible'), 3600);
  }

  hideTip() {
    clearTimeout(this.bannerTimer);
    this.el.banner.classList.remove('visible');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  gameOver({ score, best, record, modeLabel }) {
    this.el.finalScore.textContent = String(score);
    this.el.finalBest.textContent = String(best);
    this.el.finalMode.textContent = modeLabel;
    this.el.newRecord.hidden = !record;
    this.show('gameover');
  }

  toast(text, onClick) {
    const t = this.el.toast;
    t.textContent = text;
    t.hidden = false;
    t.onclick = onClick || (() => (t.hidden = true));
  }
}
