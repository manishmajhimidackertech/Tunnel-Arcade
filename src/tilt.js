// Tilt (gyroscope) steering: listens to the orientation sensor and reports a steering axis
// relative to how the phone was held when the run started.
import { gravityOnScreen, tiltAxis } from './logic/tilt.js';

function screenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

export class Tilt {
  constructor() {
    this.enabled = false;
    this.gravity = null; // smoothed screen-space gravity
    this.neutral = null; // calibrated pose
    this.onOrientation = (e) => this.read(e);
    // turning the phone round changes what "level" means
    const recalibrate = () => (this.neutral = this.gravity = null);
    screen.orientation?.addEventListener?.('change', recalibrate);
    window.addEventListener('orientationchange', recalibrate);
  }

  // Phones and tablets with an orientation sensor API.
  static supported() {
    return typeof window.DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  }

  // Must be called from a tap/click: iOS only grants sensor access from a user gesture.
  async enable() {
    const request = window.DeviceOrientationEvent?.requestPermission;
    if (typeof request === 'function') {
      const answer = await request.call(window.DeviceOrientationEvent).catch(() => 'denied');
      if (answer !== 'granted') return false;
    }
    if (!this.enabled) window.addEventListener('deviceorientation', this.onOrientation);
    this.enabled = true;
    this.neutral = null;
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.enabled = false;
    this.gravity = this.neutral = null;
  }

  read(e) {
    if (e.beta == null || e.gamma == null) return;
    const g = gravityOnScreen(e.beta, e.gamma, screenAngle());
    // light low-pass filter: sensors are noisy, and hand tremor shouldn't wiggle the ship
    this.gravity = this.gravity ? [this.gravity[0] * 0.7 + g[0] * 0.3, this.gravity[1] * 0.7 + g[1] * 0.3] : g;
    if (!this.neutral) this.neutral = [...this.gravity];
  }

  // The current pose becomes "straight ahead" (called when a run starts or resumes).
  calibrate() {
    this.neutral = this.gravity ? [...this.gravity] : null;
  }

  axis() {
    if (!this.enabled || !this.gravity || !this.neutral) return [0, 0];
    return tiltAxis(this.gravity, this.neutral);
  }
}
