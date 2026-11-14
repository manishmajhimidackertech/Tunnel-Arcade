// A minimal scene graph: nodes with a transform and children, plus the things that can be
// drawn (meshes, camera-facing sprites, point clouds), lights, materials and textures.
import { Color, Vec3, compose, lookAt, mat4, multiply, perspective } from './math.js';
import { Geometry } from './geometry.js';

export class Node {
  constructor() {
    this.position = new Vec3();
    this.rotation = new Vec3(); // Euler angles, applied in X, Y, Z order
    this.scale = new Vec3(1, 1, 1);
    this.spin = null; // { axis, angle }: replaces `rotation` when set
    this.visible = true;
    this.children = [];
    this.local = mat4();
    this.world = mat4();
  }

  add(...nodes) {
    this.children.push(...nodes);
    return this;
  }

  remove(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
  }

  // Calls fn(node) for every visible node after bringing its world matrix up to date.
  walk(parentWorld, fn) {
    if (!this.visible) return;
    compose(this.local, this.position, this.rotation, this.scale, this.spin);
    if (parentWorld) multiply(this.world, parentWorld, this.local);
    else this.world.set(this.local);
    fn(this);
    for (const child of this.children) child.walk(this.world, fn);
  }
}

export class Mesh extends Node {
  // `material` may be a list when the geometry has groups.
  constructor(geometry = null, material = null) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.renderOrder = 0;
  }
}

const QUAD = new Geometry({
  position: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
  uv: [0, 0, 1, 0, 1, 1, 0, 1],
  index: [0, 1, 2, 0, 2, 3],
});

// Textured quad that always faces the camera; its size comes from the node's scale.
export class Sprite extends Mesh {
  constructor(material) {
    super(QUAD, material);
  }
}

// One screen-facing dot per vertex.
export class Points extends Mesh {}

export class PointLight extends Node {
  constructor(color, intensity, distance, decay) {
    super();
    this.color = new Color(color);
    this.intensity = intensity;
    this.distance = distance; // the light fades out completely at this range
    this.decay = decay;
  }
}

export class Camera {
  constructor(fov, near, far) {
    this.fov = fov;
    this.aspect = 1;
    this.near = near;
    this.far = far;
    this.eye = [0, 0, 0];
    this.projection = mat4();
    this.view = mat4();
    this.updateProjection();
  }

  updateProjection() {
    perspective(this.projection, this.fov, this.aspect, this.near, this.far);
  }

  place(x, y, z) {
    this.eye = [x, y, z];
  }

  lookAt(x, y, z) {
    lookAt(this.view, this.eye, [x, y, z]);
  }
}

export const FRONT = 0;
export const BACK = 1;
export const DOUBLE = 2;

const asColor = (c) => (c instanceof Color ? c : new Color(c));

// Lit, physically based surface (metalness / roughness).
export function standardMaterial(options = {}) {
  return {
    type: 'standard',
    map: null,
    emissiveMap: null,
    emissiveIntensity: 1,
    bumpScale: 0, // > 0 uses `map` as a height map as well
    metalness: 0,
    roughness: 1,
    envIntensity: 0.45, // strength of the reflected surroundings
    side: FRONT,
    flatShading: false,
    bend: false, // follow the curved-world bend
    ...options,
    color: asColor(options.color ?? '#ffffff'),
    emissive: asColor(options.emissive ?? '#000000'),
  };
}

// Unlit colour / texture for meshes, sprites and points. `additive` makes it glow.
export function basicMaterial(options = {}) {
  return {
    type: 'basic',
    map: null,
    opacity: 1,
    additive: false,
    side: FRONT,
    depthTest: true,
    bend: false,
    size: 1, // points only: diameter in world units
    ...options,
    color: asColor(options.color ?? '#ffffff'),
  };
}

// Image source for a material; uploaded to the GPU the first time it is drawn.
export class Texture {
  constructor(image, { srgb = true, repeat = true } = {}) {
    this.image = image;
    this.srgb = srgb;
    this.wrap = repeat;
    this.repeat = [1, 1];
    this.offset = [0, 0];
    this.handle = null; // GPU texture, owned by the renderer
    this.generation = 0;
  }
}
