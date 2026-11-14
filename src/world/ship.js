// The little red-and-white spaceship, built from primitives. Nose points down -Z.
import { circle, cylinder, extrude, lathe, sphere, torus } from '../gl/geometry.js';
import { Mesh, Node, PointLight, Sprite, basicMaterial, standardMaterial } from '../gl/scene.js';
import { radialGlowTexture, streakTexture } from './textures.js';

function wingGeometry() {
  const outline = [[0.18, -0.18], [0.98, 0.22], [1.0, 0.46], [0.18, 0.48]];
  const g = extrude(outline, [], 0.08).translate(0, 0, -0.015);
  g.rotateX(Math.PI / 2); // shape Y becomes +Z (backwards)
  g.translate(0, 0.02, 0);
  g.groups = null;
  return g;
}

function finGeometry() {
  // x runs backwards along the body, y is height; the leading edge sweeps back.
  const g = extrude([[0, 0], [0.55, 0], [0.55, 0.42], [0.38, 0.42]], [], 0.04);
  g.rotateY(-Math.PI / 2); // shape x -> +Z, extrusion -> -X
  g.translate(0.02, 0.2, 0.05);
  g.groups = null;
  return g;
}

export class Ship {
  constructor() {
    this.group = new Node(); // positioned by the game
    this.model = new Node(); // banks and pitches inside the group
    this.group.add(this.model);

    const white = standardMaterial({ color: '#f2f4f7', metalness: 0.35, roughness: 0.3 });
    const red = standardMaterial({ color: '#d4203a', metalness: 0.4, roughness: 0.35 });
    const dark = standardMaterial({ color: '#2a2f36', metalness: 0.8, roughness: 0.3 });
    const glass = standardMaterial({
      color: '#0b2a4a',
      metalness: 0.9,
      roughness: 0.1,
      emissive: '#1d6fb8',
      emissiveIntensity: 0.35,
    });

    const profile = [
      [0.0, 1.0], [0.07, 0.92], [0.16, 0.74], [0.24, 0.48], [0.29, 0.2],
      [0.3, -0.1], [0.27, -0.38], [0.21, -0.56], [0.17, -0.62],
    ];
    const body = new Mesh(lathe(profile, 20).rotateX(-Math.PI / 2), white);
    this.model.add(body);

    const nose = new Mesh(lathe(profile.slice(0, 4), 20).rotateX(-Math.PI / 2), red);
    nose.scale.setScalar(1.015);
    this.model.add(nose);

    const band = new Mesh(torus(0.285, 0.035, 8, 24), red);
    band.position.z = 0.28;
    this.model.add(band);

    const canopy = new Mesh(sphere(0.15, 16, 12), glass);
    canopy.scale.set(1, 0.75, 2.1);
    canopy.position.set(0, 0.19, -0.22);
    this.model.add(canopy);

    const wing = wingGeometry();
    for (const side of [1, -1]) {
      const w = new Mesh(wing, red);
      w.scale.x = side;
      w.rotation.z = side * 0.08;
      this.model.add(w);
      const pod = new Mesh(cylinder(0.06, 0.07, 0.62, 10), white);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 1.0, 0.1, 0.24);
      this.model.add(pod);
      const podTip = new Mesh(sphere(0.065, 10, 8), red);
      podTip.position.set(side * 1.0, 0.1, -0.08);
      this.model.add(podTip);
    }

    const fin = new Mesh(finGeometry(), red);
    fin.position.z = 0.0;
    this.model.add(fin);

    const nozzle = new Mesh(cylinder(0.2, 0.25, 0.22, 20, 1, true), dark);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0.7;
    this.model.add(nozzle);

    const core = new Mesh(circle(0.2, 24), basicMaterial({ color: '#d8f3ff' }));
    core.position.z = 0.72;
    this.model.add(core);

    this.glow = new Sprite(
      basicMaterial({ map: radialGlowTexture('rgba(255,255,255,1)', 'rgba(70,160,255,0.55)'), additive: true }),
    );
    this.glow.position.z = 0.85;
    this.glow.scale.setScalar(1.7);
    this.model.add(this.glow);

    this.streak = new Sprite(basicMaterial({ map: streakTexture(), additive: true, opacity: 0.8 }));
    this.streak.position.z = 0.9;
    this.streak.scale.set(4.2, 0.32, 1);
    this.model.add(this.streak);

    this.light = new PointLight('#5ab4ff', 18, 14, 1.6);
    this.light.position.z = 1.2;
    this.model.add(this.light);

    this.time = 0;
  }

  // vx/vy are the ship's lateral velocity; used for banking.
  animate(dt, vx, vy, boost = 1) {
    this.time += dt;
    const bank = -vx * 0.06;
    const pitch = vy * 0.04;
    const k = 1 - Math.exp(-dt * 6);
    this.model.rotation.z += (bank - this.model.rotation.z) * k;
    this.model.rotation.x += (pitch - this.model.rotation.x) * k;
    this.model.rotation.y += (-vx * 0.03 - this.model.rotation.y) * k;
    this.model.position.y = Math.sin(this.time * 3.1) * 0.035;
    const flicker = 0.92 + Math.sin(this.time * 47) * 0.05 + Math.sin(this.time * 31) * 0.04;
    this.glow.scale.setScalar(1.7 * flicker * boost);
    this.streak.scale.set(4.2 * (0.9 + flicker * 0.1) * boost, 0.32, 1);
    this.light.intensity = 18 * flicker;
  }
}
