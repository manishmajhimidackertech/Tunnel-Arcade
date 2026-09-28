// Crash explosion: additive particle burst plus an expanding shock ring.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
} from 'three';
import { radialGlowTexture } from './textures.js';

const COUNT = 420;

export class Explosion {
  constructor(scene) {
    const geometry = new BufferGeometry();
    this.positions = new Float32Array(COUNT * 3);
    this.colors = new Float32Array(COUNT * 3);
    this.velocities = new Float32Array(COUNT * 3);
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.material = new PointsMaterial({
      size: 0.55,
      map: radialGlowTexture('rgba(255,255,255,1)', 'rgba(255,180,90,0.6)', 64),
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false, // the wreck sits inside whatever we hit; always draw the blast
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.visible = false;
    scene.add(this.points);

    this.ring = new Mesh(
      new RingGeometry(0.8, 1, 48),
      new MeshBasicMaterial({
        color: '#ffd9a0',
        transparent: true,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    scene.add(this.ring);
    this.age = Infinity;
  }

  trigger(position) {
    const palette = [new Color('#ffffff'), new Color('#ffd27a'), new Color('#ff8a3c'), new Color('#ff3b2a'), new Color('#7fd4ff')];
    for (let i = 0; i < COUNT; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 2 + Math.random() ** 2 * 16;
      this.velocities.set([Math.cos(t) * r * speed, u * speed, Math.sin(t) * r * speed - 4], i * 3);
      this.positions.set([position.x, position.y, position.z], i * 3);
      const c = palette[Math.floor(Math.random() * palette.length)];
      this.colors.set([c.r, c.g, c.b], i * 3);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.visible = true;
    this.ring.visible = true;
    this.ring.position.copy(position);
    this.age = 0;
  }

  update(dt) {
    if (this.age === Infinity) return;
    this.age += dt;
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < COUNT * 3; i += 3) {
      this.velocities[i] *= drag;
      this.velocities[i + 1] *= drag;
      this.velocities[i + 2] *= drag;
      this.positions[i] += this.velocities[i] * dt;
      this.positions[i + 1] += this.velocities[i + 1] * dt;
      this.positions[i + 2] += this.velocities[i + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = Math.max(0, 1 - this.age / 1.6);
    this.material.size = 0.55 + this.age * 0.4;
    const ringScale = 1 + this.age * 14;
    this.ring.scale.setScalar(ringScale);
    this.ring.material.opacity = Math.max(0, 0.9 - this.age * 2.2);
    if (this.age > 1.8) this.reset();
  }

  reset() {
    this.age = Infinity;
    this.points.visible = false;
    this.ring.visible = false;
  }
}
