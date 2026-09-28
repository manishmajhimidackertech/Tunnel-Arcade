// Tunnel styles, modelled on the four looks in the original game's screenshots.
import { Color } from 'three';
import { makeCanvas, toTexture, speckle, blotches, bevelPanel, glowRect, rng } from './textures.js';

const SIZE = 256;

function reactorWall() {
  const [c, ctx] = makeCanvas(SIZE);
  const [e, ectx] = makeCanvas(SIZE);
  ctx.fillStyle = '#0d1115';
  ctx.fillRect(0, 0, SIZE, SIZE);
  bevelPanel(ctx, 10, 6, 236, 104, '#2a323a', '#48535e', '#12161a', 4);
  bevelPanel(ctx, 10, 146, 236, 104, '#262d34', '#434d57', '#12161a', 4);
  // dark vent "teeth" like the ring blocks in the original
  for (let i = 0; i < 7; i++) {
    bevelPanel(ctx, 22 + i * 32, 22, 20, 36, '#161b20', '#0b0e11', '#3a434c', 2);
    bevelPanel(ctx, 22 + i * 32, 198, 20, 36, '#161b20', '#0b0e11', '#3a434c', 2);
  }
  ctx.fillStyle = '#07090b';
  ctx.fillRect(0, 116, SIZE, 24);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, SIZE, SIZE);
  for (const x of [0, 254]) {
    glowRect(ctx, x, 0, 2, SIZE, '#5fd8ff', 6);
    glowRect(ectx, x, 0, 2, SIZE, '#3aa6ff', 6);
  }
  for (let i = 0; i < 4; i++) {
    glowRect(ctx, 20 + i * 64, 124, 24, 8, '#9ff0ff', 8);
    glowRect(ectx, 20 + i * 64, 124, 24, 8, '#7fe8ff', 10);
  }
  speckle(ctx, SIZE, SIZE, 14, 21);
  return [c, e];
}

function labWall() {
  const [c, ctx] = makeCanvas(SIZE);
  const [e, ectx] = makeCanvas(SIZE);
  ctx.fillStyle = '#9aa4ad';
  ctx.fillRect(0, 0, SIZE, SIZE);
  bevelPanel(ctx, 26, 4, 226, 248, '#dfe4e8', '#f4f7f9', '#8b959e', 4);
  // chevron pointing down the tunnel
  ctx.beginPath();
  ctx.moveTo(44, 70);
  ctx.lineTo(139, 150);
  ctx.lineTo(234, 70);
  ctx.lineTo(234, 118);
  ctx.lineTo(139, 198);
  ctx.lineTo(44, 118);
  ctx.closePath();
  ctx.fillStyle = '#c4ccd3';
  ctx.fill();
  ctx.strokeStyle = '#7d8790';
  ctx.lineWidth = 3;
  ctx.stroke();
  // side vent with little blue lights
  ctx.fillStyle = '#232a31';
  ctx.fillRect(0, 0, 22, SIZE);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, SIZE, SIZE);
  for (let y = 20; y < SIZE; y += 64) {
    ctx.fillStyle = '#39424b';
    ctx.fillRect(3, y - 10, 16, 40);
    glowRect(ctx, 8, y + 4, 7, 7, '#8fd8ff', 6);
    glowRect(ectx, 8, y + 4, 7, 7, '#39a8ff', 8);
  }
  speckle(ctx, SIZE, SIZE, 10, 33);
  return [c, e];
}

function bunkerWall() {
  const [c, ctx] = makeCanvas(SIZE);
  const [e, ectx] = makeCanvas(SIZE);
  ctx.fillStyle = '#6b6863';
  ctx.fillRect(0, 0, SIZE, SIZE);
  blotches(ctx, SIZE, SIZE, 26, 'rgba(40,38,35,0.35)', 60, 7);
  blotches(ctx, SIZE, SIZE, 18, 'rgba(150,146,140,0.3)', 40, 8);
  speckle(ctx, SIZE, SIZE, 46, 9);
  ctx.fillStyle = 'rgba(20,20,20,0.75)';
  ctx.fillRect(0, 0, 3, SIZE);
  ctx.fillRect(0, 0, SIZE, 3);
  ctx.fillRect(0, 127, SIZE, 2);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, SIZE, SIZE);
  for (const [x, y] of [[36, 40], [210, 170]]) {
    ctx.fillStyle = '#2b2a28';
    ctx.fillRect(x - 3, y - 3, 17, 17);
    glowRect(ctx, x, y, 11, 11, '#fff1c9', 10);
    glowRect(ectx, x, y, 11, 11, '#ffe2a0', 12);
  }
  return [c, e];
}

function catacombWall() {
  const [c, ctx] = makeCanvas(SIZE);
  const [e, ectx] = makeCanvas(SIZE);
  const rand = rng(41);
  ctx.fillStyle = '#6f6554';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rows = 4;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const w = SIZE / 2;
    const off = r % 2 ? w / 2 : 0;
    for (let i = -1; i < 3; i++) {
      const tint = 150 + Math.floor(rand() * 26);
      ctx.fillStyle = `rgb(${tint}, ${tint - 12}, ${tint - 34})`;
      ctx.fillRect(i * w + off + 3, r * h + 3, w - 6, h - 6);
    }
  }
  blotches(ctx, SIZE, SIZE, 30, 'rgba(60,50,35,0.3)', 50, 12);
  speckle(ctx, SIZE, SIZE, 40, 13);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, SIZE, SIZE);
  return [c, e];
}

export const THEMES = [
  {
    name: 'Reactor',
    headlight: 14,
    wall: reactorWall,
    wallColor: '#ffffff',
    metalness: 0.45,
    roughness: 0.5,
    env: 0.035,
    emissiveIntensity: 1.6,
    fog: '#02070d',
    hemi: ['#7fb8ff', '#0a1018', 0.8],
    rib: { color: '#56626e', depth: 0.62, width: 1.3, metalness: 0.7, roughness: 0.35, strip: '#8ff0ff', stripIntensity: 3.2, perSegment: 2 },
  },
  {
    name: 'Laboratory',
    headlight: 45,
    wall: labWall,
    wallColor: '#ffffff',
    metalness: 0.15,
    roughness: 0.5,
    env: 0.12,
    emissiveIntensity: 1.8,
    fog: '#8d9ba6',
    hemi: ['#ffffff', '#6d7780', 1.6],
    rib: { color: '#eef2f5', depth: 0.4, width: 0.9, metalness: 0.2, roughness: 0.4, strip: '#46b4ff', stripIntensity: 2.4, perSegment: 1 },
  },
  {
    name: 'Bunker',
    headlight: 40,
    wall: bunkerWall,
    wallColor: '#ffffff',
    metalness: 0.05,
    roughness: 0.9,
    env: 0.03,
    emissiveIntensity: 2.2,
    fog: '#0e0d0c',
    hemi: ['#fff1d6', '#1d1b18', 1.0],
    rib: { color: '#5a5752', depth: 0.5, width: 1.4, metalness: 0.05, roughness: 0.9, strip: null, perSegment: 1 },
  },
  {
    name: 'Catacomb',
    headlight: 40,
    wall: catacombWall,
    wallColor: '#ffffff',
    metalness: 0.0,
    roughness: 0.85,
    env: 0.03,
    emissiveIntensity: 1.0,
    fog: '#2c261e',
    hemi: ['#fff4e0', '#3a3126', 1.25],
    rib: { color: '#8c7f69', depth: 0.55, width: 1.7, metalness: 0.0, roughness: 0.8, strip: '#fff6e2', stripIntensity: 2.6, perSegment: 1 },
  },
];

export function buildThemeTextures(theme) {
  const [c, e] = theme.wall();
  return { map: toTexture(c), emissiveMap: toTexture(e) };
}

export function themeColors(theme) {
  return {
    fog: new Color(theme.fog),
    sky: new Color(theme.hemi[0]),
    ground: new Color(theme.hemi[1]),
    intensity: theme.hemi[2],
    headlight: theme.headlight,
  };
}
