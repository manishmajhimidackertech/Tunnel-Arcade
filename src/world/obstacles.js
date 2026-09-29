// Doors, bars and mines: spawning, animation and collision against the ship.
import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNNEL_RADIUS, SHIP_RADIUS, SPAWN_AHEAD, DESPAWN_BEHIND, speedAt, difficultyAt } from '../config.js';
import {
  rotate2,
  regularPolygon,
  circleFitsInHoles,
  distanceToSegment,
  sweptOverlap,
  sweptPointDistance,
} from '../logic/collision.js';
import { DOOR_TEMPLATES, BAR_TEMPLATES, chooseObstacle, obstacleGapTime } from '../logic/patterns.js';
import { findPickupSpot } from '../logic/pickups.js';
import { doorTextures, stripeTexture, radialGlowTexture } from './textures.js';
import { withBend } from './bend.js';
import { polygonRing } from './tunnel.js';

const DOOR_RADIUS = TUNNEL_RADIUS + 0.4;
const DOOR_DEPTH = 0.5;
const MINE_RADIUS = 0.9;
const PICKUP_REACH = SHIP_RADIUS + 0.95; // generous grab radius

const toV = ([x, y]) => new Vector2(x, y);

class Assets {
  constructor() {
    this.doors = {};
    this.bars = {};
    this.frameGeometry = polygonRing(TUNNEL_RADIUS + 0.3, TUNNEL_RADIUS - 0.55, 1.1);
    this.frameMaterial = withBend(new MeshStandardMaterial({ color: '#30353b', metalness: 0.75, roughness: 0.35, flatShading: true }));
    this.frameGlow = withBend(new MeshStandardMaterial({ color: '#000000', emissive: '#ff2b2b', emissiveIntensity: 2.2 }));
    this.frameGlowGeometry = polygonRing(TUNNEL_RADIUS - 0.53, TUNNEL_RADIUS - 0.62, 0.35);
    this.doorSide = withBend(
      new MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1010', emissiveIntensity: 1.6, roughness: 0.4 }),
    );

    const stripes = stripeTexture();
    // a little self-illumination keeps bars readable in the dark styles and in fog
    this.barMaterial = withBend(
      new MeshStandardMaterial({ map: stripes, emissiveMap: stripes, emissive: '#ffffff', emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4 }),
    );
    this.barTipMaterial = withBend(
      new MeshStandardMaterial({ color: '#ff5a3a', emissive: '#ff2a10', emissiveIntensity: 1.8, roughness: 0.3 }),
    );
    this.capGeometry = new SphereGeometry(1, 16, 10);

    const spikes = [];
    const ico = new IcosahedronGeometry(1, 0);
    const pos = ico.getAttribute('position');
    const seen = new Set();
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3().fromBufferAttribute(pos, i).normalize();
      const key = v.toArray().map((n) => n.toFixed(3)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const cone = new ConeGeometry(0.13, 0.5, 6);
      cone.translate(0, 0.78, 0);
      cone.rotateX(Math.PI / 2); // cones point along +Y; lookAt() aims +Z
      cone.lookAt(v);
      spikes.push(cone);
    }
    const body = new IcosahedronGeometry(0.66, 2);
    // polyhedra are already non-indexed; cones aren't, and merging needs them to match
    this.mineGeometry = mergeGeometries([body, ...spikes].map((g) => (g.index ? g.toNonIndexed() : g)));
    this.mineMaterial = withBend(
      new MeshStandardMaterial({ color: '#5b6068', emissive: '#3a0606', metalness: 0.6, roughness: 0.35, flatShading: true }),
    );
    this.mineBandGeometry = new TorusGeometry(0.67, 0.09, 6, 28);
    this.mineBandMaterial = withBend(new MeshStandardMaterial({ color: '#000000', emissive: '#ff2020', emissiveIntensity: 3.5 }));
    // Slow-motion pickup: a glowing gold hourglass inside a spinning cyan ring (gold stands out in every style).
    const bulb = new ConeGeometry(0.42, 0.62, 12);
    bulb.rotateX(Math.PI); // tip down, so two bulbs meet at their tips
    bulb.translate(0, 0.31, 0);
    const lower = bulb.clone();
    lower.rotateX(Math.PI);
    this.hourglassGeometry = mergeGeometries([bulb, lower]);
    this.hourglassMaterial = withBend(
      new MeshStandardMaterial({ color: '#2a1a00', emissive: '#ffc94a', emissiveIntensity: 3, side: DoubleSide }),
    );
    this.pickupRingGeometry = new TorusGeometry(0.78, 0.06, 8, 36);
    this.pickupRingMaterial = withBend(new MeshStandardMaterial({ color: '#000000', emissive: '#5ff4ff', emissiveIntensity: 3 }));
    this.pickupGlowMaterial = withBend(
      new SpriteMaterial({
        map: radialGlowTexture('rgba(255,250,225,1)', 'rgba(255,190,60,0.7)'),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.mineGlowMaterial = withBend(
      new SpriteMaterial({
        map: radialGlowTexture('rgba(255,230,210,1)', 'rgba(255,40,30,0.7)'),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
  }

  door(name) {
    if (this.doors[name]) return this.doors[name];
    const tpl = DOOR_TEMPLATES[name];
    const shape = new Shape(regularPolygon(0, 0, DOOR_RADIUS, 48).map(toV));
    for (const hole of tpl.holes) shape.holes.push(new Path(hole.map(toV)));
    const geometry = new ExtrudeGeometry(shape, { depth: DOOR_DEPTH, bevelEnabled: false, curveSegments: 1 });
    geometry.translate(0, 0, -DOOR_DEPTH / 2);
    const { map, emissiveMap } = doorTextures(tpl.holes, DOOR_RADIUS);
    const cap = withBend(
      new MeshStandardMaterial({ map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 2.6, metalness: 0.3, roughness: 0.55 }),
    );
    return (this.doors[name] = { geometry, materials: [cap, this.doorSide], holes: tpl.holes });
  }

  bar(name) {
    if (this.bars[name]) return this.bars[name];
    const tpl = BAR_TEMPLATES[name];
    const parts = tpl.bars.map((b) => {
      const dx = b.b[0] - b.a[0];
      const dy = b.b[1] - b.a[1];
      const length = Math.hypot(dx, dy);
      const geometry = new CylinderGeometry(b.r, b.r, length, 16, 1, true);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / 2.4));
      return {
        geometry,
        position: [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2],
        angle: Math.atan2(dy, dx) - Math.PI / 2,
        // rounded ends that stop inside the tunnel get a warning light
        tips: [b.a, b.b].filter(([x, y]) => Math.hypot(x, y) < TUNNEL_RADIUS - 0.5),
        r: b.r,
      };
    });
    return (this.bars[name] = { parts, bars: tpl.bars });
  }
}

function noCull(obj) {
  obj.traverse((o) => (o.frustumCulled = false));
  return obj;
}

class Door {
  constructor(assets, spec, s) {
    const a = assets.door(spec.template);
    this.kind = 'door';
    this.s = s;
    this.holes = a.holes;
    this.rotation = spec.rotation;
    this.spin = spec.spin;
    this.group = new Group();
    this.disc = new Mesh(a.geometry, a.materials);
    this.group.add(this.disc);
    const frame = new Mesh(assets.frameGeometry, assets.frameMaterial);
    const glow = new Mesh(assets.frameGlowGeometry, assets.frameGlow);
    glow.position.z = 0.56;
    this.group.add(frame, glow);
    noCull(this.group);
    this.disc.rotation.z = this.rotation;
  }

  update(dt) {
    this.rotation += this.spin * dt;
    this.disc.rotation.z = this.rotation;
  }

  hits(s0, s1, x, y) {
    if (!sweptOverlap(s0, s1, this.s, DOOR_DEPTH / 2 + SHIP_RADIUS * 0.6)) return false;
    const [lx, ly] = rotate2(x, y, -this.rotation);
    return !circleFitsInHoles(lx, ly, SHIP_RADIUS, this.holes);
  }
}

class Bars {
  constructor(assets, spec, s) {
    const a = assets.bar(spec.template);
    this.kind = 'bars';
    this.s = s;
    this.bars = a.bars;
    this.rotation = spec.rotation;
    this.spin = spec.spin;
    this.group = new Group();
    this.pivot = new Group();
    this.group.add(this.pivot);
    for (const part of a.parts) {
      const m = new Mesh(part.geometry, assets.barMaterial);
      m.position.set(part.position[0], part.position[1], 0);
      m.rotation.z = part.angle;
      this.pivot.add(m);
      for (const [x, y] of part.tips) {
        const tip = new Mesh(assets.capGeometry, assets.barTipMaterial);
        tip.scale.setScalar(part.r * 1.02);
        tip.position.set(x, y, 0);
        this.pivot.add(tip);
      }
    }
    noCull(this.group);
    this.pivot.rotation.z = this.rotation;
  }

  update(dt) {
    this.rotation += this.spin * dt;
    this.pivot.rotation.z = this.rotation;
  }

  hits(s0, s1, x, y) {
    const ds = Math.max(s0, Math.min(s1, this.s)) - this.s;
    if (Math.abs(ds) > 1.5) return false;
    const [lx, ly] = rotate2(x, y, -this.rotation);
    for (const b of this.bars) {
      const d = distanceToSegment(lx, ly, b.a[0], b.a[1], b.b[0], b.b[1]);
      const reach = b.r + SHIP_RADIUS;
      if (d * d + ds * ds < reach * reach) return true;
    }
    return false;
  }
}

class Mine {
  constructor(assets, m, s) {
    this.kind = 'mine';
    this.s = s;
    this.baseX = m.x;
    this.baseY = m.y;
    this.drift = m.drift;
    this.angle = 0;
    this.x = m.x;
    this.y = m.y;
    this.group = new Group();
    this.body = new Mesh(assets.mineGeometry, assets.mineMaterial);
    this.band = new Mesh(assets.mineBandGeometry, assets.mineBandMaterial);
    this.glow = new Sprite(assets.mineGlowMaterial);
    this.glow.scale.setScalar(3);
    this.body.add(this.band);
    this.group.add(this.body, this.glow);
    noCull(this.group);
    this.spinAxis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt, time) {
    this.angle += this.drift * dt;
    [this.x, this.y] = rotate2(this.baseX, this.baseY, this.angle);
    this.group.position.x = this.x;
    this.group.position.y = this.y;
    this.body.rotateOnAxis(this.spinAxis, dt * 1.3);
    const pulse = 0.5 + 0.5 * Math.sin(time * 6 + this.phase);
    this.glow.scale.setScalar(2.2 + pulse * 2.2);
  }

  hits(s0, s1, x, y) {
    return sweptPointDistance(x, y, s0, s1, this.x, this.y, this.s) < MINE_RADIUS + SHIP_RADIUS;
  }
}

class Pickup {
  constructor(assets, x, y, s) {
    this.kind = 'pickup';
    this.s = s;
    this.x = x;
    this.y = y;
    this.group = new Group();
    this.group.position.set(x, y, 0);
    this.spinner = new Group();
    this.spinner.add(new Mesh(assets.hourglassGeometry, assets.hourglassMaterial));
    this.ring = new Mesh(assets.pickupRingGeometry, assets.pickupRingMaterial);
    this.glow = new Sprite(assets.pickupGlowMaterial);
    this.glow.scale.setScalar(4);
    this.group.add(this.spinner, this.ring, this.glow);
    this.spinner.scale.setScalar(1.5);
    this.ring.scale.setScalar(1.5);
    noCull(this.group);
  }

  update(dt, time) {
    this.spinner.rotation.y += dt * 2.2;
    this.spinner.rotation.z = Math.sin(time * 1.7) * 0.35;
    this.ring.rotation.x += dt * 1.6;
    this.ring.rotation.y += dt * 1.1;
    this.glow.scale.setScalar(3.8 + Math.sin(time * 5) * 0.6);
  }

  reached(s0, s1, x, y) {
    return sweptPointDistance(x, y, s0, s1, this.x, this.y, this.s) < PICKUP_REACH;
  }
}

export class ObstacleField {
  constructor(root) {
    this.root = root;
    this.assets = new Assets();
    this.items = [];
    this.pickups = [];
    this.nextS = Infinity;
    this.runStart = 0;
    this.untilPickup = Infinity;
    // Set by the game: roll of the tunnel at a given distance (for pickup placement).
    this.rollAt = () => 0;
  }

  clear() {
    for (const item of [...this.items, ...this.pickups]) this.root.remove(item.group);
    this.items = [];
    this.pickups = [];
    this.nextS = Infinity;
  }

  // Start spawning obstacles from `firstS` onward.
  start(firstS, runStart) {
    this.clear();
    this.nextS = firstS;
    this.runStart = runStart;
    this.untilPickup = 4; // the first few obstacles never have a pickup
  }

  // Seconds (in game time) the ship needs to fly from `from` to `to`.
  travelTime(from, to) {
    let t = 0;
    for (let s = from; s < to; s += 2) t += Math.min(2, to - s) / speedAt(s - this.runStart);
    return t;
  }

  // Try to put a slow-motion pickup in front of the obstacle about to spawn. The obstacle is
  // pushed back to make room, and the pickup sits on a line that is safe to fly straight
  // through it. Returns the extra spacing used, or 0 if no safe spot was found.
  placePickup(rng, spec, distance) {
    const speed = speedAt(this.nextS - this.runStart);
    const extra = Math.max(16, speed * 1.1);
    const lead = Math.max(14, speed * 0.9); // time to settle on the line before the obstacle
    const sObstacle = this.nextS + extra;
    const sPickup = sObstacle - lead;
    const rollThere = this.rollAt(sPickup);
    const spot = findPickupSpot(
      rng,
      spec,
      (ds) => this.travelTime(distance, sObstacle + ds),
      (ds) => this.rollAt(sObstacle + ds) - rollThere,
    );
    if (!spot) return 0;
    const pickup = new Pickup(this.assets, spot[0], spot[1], sPickup);
    this.pickups.push(pickup);
    this.root.add(pickup.group);
    return extra;
  }

  stopSpawning() {
    this.nextS = Infinity;
  }

  spawn(spec, s) {
    if (spec.kind === 'mines') {
      for (const m of spec.mines) this.add(new Mine(this.assets, m, s + m.ds));
      return spec.length;
    }
    this.add(spec.kind === 'door' ? new Door(this.assets, spec, s) : new Bars(this.assets, spec, s));
    return 0;
  }

  add(item) {
    item.passed = false;
    this.items.push(item);
    this.root.add(item.group);
  }

  update(dt, time, distance, rng, mode) {
    while (this.nextS < distance + SPAWN_AHEAD) {
      const d = difficultyAt(this.nextS - this.runStart);
      const spec = chooseObstacle(rng, d, mode);
      if (--this.untilPickup <= 0) {
        const extra = this.placePickup(rng, spec, distance);
        this.nextS += extra;
        this.untilPickup = extra ? 5 + Math.floor(rng() * 4) : 1; // no safe spot: try the next one
      }
      const length = this.spawn(spec, this.nextS);
      this.nextS += length + obstacleGapTime(rng, d) * speedAt(this.nextS - this.runStart);
    }
    this.pickups = this.pickups.filter((p) => {
      if (p.s < distance - DESPAWN_BEHIND) {
        this.root.remove(p.group);
        return false;
      }
      p.update(dt, time);
      p.group.position.z = -(p.s - distance);
      return true;
    });
    const passed = [];
    this.items = this.items.filter((item) => {
      if (item.s < distance - DESPAWN_BEHIND) {
        this.root.remove(item.group);
        return false;
      }
      item.update(dt, time);
      item.group.position.z = -(item.s - distance);
      if (!item.passed && item.s < distance) {
        item.passed = true;
        passed.push(item);
      }
      return true;
    });
    return passed;
  }

  // Ship position (x, y) is in the rolled tunnel's local frame.
  collide(s0, s1, x, y) {
    for (const item of this.items) {
      if (item.s < s0 - 3 || item.s > s1 + 3) continue;
      if (item.hits(s0, s1, x, y)) return item;
    }
    return null;
  }

  // Returns true (and removes the pickup) if the ship flew through one this frame.
  collect(s0, s1, x, y) {
    const i = this.pickups.findIndex((p) => p.reached(s0, s1, x, y));
    if (i < 0) return false;
    this.root.remove(this.pickups[i].group);
    this.pickups.splice(i, 1);
    return true;
  }

  // Distance to the nearest obstacle ahead, used for the "incoming" audio cue.
  nextAhead(distance) {
    let best = Infinity;
    for (const item of this.items) if (item.s > distance && item.s < best) best = item.s;
    return best - distance;
  }
}
