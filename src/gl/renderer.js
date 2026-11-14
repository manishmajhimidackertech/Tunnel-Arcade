// Draws a scene graph with raw WebGL 2: compiles the shader variants materials ask for,
// uploads geometry and textures on first use, and sorts glowing things to the end.
import { mat4, multiply, normalMatrix } from './math.js';
import { PointLight, Points, Sprite, BACK, DOUBLE } from './scene.js';
import { shaderSource } from './shaders.js';

const MAX_LIGHTS = 2;

export class Renderer {
  constructor(canvas, { antialias = true } = {}) {
    const gl = canvas.getContext('webgl2', { antialias, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.gl = gl;
    this.canvas = canvas;
    this.pixelRatio = 1;
    this.width = canvas.clientWidth || 1;
    this.height = canvas.clientHeight || 1;
    this.frame = 0;
    this.generation = 0; // bumped when the GPU context is lost, so everything is uploaded again
    this.opaque = [];
    this.glowing = [];
    this.lights = [];
    this.modelView = mat4();
    this.normal = new Float32Array(9);
    this.lightData = { pos: new Float32Array(MAX_LIGHTS * 3), color: new Float32Array(MAX_LIGHTS * 3), range: new Float32Array(MAX_LIGHTS * 2) };
    this.reset();
    // Browsers drop the context when the GPU is under pressure (common on phones in the
    // background); allow it to come back and rebuild programs, buffers and textures.
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => this.reset());
  }

  reset() {
    const gl = this.gl;
    this.generation++;
    this.programs = new Map();
    this.vaos = new WeakMap();
    this.anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
  }

  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    this.setSize(this.width, this.height);
  }

  // Size in CSS pixels; the drawing buffer is scaled by the pixel ratio.
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.pixelRatio);
    this.canvas.height = Math.floor(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  program(kind, flags) {
    const key = `${kind}:${flags.join()}`;
    let program = this.programs.get(key);
    if (program) return program;
    const gl = this.gl;
    const [vertex, fragment] = shaderSource(kind, flags);
    const handle = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader ${key}: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(handle, shader);
    }
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(`Program ${key}: ${gl.getProgramInfoLog(handle)}`);
    const uniforms = {};
    const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(handle, i).name.replace('[0]', '');
      uniforms[name] = gl.getUniformLocation(handle, name);
    }
    program = { handle, uniforms, frame: -1, material: null, generation: this.generation };
    this.programs.set(key, program);
    return program;
  }

  programFor(node, material) {
    if (material.program?.generation === this.generation) return material.program;
    const flags = [];
    if (material.map) flags.push('MAP');
    let kind = node instanceof Sprite ? 'sprite' : node instanceof Points ? 'points' : 'basic';
    if (material.type === 'standard') {
      kind = 'standard';
      if (material.emissiveMap) flags.push('EMISSIVE_MAP');
      if (material.bumpScale > 0) flags.push('BUMP');
      if (material.flatShading) flags.push('FLAT');
      if (material.side === DOUBLE) flags.push('DOUBLE_SIDED');
      if (material.side === BACK) flags.push('BACK_SIDE');
    }
    return (material.program = this.program(kind, flags));
  }

  vao(geometry) {
    const gl = this.gl;
    let entry = this.vaos.get(geometry);
    if (!entry) {
      entry = { handle: gl.createVertexArray(), buffers: {} };
      gl.bindVertexArray(entry.handle);
      const usage = geometry.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
      [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]].forEach(([name, size], location) => {
        if (!geometry[name]) return;
        entry.buffers[name] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffers[name]);
        gl.bufferData(gl.ARRAY_BUFFER, geometry[name], usage);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      });
      if (geometry.index) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.index, gl.STATIC_DRAW);
      }
      this.vaos.set(geometry, entry);
    } else {
      gl.bindVertexArray(entry.handle);
    }
    if (geometry.needsUpdate) {
      geometry.needsUpdate = false;
      for (const name of ['position', 'color']) {
        if (!entry.buffers[name]) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffers[name]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry[name]);
      }
    }
  }

  bindTexture(unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (texture.handle && texture.generation === this.generation) {
      gl.bindTexture(gl.TEXTURE_2D, texture.handle);
      return;
    }
    texture.generation = this.generation;
    texture.handle = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture.handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, texture.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.generateMipmap(gl.TEXTURE_2D);
    const wrap = texture.wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.anisotropy) gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  }

  // scene: { root, fogColor, fogNear, fogFar, hemisphere: { sky, ground, intensity }, bend: [x, y] }
  render(scene, camera) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.frame++;
    this.scene = scene;
    this.camera = camera;
    this.opaque.length = 0;
    this.glowing.length = 0;
    this.lights.length = 0;
    scene.root.walk(null, (node) => {
      if (node instanceof PointLight) this.lights.push(node);
      else if (node.geometry && node.material) this.queue(node);
    });
    this.glowing.sort((a, b) => a.node.renderOrder - b.node.renderOrder || a.depth - b.depth);

    const view = camera.view;
    const { pos, color, range } = this.lightData;
    color.fill(0);
    range.fill(1);
    this.lights.slice(0, MAX_LIGHTS).forEach((light, i) => {
      const w = light.world;
      pos[i * 3] = view[0] * w[12] + view[4] * w[13] + view[8] * w[14] + view[12];
      pos[i * 3 + 1] = view[1] * w[12] + view[5] * w[13] + view[9] * w[14] + view[13];
      pos[i * 3 + 2] = view[2] * w[12] + view[6] * w[13] + view[10] * w[14] + view[14];
      color[i * 3] = light.color.r * light.intensity;
      color[i * 3 + 1] = light.color.g * light.intensity;
      color[i * 3 + 2] = light.color.b * light.intensity;
      range[i * 2] = light.distance;
      range[i * 2 + 1] = light.decay;
    });
    this.fog = scene.fogColor.toSrgb(this.fog);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.fog[0], this.fog[1], this.fog[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    for (const item of this.opaque) this.draw(item);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    for (const item of this.glowing) this.draw(item);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  queue(node) {
    const view = this.camera.view;
    const w = node.world;
    const depth = view[2] * w[12] + view[6] * w[13] + view[10] * w[14] + view[14]; // more negative = further
    const groups = node.geometry.groups;
    if (Array.isArray(node.material)) {
      for (const g of groups) this.opaque.push({ node, material: node.material[g.material], start: g.start, count: g.count, depth });
      return;
    }
    const material = node.material;
    const glowing = material.additive || material.opacity < 1 || node instanceof Sprite;
    (glowing ? this.glowing : this.opaque).push({ node, material, start: 0, count: -1, depth });
  }

  draw({ node, material, start, count }) {
    const gl = this.gl;
    const { scene, camera } = this;
    const geometry = node.geometry;
    const program = this.programFor(node, material);
    const u = program.uniforms;
    gl.useProgram(program.handle);

    if (program.frame !== this.frame) {
      // once per frame per shader: camera, fog and lights
      program.frame = this.frame;
      program.material = null;
      gl.uniformMatrix4fv(u.uProjection, false, camera.projection);
      gl.uniform3fv(u.uFogColor, this.fog);
      gl.uniform2f(u.uFogRange, scene.fogNear, scene.fogFar);
      if (u.uLightPos) {
        const { sky, ground, intensity } = scene.hemisphere;
        const v = camera.view;
        gl.uniform3fv(u.uLightPos, this.lightData.pos);
        gl.uniform3fv(u.uLightColor, this.lightData.color);
        gl.uniform2fv(u.uLightRange, this.lightData.range);
        gl.uniform3f(u.uHemiSky, sky.r * intensity, sky.g * intensity, sky.b * intensity);
        gl.uniform3f(u.uHemiGround, ground.r * intensity, ground.g * intensity, ground.b * intensity);
        gl.uniform3f(u.uHemiUp, v[4], v[5], v[6]); // world +Y seen from the camera
        gl.uniformMatrix3fv(u.uViewToWorld, false, [v[0], v[4], v[8], v[1], v[5], v[9], v[2], v[6], v[10]]);
      }
    }

    if (program.material !== material) {
      program.material = material;
      const map = material.map;
      gl.uniform3f(u.uColor, material.color.r, material.color.g, material.color.b);
      if (u.uUvTransform) {
        if (map) gl.uniform4f(u.uUvTransform, map.repeat[0], map.repeat[1], map.offset[0], map.offset[1]);
        else gl.uniform4f(u.uUvTransform, 1, 1, 0, 0);
      }
      if (map) {
        this.bindTexture(0, map);
        gl.uniform1i(u.uMap, 0);
      }
      if (material.type === 'standard') {
        const e = material.emissive;
        const k = material.emissiveIntensity;
        gl.uniform3f(u.uEmissive, e.r * k, e.g * k, e.b * k);
        gl.uniform1f(u.uMetalness, material.metalness);
        gl.uniform1f(u.uRoughness, material.roughness);
        gl.uniform1f(u.uEnvIntensity, material.envIntensity);
        if (u.uBumpScale) gl.uniform1f(u.uBumpScale, material.bumpScale);
        if (material.emissiveMap) {
          this.bindTexture(1, material.emissiveMap);
          gl.uniform1i(u.uEmissiveMap, 1);
        }
      }
    }
    // these animate, so they are sent for every draw
    if (u.uOpacity) gl.uniform1f(u.uOpacity, material.opacity);
    if (u.uPointScale) gl.uniform1f(u.uPointScale, material.size * this.pixelRatio * this.height * 0.5);
    if (material.bend) gl.uniform2f(u.uBend, scene.bend[0], scene.bend[1]);
    else gl.uniform2f(u.uBend, 0, 0);

    multiply(this.modelView, camera.view, node.world);
    gl.uniformMatrix4fv(u.uModelView, false, this.modelView);
    let mirrored = false;
    if (u.uNormalMatrix) {
      mirrored = normalMatrix(this.normal, this.modelView) < 0;
      gl.uniformMatrix3fv(u.uNormalMatrix, false, this.normal);
    }

    if (material.side === DOUBLE || node instanceof Sprite) {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(material.side === BACK ? gl.FRONT : gl.BACK);
      gl.frontFace(mirrored ? gl.CW : gl.CCW);
    }
    if (material.depthTest === false) gl.disable(gl.DEPTH_TEST);
    else gl.enable(gl.DEPTH_TEST);
    if (material.additive) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.vao(geometry);
    if (node instanceof Points) gl.drawArrays(gl.POINTS, 0, geometry.vertexCount);
    else gl.drawElements(gl.TRIANGLES, count < 0 ? geometry.index.length : count, gl.UNSIGNED_SHORT, start * 2);
  }
}
