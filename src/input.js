// Keyboard, on-screen joystick (touch/mouse drag) and gamepad, merged into one steering axis.

const KEY_AXES = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
};

export class Input {
  constructor({ surface, joystick, knob }) {
    this.surface = surface;
    this.joystick = joystick;
    this.knob = knob;
    this.keys = new Set();
    this.stick = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.handlers = { confirm: () => {}, pause: () => {} };
    this.padButtons = [];
    this.pad = [0, 0];
    this.invertY = false;
    this.maxRadius = 52;

    window.addEventListener('keydown', (e) => {
      if (e.code in KEY_AXES || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Enter' || e.code === 'Space') this.handlers.confirm();
      if (e.code === 'Escape' || e.code === 'KeyP') this.handlers.pause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });

    surface.addEventListener('pointerdown', (e) => this.press(e));
    surface.addEventListener('pointermove', (e) => this.move(e));
    surface.addEventListener('pointerup', (e) => this.up(e));
    surface.addEventListener('pointercancel', (e) => this.up(e));
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  // Floating joystick: the base jumps to wherever the finger lands.
  press(e) {
    if (this.stick.id !== null) return;
    e.preventDefault();
    this.stick.id = e.pointerId;
    this.surface.setPointerCapture?.(e.pointerId);
    this.stick.cx = e.clientX;
    this.stick.cy = e.clientY;
    const rect = this.joystick.getBoundingClientRect();
    const hx = rect.left + rect.width / 2;
    const hy = rect.top + rect.height / 2;
    this.joystick.classList.add('active');
    this.joystick.style.transform = `translate(${e.clientX - hx}px, ${e.clientY - hy}px)`;
    this.move(e);
  }

  move(e) {
    if (e.pointerId !== this.stick.id) return;
    let dx = e.clientX - this.stick.cx;
    let dy = e.clientY - this.stick.cy;
    const len = Math.hypot(dx, dy);
    if (len > this.maxRadius) {
      dx *= this.maxRadius / len;
      dy *= this.maxRadius / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.stick.x = dx / this.maxRadius;
    this.stick.y = -dy / this.maxRadius;
  }

  up(e) {
    if (e.pointerId === this.stick.id) this.release();
  }

  release() {
    this.stick.id = null;
    this.stick.x = this.stick.y = 0;
    this.knob.style.transform = '';
    this.joystick.style.transform = '';
    this.joystick.classList.remove('active');
  }

  // Call once per frame (also in menus, so the A/Start buttons work everywhere).
  update() {
    this.pad = this.pollGamepad();
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const pressed = pad.buttons.map((b) => b.pressed);
      if (pressed[0] && !this.padButtons[0]) this.handlers.confirm();
      if (pressed[9] && !this.padButtons[9]) this.handlers.pause();
      this.padButtons = pressed;
      const dead = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      let x = dead(pad.axes[0] || 0);
      let y = -dead(pad.axes[1] || 0);
      if (pressed[14]) x = -1;
      if (pressed[15]) x = 1;
      if (pressed[12]) y = 1;
      if (pressed[13]) y = -1;
      return [x, y];
    }
    return [0, 0];
  }

  // Combined steering in [-1, 1]; +y is up on screen.
  axis() {
    let x = this.stick.x;
    let y = this.stick.y;
    for (const code of this.keys) {
      const a = KEY_AXES[code];
      if (a) {
        x += a[0];
        y += a[1];
      }
    }
    x += this.pad[0];
    y += this.pad[1];
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return [x, this.invertY ? -y : y];
  }
}
