// Endless tunnel made of recycled segments. Each segment takes the style of the
// stretch of tunnel it currently represents.
import { cylinder, extrude } from '../gl/geometry.js';
import { BACK, Mesh, Node, standardMaterial } from '../gl/scene.js';
import { TUNNEL_RADIUS, TUNNEL_SIDES, SEGMENT_LENGTH, SEGMENT_COUNT, THEME_LENGTH, CAMERA_DISTANCE } from '../config.js';
import { regularPolygon } from '../logic/collision.js';
import { THEMES, buildThemeTextures } from './themes.js';

const R = TUNNEL_RADIUS;
const FACE_ROTATION = Math.PI / TUNNEL_SIDES; // puts a flat face on the floor

export function themeIndexAt(s) {
  const i = Math.floor(Math.max(0, s) / THEME_LENGTH) % THEMES.length;
  return i;
}

// Flat polygonal ring hugging the tunnel wall, extruded along the tunnel.
export function polygonRing(outer, inner, width, sides = TUNNEL_SIDES) {
  const polygon = (radius) => regularPolygon(0, 0, radius, sides, FACE_ROTATION);
  const geo = extrude(polygon(outer), [polygon(inner)], width).translate(0, 0, -width / 2);
  geo.groups = null; // one material for the whole ring
  return geo;
}

// Each style has its own reflection strength.
function buildThemeAssets(theme) {
  const { map, emissiveMap } = buildThemeTextures(theme);
  map.repeat = emissiveMap.repeat = [TUNNEL_SIDES, SEGMENT_LENGTH / 4];
  const wall = standardMaterial({
    color: theme.wallColor,
    map,
    emissiveMap,
    emissive: '#ffffff',
    emissiveIntensity: theme.emissiveIntensity,
    bumpScale: 0.5,
    envIntensity: theme.env,
    metalness: theme.metalness,
    roughness: theme.roughness,
    side: BACK,
    flatShading: true,
    bend: true,
  });
  const rib = theme.rib;
  const ribGeometry = polygonRing(R + 0.3, R - rib.depth, rib.width);
  const ribMaterial = standardMaterial({
    color: rib.color,
    metalness: rib.metalness,
    roughness: rib.roughness,
    envIntensity: theme.env * 1.5,
    flatShading: true,
    bend: true,
  });
  let stripGeometry = null;
  let stripMaterial = null;
  if (rib.strip) {
    const inner = R - rib.depth;
    stripGeometry = polygonRing(inner + 0.02, inner - 0.07, rib.width * 0.42);
    stripMaterial = standardMaterial({ color: '#000000', emissive: rib.strip, emissiveIntensity: rib.stripIntensity, bend: true });
  }
  return { wall, ribGeometry, ribMaterial, stripGeometry, stripMaterial, perSegment: rib.perSegment };
}

export class Tunnel {
  constructor(root) {
    this.root = root;
    this.assets = THEMES.map(buildThemeAssets);
    // 4 rows of vertices per segment keep the vertex-shader bend smooth.
    this.wallGeometry = cylinder(R, R, SEGMENT_LENGTH, TUNNEL_SIDES, 4, true, FACE_ROTATION).rotateX(Math.PI / 2);
    this.segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) this.segments.push(this.createSegment());
    this.reset(0);
  }

  createSegment() {
    const group = new Node();
    const wall = new Mesh(this.wallGeometry, this.assets[0].wall);
    const ribs = [0, 1].map(() => new Mesh());
    const strips = [0, 1].map(() => new Mesh());
    group.add(wall, ...ribs, ...strips);
    this.root.add(group);
    return { group, wall, ribs, strips, s0: 0, theme: -1 };
  }

  applyTheme(seg, index) {
    if (seg.theme === index) return;
    seg.theme = index;
    const a = this.assets[index];
    seg.wall.material = a.wall;
    const spacing = SEGMENT_LENGTH / a.perSegment;
    seg.ribs.forEach((rib, i) => {
      rib.visible = i < a.perSegment;
      rib.geometry = a.ribGeometry;
      rib.material = a.ribMaterial;
      rib.position.z = -SEGMENT_LENGTH / 2 + spacing * (i + 0.5);
    });
    seg.strips.forEach((strip, i) => {
      strip.visible = !!a.stripGeometry && i < a.perSegment;
      if (!a.stripGeometry) return;
      strip.geometry = a.stripGeometry;
      strip.material = a.stripMaterial;
      strip.position.z = seg.ribs[i].position.z;
    });
  }

  reset(distance) {
    const first = Math.floor((distance - CAMERA_DISTANCE) / SEGMENT_LENGTH) * SEGMENT_LENGTH - SEGMENT_LENGTH;
    this.segments.forEach((seg, i) => {
      seg.s0 = first + i * SEGMENT_LENGTH;
      seg.theme = -1;
    });
    this.update(distance);
  }

  update(distance) {
    const span = SEGMENT_COUNT * SEGMENT_LENGTH;
    for (const seg of this.segments) {
      while (seg.s0 + SEGMENT_LENGTH < distance - CAMERA_DISTANCE - 4) seg.s0 += span;
      this.applyTheme(seg, themeIndexAt(seg.s0));
      seg.group.position.z = -(seg.s0 + SEGMENT_LENGTH / 2 - distance);
    }
  }
}
