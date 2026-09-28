// Endless tunnel made of recycled segments. Each segment takes the style of the
// stretch of tunnel it currently represents.
import {
  BackSide,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector2,
} from 'three';
import { TUNNEL_RADIUS, TUNNEL_SIDES, SEGMENT_LENGTH, SEGMENT_COUNT, THEME_LENGTH, CAMERA_DISTANCE } from '../config.js';
import { regularPolygon } from '../logic/collision.js';
import { THEMES, buildThemeTextures } from './themes.js';
import { withBend } from './bend.js';

const R = TUNNEL_RADIUS;
const FACE_ROTATION = Math.PI / TUNNEL_SIDES; // puts a flat face on the floor

export function themeIndexAt(s) {
  const i = Math.floor(Math.max(0, s) / THEME_LENGTH) % THEMES.length;
  return i;
}

// Flat polygonal ring hugging the tunnel wall, extruded along the tunnel.
export function polygonRing(outer, inner, width, sides = TUNNEL_SIDES) {
  const toV = ([x, y]) => new Vector2(x, y);
  const shape = new Shape(regularPolygon(0, 0, outer, sides, FACE_ROTATION).map(toV));
  shape.holes.push(new Path(regularPolygon(0, 0, inner, sides, FACE_ROTATION).map(toV)));
  const geo = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  return geo;
}

// Each style gets its own reflection strength, so walls use an explicit envMap
// instead of the scene-wide environment.
function buildThemeAssets(theme, envMap) {
  const { map, emissiveMap } = buildThemeTextures(theme);
  map.repeat.set(TUNNEL_SIDES, SEGMENT_LENGTH / 4);
  emissiveMap.repeat.copy(map.repeat);
  const wall = withBend(
    new MeshStandardMaterial({
      color: theme.wallColor,
      map,
      emissiveMap,
      emissive: '#ffffff',
      emissiveIntensity: theme.emissiveIntensity,
      bumpMap: map,
      bumpScale: 0.5,
      envMap,
      envMapIntensity: theme.env,
      metalness: theme.metalness,
      roughness: theme.roughness,
      side: BackSide,
      flatShading: true,
    }),
  );
  const rib = theme.rib;
  const ribGeometry = polygonRing(R + 0.3, R - rib.depth, rib.width);
  const ribMaterial = withBend(
    new MeshStandardMaterial({
      color: rib.color,
      metalness: rib.metalness,
      roughness: rib.roughness,
      envMap,
      envMapIntensity: theme.env * 1.5,
      flatShading: true,
    }),
  );
  let stripGeometry = null;
  let stripMaterial = null;
  if (rib.strip) {
    const inner = R - rib.depth;
    stripGeometry = polygonRing(inner + 0.02, inner - 0.07, rib.width * 0.42);
    stripMaterial = withBend(
      new MeshStandardMaterial({ color: '#000000', emissive: rib.strip, emissiveIntensity: rib.stripIntensity }),
    );
  }
  return { wall, ribGeometry, ribMaterial, stripGeometry, stripMaterial, perSegment: rib.perSegment };
}

export class Tunnel {
  constructor(root, envMap) {
    this.root = root;
    this.assets = THEMES.map((theme) => buildThemeAssets(theme, envMap));
    // 4 rows of vertices per segment keep the vertex-shader bend smooth.
    this.wallGeometry = new CylinderGeometry(R, R, SEGMENT_LENGTH, TUNNEL_SIDES, 4, true, FACE_ROTATION);
    this.wallGeometry.rotateX(Math.PI / 2);
    this.segments = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) this.segments.push(this.createSegment());
    this.reset(0);
  }

  createSegment() {
    const group = new Group();
    const wall = new Mesh(this.wallGeometry, this.assets[0].wall);
    const ribs = [0, 1].map(() => new Mesh());
    const strips = [0, 1].map(() => new Mesh());
    for (const m of [wall, ...ribs, ...strips]) {
      m.frustumCulled = false; // the bend shader moves vertices outside the bounding sphere
      group.add(m);
    }
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
