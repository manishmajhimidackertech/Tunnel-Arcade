// "Curved world" trick: collision happens in a straight tunnel, but every world material
// bends vertices sideways in view space by bend * depth^2, so the tunnel appears to snake
// and twist ahead of the ship while staying trivial to simulate.
import { Vector2 } from 'three';

export const bendUniform = { value: new Vector2() };

const PROJECT_WITH_BEND = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
float bendDepth = max( -mvPosition.z, 0.0 );
mvPosition.xy += uBend * bendDepth * bendDepth;
gl_Position = projectionMatrix * mvPosition;
`;

// Sprites build mvPosition by hand instead of using the project_vertex chunk.
const SPRITE_PROJECT = 'gl_Position = projectionMatrix * mvPosition;';
const SPRITE_PROJECT_WITH_BEND = /* glsl */ `
float bendDepth = max( -mvPosition.z, 0.0 );
mvPosition.xy += uBend * bendDepth * bendDepth;
gl_Position = projectionMatrix * mvPosition;
`;

export function withBend(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bendUniform;
    const src = shader.vertexShader.includes('#include <project_vertex>')
      ? shader.vertexShader.replace('#include <project_vertex>', PROJECT_WITH_BEND)
      : shader.vertexShader.replace(SPRITE_PROJECT, SPRITE_PROJECT_WITH_BEND);
    shader.vertexShader = 'uniform vec2 uBend;\n' + src;
  };
  material.customProgramCacheKey = () => 'bend';
  return material;
}

// Smooth pseudo-random curvature driven by distance travelled.
export function bendAt(distance, strength, out) {
  const s = distance;
  out.set(
    Math.sin(s * 0.0021 + 1.3) * 0.62 + Math.sin(s * 0.0053) * 0.38,
    Math.sin(s * 0.0017 + 4.1) * 0.55 + Math.sin(s * 0.0041 + 0.7) * 0.45,
  );
  return out.multiplyScalar(0.00042 * strength);
}

// Slow roll of the whole tunnel around its axis (gives the spiral feel of the original).
export function rollAt(distance, strength) {
  return (Math.sin(distance * 0.0013) * 0.9 + Math.sin(distance * 0.0031 + 2) * 0.45) * strength;
}
