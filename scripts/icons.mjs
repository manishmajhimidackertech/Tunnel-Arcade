// Generates every app icon: the SVG artwork (public/icons/icon.svg and the simplified
// public/favicon.svg) and all PNG/ICO sizes rendered from it. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TAU = Math.PI * 2;
const SIDES = 12;
const n = (v) => +v.toFixed(1);
const pts = (list) => list.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

// Dodecagon with a flat top, bottom, left and right, like the in-game tunnel.
function polygon(cx, cy, r) {
  return Array.from({ length: SIDES }, (_, i) => {
    const a = Math.PI / 12 + (i * TAU) / SIDES;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join('');
};

// Superellipse "squircle" outline for the rounded app tile.
function squircle(size, k = 5) {
  const h = size / 2;
  const out = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([h + h * Math.sign(c) * Math.abs(c) ** (2 / k), h + h * Math.sign(s) * Math.abs(s) ** (2 / k)]);
  }
  return `M${pts(out).replaceAll(' ', 'L')}Z`;
}

// ---------------------------------------------------------------------------
// Full-bleed 512x512 artwork: looking down the curving tunnel behind the ship.
// ---------------------------------------------------------------------------

const VP = [264, 226]; // where the tunnel vanishes (it curves up and slightly right)
const NEAR = [256, 262]; // centre of the tunnel mouth
const RINGS = Array.from({ length: 11 }, (_, k) => 430 / (1 + k * 0.8));

function ringCentre(r) {
  const t = (1 - r / RINGS[0]) ** 1.6;
  return [lerp(NEAR[0], VP[0], t), lerp(NEAR[1], VP[1], t)];
}

const rings = RINGS.map((r) => polygon(...ringCentre(r), r));
// 0 at the tunnel mouth, 1 at the far end: used for fog.
const depth = (k) => k / (RINGS.length - 1);

// A point on panel (segment k, facet i): t runs into the tunnel, u across the facet.
function onPanel(k, i, t, u) {
  const j = (i + 1) % SIDES;
  const edge = (ring) => [lerp(ring[i][0], ring[j][0], u), lerp(ring[i][1], ring[j][1], u)];
  const [a, b] = [edge(rings[k]), edge(rings[k + 1])];
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}
const panelQuad = (k, i, t0, t1, u0, u1) => [onPanel(k, i, t0, u0), onPanel(k, i, t0, u1), onPanel(k, i, t1, u1), onPanel(k, i, t1, u0)];
// Keeps small details away from the edges, where the tile's rounded corners would cut them.
const inside = (quad) => quad.every(([x, y]) => Math.hypot(x - 256, y - 256) < 250);

function tunnel() {
  const out = [];
  // Wall panels, shaded per facet (the floor catches the engine light) and fogged with depth.
  for (let k = 0; k < RINGS.length - 1; k++) {
    const fog = Math.min(1, depth(k) * 1.25);
    for (let i = 0; i < SIDES; i++) {
      const mid = Math.PI / 6 + (i * TAU) / SIDES; // facet direction, 90deg = floor
      const lit = 0.5 + 0.5 * Math.sin(mid); // 1 on the floor, 0 on the ceiling
      const base = mix('#1b232c', '#34404c', lit * 0.8 + (k % 2) * 0.12);
      out.push(`<polygon points="${pts(panelQuad(k, i, 0, 1, 0, 1))}" fill="${mix(base, '#0a1826', fog)}"/>`);
      // Bevelled inset plate on the nearer panels, as on the in-game wall textures.
      if (k < 3) {
        const plate = panelQuad(k, i, 0.14, 0.86, 0.1, 0.9);
        out.push(`<polygon points="${pts(plate)}" fill="${mix(base, '#070b10', 0.3 + fog)}" stroke="#8fb6d6" stroke-opacity="${n(0.16 - k * 0.04)}" stroke-width="${n(3 - k)}" stroke-linejoin="round"/>`);
      }
    }
  }
  // Panel lights: a glowing dash in the middle of every panel.
  const dashes = [];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < SIDES; i++) {
      const quad = panelQuad(k, i, 0.3, 0.7, 0.44, 0.56);
      if (inside(quad)) dashes.push(`<polygon points="${pts(quad)}" opacity="${n(0.95 - k * 0.2)}"/>`);
    }
  }
  out.push(`<g fill="#bff4ff" filter="url(#glow)">${dashes.join('')}</g>`);
  // Ribs between segments: a dark band with a cyan light strip on its leading edge.
  for (let k = 1; k < RINGS.length; k++) {
    const fade = 1 - depth(k);
    const w = RINGS[k] / 40;
    out.push(
      `<polygon points="${pts(rings[k])}" fill="none" stroke="#070b10" stroke-opacity="${n(0.7 * fade + 0.2)}" stroke-width="${n(w * 2.2)}" stroke-linejoin="round"/>`,
      `<polygon points="${pts(polygon(...ringCentre(RINGS[k]), RINGS[k] * 1.02))}" fill="none" stroke="#5fd8ff" stroke-opacity="${n(0.25 + 0.65 * fade)}" stroke-width="${n(Math.max(0.8, w * 0.7))}" stroke-linejoin="round"/>`,
    );
  }
  // Seams where the facets meet: light strips running into the distance.
  const seams = [];
  for (let i = 0; i < SIDES; i++) seams.push(`<polyline points="${pts(rings.map((r) => r[i]))}"/>`);
  out.push(`<g fill="none" stroke="url(#seam)" stroke-width="3" stroke-linejoin="round" filter="url(#glow)">${seams.join('')}</g>`);
  return out.join('\n    ');
}

// The chrome door frame that the ship is about to fly through.
function frame() {
  const r = RINGS[2] * 0.93;
  const c = ringCentre(r);
  return [
    `<polygon points="${pts(polygon(...c, r))}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="30" stroke-linejoin="round" filter="url(#soft)"/>`,
    `<polygon points="${pts(polygon(...c, r))}" fill="none" stroke="url(#chrome)" stroke-width="17" stroke-linejoin="round"/>`,
    `<polygon points="${pts(polygon(...c, r + 8))}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<polygon points="${pts(polygon(...c, r - 8))}" fill="none" stroke="#1b2a38" stroke-opacity="0.8" stroke-width="1.6" stroke-linejoin="round"/>`,
  ].join('\n    ');
}

// The red-and-white ship seen from behind and slightly above, banking into the curve.
function ship() {
  const wing = (s) => `
      <path d="M${-20 * s} -3 L${-97 * s} 11 L${-100 * s} 25 L${-22 * s} 24 Z" fill="url(#wing)" stroke="#5c0a18" stroke-width="2" stroke-linejoin="round"/>
      <path d="M${-20 * s} -3 L${-97 * s} 11 L${-98 * s} 15.5 L${-21 * s} 3 Z" fill="#ff7486" opacity="0.75"/>
      <path d="M${-22 * s} 24 L${-100 * s} 25 L${-100 * s} 29.5 L${-23 * s} 29 Z" fill="#6e0c1d"/>
      <rect x="${-99 * s - 7}" y="2" width="14" height="36" rx="7" fill="url(#pod)" stroke="#6b7682" stroke-width="1.5"/>
      <path d="M${-99 * s - 7} 9 a7 7 0 0 1 14 0 v2 h-14 Z" fill="#d4203a"/>
      <ellipse cx="${-99 * s}" cy="33" rx="5" ry="3.5" fill="#c9d2dc"/>`;
  return `
    <ellipse cx="256" cy="440" rx="200" ry="70" fill="url(#pool)"/>
    <g transform="translate(256 350) rotate(4) scale(1.3)">
      <ellipse cx="0" cy="22" rx="150" ry="11" fill="url(#streak)"/>
      <g filter="url(#shadow)">${wing(1)}${wing(-1)}
        <ellipse cx="0" cy="-19" rx="16" ry="10" fill="url(#glass)" stroke="#07182a" stroke-width="1.5"/>
        <path d="M-9 -21 q8 -7 17 -2" fill="none" stroke="#bfe8ff" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>
        <circle cx="0" cy="8" r="31" fill="url(#hull)" stroke="#8c98a5" stroke-width="1.5"/>
        <circle cx="0" cy="10" r="25.5" fill="none" stroke="#d4203a" stroke-width="6"/>
        <circle cx="0" cy="10" r="25.5" fill="none" stroke="#ff8a98" stroke-width="1.2" stroke-dasharray="30 200" stroke-dashoffset="-128" opacity="0.8"/>
        <path d="M-6 -26 L-2.5 -50 Q0 -54 2.5 -50 L6 -26 Z" fill="url(#fin)" stroke="#5c0a18" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="0" cy="12" r="17" fill="#15191e" stroke="#4a535d" stroke-width="2"/>
      </g>
      <circle cx="0" cy="12" r="13" fill="url(#engine)"/>
      <circle cx="0" cy="12" r="46" fill="url(#engineGlow)"/>
      <path d="M0 -4 L1.8 10.2 L17 12 L1.8 13.8 L0 28 L-1.8 13.8 L-17 12 L-1.8 10.2 Z" fill="#ffffff" opacity="0.85"/>
    </g>`;
}

const DEFS = `
    <radialGradient id="bg" cx="${VP[0] / 512}" cy="${VP[1] / 512}" r="0.75"><stop offset="0" stop-color="#123049"/><stop offset="1" stop-color="#02070d"/></radialGradient>
    <radialGradient id="core" cx="${VP[0]}" cy="${VP[1]}" r="96" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="0.12" stop-color="#ffffff"/><stop offset="0.3" stop-color="#aef2ff" stop-opacity="0.9"/><stop offset="0.6" stop-color="#2f8fe0" stop-opacity="0.35"/><stop offset="1" stop-color="#1b6fb8" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.47" r="0.72"><stop offset="0.55" stop-color="#02070d" stop-opacity="0"/><stop offset="1" stop-color="#02070d" stop-opacity="0.75"/></radialGradient>
    <linearGradient id="seam" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7fe8ff"/><stop offset="1" stop-color="#3aa6ff"/></linearGradient>
    <linearGradient id="chrome" x1="0" y1="80" x2="0" y2="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="0.42" stop-color="#cfe7f7"/><stop offset="0.5" stop-color="#6c8ea6"/><stop offset="0.56" stop-color="#b6d3e8"/><stop offset="1" stop-color="#eef7ff"/></linearGradient>
    <linearGradient id="wing" x1="0" y1="-6" x2="0" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f03a52"/><stop offset="1" stop-color="#a8142b"/></linearGradient>
    <linearGradient id="fin" x1="-5" y1="0" x2="5" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff5a6e"/><stop offset="1" stop-color="#b3172f"/></linearGradient>
    <linearGradient id="pod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#e9eef3"/><stop offset="1" stop-color="#96a2ae"/></linearGradient>
    <radialGradient id="hull" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#e6ebf0"/><stop offset="1" stop-color="#8e9aa7"/></radialGradient>
    <radialGradient id="glass" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#2f7fc4"/><stop offset="1" stop-color="#0b2a4a"/></radialGradient>
    <radialGradient id="engine"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#e4f7ff"/><stop offset="1" stop-color="#6cc6ff"/></radialGradient>
    <radialGradient id="engineGlow"><stop offset="0" stop-color="#e8f8ff" stop-opacity="0.95"/><stop offset="0.3" stop-color="#5ab4ff" stop-opacity="0.5"/><stop offset="1" stop-color="#3a9dff" stop-opacity="0"/></radialGradient>
    <radialGradient id="streak"><stop offset="0" stop-color="#e8f8ff" stop-opacity="0.9"/><stop offset="0.4" stop-color="#5ab4ff" stop-opacity="0.35"/><stop offset="1" stop-color="#3a9dff" stop-opacity="0"/></radialGradient>
    <radialGradient id="flare"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.35" stop-color="#9ff0ff" stop-opacity="0.35"/><stop offset="1" stop-color="#5fd8ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="pool"><stop offset="0" stop-color="#5ab4ff" stop-opacity="0.5"/><stop offset="1" stop-color="#5ab4ff" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="6" result="s"/><feFlood flood-color="#000" flood-opacity="0.6"/><feComposite in2="s" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

function artwork() {
  return `
    <rect width="512" height="512" fill="url(#bg)"/>
    ${tunnel()}
    <circle cx="${VP[0]}" cy="${VP[1]}" r="96" fill="url(#core)"/>
    <circle cx="${VP[0]}" cy="${VP[1]}" r="22" fill="#ffffff" filter="url(#bloom)"/>
    <ellipse cx="${VP[0]}" cy="${VP[1]}" rx="210" ry="2.5" fill="url(#flare)"/>
    ${frame()}
    <rect width="512" height="512" fill="url(#vignette)"/>
    ${ship()}`;
}

// Rounded app tile ("any" purpose): artwork clipped to a squircle with a fine rim.
function tileSvg() {
  const shape = squircle(512);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>${DEFS}
    <clipPath id="tile"><path d="${shape}"/></clipPath>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8ff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#bfe8ff" stop-opacity="0.1"/><stop offset="1" stop-color="#bfe8ff" stop-opacity="0.3"/></linearGradient>
  </defs>
  <g clip-path="url(#tile)">${artwork()}
    <path d="${shape}" fill="none" stroke="url(#rim)" stroke-width="5"/>
  </g>
</svg>
`;
}

// Full-bleed square (maskable and Apple touch icons): the platform applies its own mask.
function bleedSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>${DEFS}
  </defs>${artwork()}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Favicon: the same idea redrawn with a few bold shapes so it reads at 16px.
// ---------------------------------------------------------------------------

function faviconSvg() {
  const ring = (r, attrs) => `<polygon points="${pts(polygon(32, 30, r))}" fill="none" stroke-linejoin="round" ${attrs}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.47" r="0.7"><stop offset="0" stop-color="#16395a"/><stop offset="1" stop-color="#02070d"/></radialGradient>
    <radialGradient id="core"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#ffffff"/><stop offset="0.7" stop-color="#7fe8ff" stop-opacity="0.8"/><stop offset="1" stop-color="#3aa6ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="chrome" x1="0" y1="14" x2="0" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#cfe7f7"/><stop offset="0.52" stop-color="#7d9db4"/><stop offset="1" stop-color="#e6f3fd"/></linearGradient>
  </defs>
  <path d="${squircle(64)}" fill="url(#bg)"/>
  ${ring(27, 'stroke="#5fd8ff" stroke-width="3.5"')}
  ${ring(15.5, 'stroke="url(#chrome)" stroke-width="5.5"')}
  <circle cx="32" cy="30" r="9" fill="url(#core)"/>
  <g transform="translate(32 46)">
    <path d="M-5 -4 L-23 0 L-23 6 L-5 5 Z M5 -4 L23 0 L23 6 L5 5 Z" fill="#e8243f" stroke="#4a0813" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="0" cy="0.5" r="7.5" fill="#f2f5f8" stroke="#4a0813" stroke-width="1"/>
    <circle cx="0" cy="1" r="4" fill="#9ff0ff"/>
    <circle cx="0" cy="1" r="2.2" fill="#ffffff"/>
  </g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const render = (svg, size, opaque = false) => {
  let img = sharp(Buffer.from(svg), { density: (72 * size) / 512 }).resize(size, size);
  if (opaque) img = img.flatten({ background: '#02070d' });
  return img.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toBuffer();
};

const renderFavicon = (svg, size) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// ICO container with PNG-compressed entries (supported everywhere since Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size % 256, e); // 0 means 256
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((im) => im.data)]);
}

function write(path, data) {
  const full = join(PUBLIC, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  console.log(`  ${path} (${(data.length / 1024).toFixed(1)} kB)`);
}

const tile = tileSvg();
const bleed = bleedSvg();
const fav = faviconSvg();

console.log('Writing icons to public/:');
write('icons/icon.svg', tile);
write('favicon.svg', fav);
write('icons/icon-192.png', await render(tile, 192));
write('icons/icon-512.png', await render(tile, 512));
write('icons/maskable-192.png', await render(bleed, 192, true));
write('icons/maskable-512.png', await render(bleed, 512, true));
write('icons/apple-touch-icon.png', await render(bleed, 180, true));
const favs = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await renderFavicon(fav, size) })));
write('favicon.ico', ico(favs));
