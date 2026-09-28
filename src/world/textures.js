// Procedural canvas textures, so the game ships without any image assets.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

export function makeCanvas(w, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

export function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const tex = new CanvasTexture(canvas);
  if (srgb) tex.colorSpace = SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function speckle(ctx, w, h, amount, seed = 1) {
  const rand = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function blotches(ctx, w, h, count, color, maxR, seed = 3) {
  const rand = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = maxR * (0.3 + rand() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

// Raised panel with light top/left edge and dark bottom/right edge.
export function bevelPanel(ctx, x, y, w, h, fill, light, dark, b = 3) {
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w - b, h - b);
  ctx.fillStyle = fill;
  ctx.fillRect(x + b, y + b, w - b * 2, h - b * 2);
}

export function glowRect(ctx, x, y, w, h, color, blur) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Soft round glow used by additive sprites (engine flame, explosions, mine lights).
export function radialGlowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(120,200,255,0.45)', size = 128) {
  const [canvas, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, { repeat: false });
}

// Horizontal lens streak behind the engine, as seen in the original's screenshots.
export function streakTexture() {
  const [canvas, ctx] = makeCanvas(256, 32);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(60,140,255,0)');
  g.addColorStop(0.5, 'rgba(190,230,255,1)');
  g.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = g;
  const v = ctx.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(0.5, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillRect(0, 0, 256, 32);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 256, 32);
  return toTexture(canvas, { repeat: false });
}

// Grey/white bands for the bars crossing the tunnel.
export function stripeTexture() {
  const [canvas, ctx] = makeCanvas(64, 256);
  ctx.fillStyle = '#eef1f4';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#262b31';
    ctx.fillRect(0, i * 64 + 32, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, i * 64 + 2, 64, 3);
  }
  speckle(ctx, 64, 256, 18, 11);
  return toTexture(canvas);
}

// Front face of a door: dark metal disc with glowing red outlines around every hole.
// UVs of the extruded cap are raw shape coordinates, so we draw in those units.
export function doorTextures(holes, radius) {
  const size = 512;
  const scale = size / (radius * 2);
  const [canvas, ctx] = makeCanvas(size);
  const [eCanvas, ectx] = makeCanvas(size);
  const toPx = ([x, y]) => [(x + radius) * scale, (radius - y) * scale];

  const g = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#3c4148');
  g.addColorStop(1, '#16191d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  for (let r = 40; r < size / 2; r += 44) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(size / 2 + Math.cos(t) * size, size / 2 + Math.sin(t) * size);
    ctx.stroke();
  }
  speckle(ctx, size, size, 22, 5);

  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, size, size);
  for (const c of [ctx, ectx]) {
    c.save();
    c.lineJoin = 'round';
    c.shadowColor = '#ff2a2a';
    c.shadowBlur = 24;
    for (const hole of holes) {
      c.beginPath();
      hole.forEach((p, i) => {
        const [px, py] = toPx(p);
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.closePath();
      c.strokeStyle = '#ff3030';
      c.lineWidth = 26;
      c.stroke();
      c.strokeStyle = '#ffc4c4';
      c.lineWidth = 7;
      c.stroke();
    }
    c.restore();
  }
  const map = toTexture(canvas, { repeat: false });
  const emissiveMap = toTexture(eCanvas, { repeat: false });
  for (const tex of [map, emissiveMap]) {
    tex.repeat.set(1 / (radius * 2), 1 / (radius * 2));
    tex.offset.set(0.5, 0.5);
  }
  return { map, emissiveMap };
}
