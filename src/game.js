import {
  ACESFilmicToneMapping,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CAMERA_DISTANCE,
  COUNTDOWN_STEP,
  MAX_SPEED,
  MODES,
  SCORE_PER_UNIT,
  SHIP_LATERAL_SPEED,
  SHIP_LIMIT,
  START_SPEED,
  speedAt,
} from './config.js';
import { rotate2 } from './logic/collision.js';
import { mulberry32 } from './logic/patterns.js';
import { Tunnel, themeIndexAt } from './world/tunnel.js';
import { THEMES, themeColors } from './world/themes.js';
import { ObstacleField } from './world/obstacles.js';
import { Ship } from './world/ship.js';
import { Explosion } from './world/effects.js';
import { bendUniform, bendAt, rollAt } from './world/bend.js';
import { loadBest, saveBest } from './storage.js';

const MENU_SPEED = 14;
const CRASH_DELAY = 1.5; // seconds between the crash and the results screen
const THEME_COLORS = THEMES.map(themeColors);

export class Game {
  constructor({ canvas, ui, input, audio, settings, debug = {} }) {
    this.ui = ui;
    this.input = input;
    this.audio = audio;
    this.settings = settings;
    this.debug = debug;

    const dpr = window.devicePixelRatio || 1;
    this.renderer = new WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(dpr, 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new Scene();
    const pmrem = new PMREMGenerator(this.renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envMap; // ship and obstacles; tunnel walls set their own
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.scene.fog = new Fog(THEME_COLORS[0].fog, 40, 235);
    this.fogColor = this.scene.fog.color; // Fog copies the colour, so animate its own instance
    this.scene.background = this.fogColor;

    this.camera = new PerspectiveCamera(70, 1, 0.1, 420);
    this.hemi = new HemisphereLight(THEME_COLORS[0].sky, THEME_COLORS[0].ground, THEME_COLORS[0].intensity);
    this.scene.add(this.hemi);
    this.headlight = new PointLight('#ffffff', THEME_COLORS[0].headlight, 70, 1.3);
    this.scene.add(this.headlight);

    this.root = new Group(); // the whole tunnel; rolled around the Z axis
    this.scene.add(this.root);
    this.tunnel = new Tunnel(this.root, envMap);
    this.obstacles = new ObstacleField(this.root);
    this.ship = new Ship();
    this.scene.add(this.ship.group);
    this.explosion = new Explosion(this.scene);

    this.state = 'menu';
    this.mode = 'classic';
    this.distance = 0;
    this.goDistance = 0;
    this.speed = MENU_SPEED;
    this.time = 0;
    this.stateTime = 0;
    this.countStep = -1;
    this.score = 0;
    this.shake = 0;
    this.pos = { x: 0, y: -1.2 };
    this.vel = { x: 0, y: 0 };
    this.roll = 0;
    this.frameTimes = [];

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.updateFov();
  }

  // Keep a sensible horizontal field of view in portrait so the tunnel still fits.
  updateFov() {
    const level = Math.max(0, (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED));
    const base = 68 + level * 10;
    const minH = 64 + level * 8;
    const needed = (2 * Math.atan(Math.tan((minH * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    const fov = Math.max(base, needed);
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get running() {
    return this.state === 'countdown' || this.state === 'playing';
  }

  startRun(mode) {
    this.mode = MODES[mode] ? mode : 'classic';
    this.rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    this.distance = 0;
    this.speed = START_SPEED;
    this.goDistance = START_SPEED * COUNTDOWN_STEP * 3;
    this.tunnel.reset(0);
    this.obstacles.start(this.goDistance + START_SPEED * 2.2, this.goDistance);
    this.explosion.reset();
    this.pos = { x: 0, y: -1.2 };
    this.vel = { x: 0, y: 0 };
    this.ship.group.visible = true;
    this.score = 0;
    this.ui.setScore(0);
    this.state = 'countdown';
    this.stateTime = 0;
    this.countStep = -1;
    this.ui.show('play');
    this.ui.tip(this.mode);
    this.audio.startEngine();
    this.audio.startMusic();
  }

  pause() {
    if (!this.running) return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.input.release();
    this.ui.show('pause');
    this.audio.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom;
    this.ui.show('play');
    this.audio.resume();
    this.last = performance.now();
  }

  toMenu() {
    this.state = 'menu';
    this.obstacles.clear();
    this.explosion.reset();
    this.ship.group.visible = true;
    this.speed = MENU_SPEED;
    this.ui.hideCountdown();
    this.ui.hideTip();
    this.ui.show('menu');
    this.audio.stopEngine();
    this.audio.resume();
  }

  crash() {
    this.state = 'crashed';
    this.stateTime = 0;
    this.obstacles.stopSpawning();
    this.ship.group.visible = false;
    this.explosion.trigger(this.ship.group.position);
    this.shake = 1;
    this.ui.flash();
    this.ui.hideCountdown();
    this.ui.hideTip();
    this.input.release();
    this.audio.stopEngine();
    this.audio.explosion();
    navigator.vibrate?.(180);
  }

  finishRun() {
    const previous = loadBest(this.mode);
    const record = this.score > previous && !this.debug.god; // god mode never sets records
    const best = record ? this.score : previous;
    if (record) saveBest(this.mode, best);
    this.ui.setBest(this.mode, best);
    this.state = 'gameover';
    this.ui.gameOver({ score: this.score, best, record, modeLabel: MODES[this.mode].label });
  }

  frame(now) {
    // rAF timestamps can precede the performance.now() taken at start-up.
    const rawDt = Math.max(0, (now - this.last) / 1000);
    this.last = Math.max(now, this.last);
    const dt = Math.min(rawDt, 1 / 20);
    this.input.update();
    this.adaptQuality(rawDt);
    if (this.state !== 'paused') this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const prev = this.distance;

    if (this.state === 'menu' || this.state === 'gameover') {
      this.speed += (MENU_SPEED - this.speed) * Math.min(1, dt * 2);
      this.autopilot(dt);
    } else if (this.state === 'crashed') {
      // brake hard so the obstacle we hit doesn't slide through the camera
      this.speed *= Math.exp(-dt * 22);
      if (this.stateTime > CRASH_DELAY) this.finishRun();
    } else {
      this.speed = speedAt(Math.max(0, this.distance - this.goDistance));
      this.steer(dt);
    }
    this.distance += this.speed * dt;

    const run = Math.max(0, this.distance - this.goDistance);
    const inMenu = this.state === 'menu' || this.state === 'gameover';
    const curve = inMenu ? 0.8 : Math.min(1, 0.35 + run / 900);
    bendAt(this.distance, curve, bendUniform.value);
    this.roll = rollAt(this.distance, inMenu ? 0.5 : Math.min(0.85, run / 1400));
    this.root.rotation.z = this.roll;

    this.tunnel.update(this.distance);
    const passed = this.obstacles.update(dt, this.time, this.distance, this.rng, this.mode);
    if (this.running) this.whooshFor(passed);

    if (this.state === 'countdown') this.updateCountdown();
    if (this.state === 'playing') {
      const [lx, ly] = rotate2(this.pos.x, this.pos.y, -this.roll);
      if (!this.debug.god && this.obstacles.collide(prev, this.distance, lx, ly)) {
        this.crash();
      } else {
        this.score = Math.floor(run * SCORE_PER_UNIT);
        this.ui.setScore(this.score);
      }
      this.audio.setEngine((this.speed - START_SPEED) / (MAX_SPEED - START_SPEED));
    }

    this.updateShip(dt);
    this.updateCamera(dt);
    this.updateAtmosphere(dt);
    this.explosion.update(dt);
    this.updateFov();
  }

  whooshFor(passed) {
    for (const item of passed) {
      if (item.kind === 'mine') {
        const [lx, ly] = rotate2(this.pos.x, this.pos.y, -this.roll);
        if (Math.hypot(item.x - lx, item.y - ly) > 2.6) continue;
      }
      this.audio.whoosh(item.kind === 'mine' ? 0.6 : 1);
      return;
    }
  }

  updateCountdown() {
    const step = Math.floor(this.stateTime / COUNTDOWN_STEP);
    if (step === this.countStep) return;
    this.countStep = step;
    const go = step >= 3;
    this.ui.countdown(go ? 'GO!' : String(3 - step));
    this.audio.countdown(go);
    if (go) {
      this.state = 'playing';
      this.goDistance = this.distance;
    }
  }

  steer(dt) {
    const [ax, ay] = this.input.axis();
    const lateral = SHIP_LATERAL_SPEED * (1 + Math.min(0.35, (this.speed - START_SPEED) / 150));
    const k = Math.min(1, dt * 10);
    this.vel.x += (ax * lateral - this.vel.x) * k;
    this.vel.y += (ay * lateral - this.vel.y) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    const r = Math.hypot(this.pos.x, this.pos.y);
    if (r > SHIP_LIMIT) {
      // slide along the tunnel wall instead of sticking to it
      const nx = this.pos.x / r;
      const ny = this.pos.y / r;
      this.pos.x = nx * SHIP_LIMIT;
      this.pos.y = ny * SHIP_LIMIT;
      const outward = this.vel.x * nx + this.vel.y * ny;
      if (outward > 0) {
        this.vel.x -= outward * nx;
        this.vel.y -= outward * ny;
      }
    }
  }

  // Gentle wandering flight behind the menus.
  autopilot(dt) {
    const tx = Math.sin(this.time * 0.45) * 1.8;
    const ty = -0.9 + Math.sin(this.time * 0.63) * 1.1;
    this.vel.x = (tx - this.pos.x) * 1.5;
    this.vel.y = (ty - this.pos.y) * 1.5;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }

  updateShip(dt) {
    this.ship.group.position.set(this.pos.x, this.pos.y, 0);
    const boost = 1 + Math.max(0, (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED)) * 0.35;
    this.ship.animate(dt, this.vel.x, this.vel.y, boost);
  }

  updateCamera(dt) {
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const level = Math.max(0, (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED));
    const jitter = this.shake * this.shake * 0.6 + (this.state === 'playing' ? level * 0.025 : 0);
    const jx = (Math.random() - 0.5) * jitter;
    const jy = (Math.random() - 0.5) * jitter;
    this.camera.position.set(this.pos.x * 0.55 + jx, this.pos.y * 0.55 + 1.0 + jy, CAMERA_DISTANCE);
    this.camera.lookAt(this.pos.x * 0.3, this.pos.y * 0.3 + 0.45, -40);
    this.headlight.position.set(this.pos.x * 0.4, this.pos.y * 0.4 + 0.5, -16);
  }

  // Fog and ambient light fade toward the style of the tunnel ahead.
  updateAtmosphere(dt) {
    const target = THEME_COLORS[themeIndexAt(this.distance + 120)];
    const k = Math.min(1, dt * 0.9);
    this.fogColor.lerp(target.fog, k);
    this.hemi.color.lerp(target.sky, k);
    this.hemi.groundColor.lerp(target.ground, k);
    this.hemi.intensity += (target.intensity - this.hemi.intensity) * k;
    this.headlight.intensity += (target.headlight - this.headlight.intensity) * k;
  }

  // Drop the render resolution on devices that can't keep up.
  adaptQuality(rawDt) {
    if (rawDt <= 0 || rawDt > 0.25) return;
    this.frameTimes.push(rawDt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
    }
  }
}
