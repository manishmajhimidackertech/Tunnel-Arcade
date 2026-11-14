// GLSL ES 3.00 sources. Every vertex shader applies the "curved world" bend; every
// fragment shader ends with the same tone mapping, sRGB encoding and fog.

const VERTEX_HEAD = /* glsl */ `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
layout(location = 3) in vec3 color;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform vec2 uBend;

// Push vertices sideways by bend * depth^2 so the straight tunnel appears to snake.
vec4 project(vec4 mv) {
  float depth = max(-mv.z, 0.0);
  mv.xy += uBend * depth * depth;
  return mv;
}
`;

const FRAGMENT_HEAD = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uFogColor; // display (sRGB) space
uniform vec2 uFogRange;
out vec4 fragColor;

#define PI 3.141592653589793
#define saturate(x) clamp(x, 0.0, 1.0)

vec3 fitAces(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// ACES filmic tone mapping (Stephen Hill's fit).
vec3 toneMap(vec3 c) {
  const mat3 inputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return saturate(outputMat * fitAces(inputMat * (c / 0.6)));
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Linear scene colour -> what goes on screen.
vec3 present(vec3 linear, float depth) {
  return mix(toSrgb(toneMap(linear)), uFogColor, smoothstep(uFogRange.x, uFogRange.y, depth));
}
`;

const STANDARD_VERTEX = /* glsl */ `
uniform mat3 uNormalMatrix;
uniform vec4 uUvTransform;
out vec3 vViewPos;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vec4 mv = project(uModelView * vec4(position, 1.0));
  vViewPos = mv.xyz;
  vNormal = uNormalMatrix * normal;
  vUv = uv * uUvTransform.xy + uUvTransform.zw;
  gl_Position = uProjection * mv;
}
`;

const STANDARD_FRAGMENT = /* glsl */ `
in vec3 vViewPos;
in vec3 vNormal;
in vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uMetalness;
uniform float uRoughness;
uniform float uEnvIntensity;
uniform float uBumpScale;
uniform sampler2D uMap;
uniform sampler2D uEmissiveMap;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uHemiUp;
uniform vec3 uLightPos[2];
uniform vec3 uLightColor[2];
uniform vec2 uLightRange[2]; // cut-off distance, decay exponent
uniform mat3 uViewToWorld;

// The reflected surroundings: a dim studio with a few bright panels, evaluated analytically.
// 'sharpness' is how tight the lobe being reflected is; low values blur the panels out.
const int PANELS = 5;
const vec3 PANEL_DIR[PANELS] = vec3[](
  vec3(-0.766, 0.557, 0.321), vec3(0.766, 0.557, 0.321), vec3(0.196, 0.971, -0.137),
  vec3(0.0, 0.496, 0.868), vec3(-0.287, 0.479, -0.830));
const vec4 PANEL_LIGHT[PANELS] = vec4[]( // radiance (rgb is grey), sharpness
  vec4(16.0, 16.0, 16.0, 60.0), vec4(16.0, 16.0, 16.0, 60.0), vec4(7.0, 7.0, 7.0, 40.0),
  vec4(12.0, 12.0, 12.0, 60.0), vec4(9.0, 9.0, 9.0, 60.0));

vec3 surroundings(vec3 dir, float sharpness) {
  vec3 c = mix(vec3(0.20, 0.19, 0.18), vec3(0.50, 0.50, 0.52), dir.y * 0.5 + 0.5);
  for (int i = 0; i < PANELS; i++) {
    float k = 1.0 / (1.0 / PANEL_LIGHT[i].w + 1.0 / sharpness);
    c += PANEL_LIGHT[i].rgb * (k / PANEL_LIGHT[i].w) * exp(k * (dot(dir, PANEL_DIR[i]) - 1.0));
  }
  return c;
}

#ifdef BUMP
// Tilt the normal by the slope of the height map (Mikkelsen's derivative bump mapping).
vec3 bumped(vec3 n) {
  vec2 dx = dFdx(vUv);
  vec2 dy = dFdy(vUv);
  float h = texture(uMap, vUv).r;
  vec2 slope = uBumpScale * vec2(texture(uMap, vUv + dx).r - h, texture(uMap, vUv + dy).r - h);
  vec3 sx = normalize(dFdx(vViewPos));
  vec3 sy = normalize(dFdy(vViewPos));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * (gl_FrontFacing ? 1.0 : -1.0);
  return normalize(abs(det) * n - sign(det) * (slope.x * r1 + slope.y * r2));
}
#endif

// GGX specular lobe for one light.
vec3 specular(vec3 l, vec3 v, vec3 n, vec3 f0, float roughness) {
  float alpha = roughness * roughness;
  float a2 = alpha * alpha;
  vec3 h = normalize(l + v);
  float nl = saturate(dot(n, l));
  float nv = saturate(dot(n, v));
  float nh = saturate(dot(n, h));
  float vh = saturate(dot(v, h));
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  float visibility = 0.5 / max(nl * sqrt(a2 + (1.0 - a2) * nv * nv) + nv * sqrt(a2 + (1.0 - a2) * nl * nl), 1e-6);
  float denom = nh * nh * (a2 - 1.0) + 1.0;
  return fresnel * (visibility * a2 / (PI * denom * denom));
}

void main() {
#ifdef FLAT
  vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
#else
  vec3 n = normalize(vNormal);
  #ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) n = -n;
  #endif
  #ifdef BACK_SIDE
  n = -n;
  #endif
#endif
  vec3 smoothNormal = n;
  vec3 v = normalize(-vViewPos);

  vec3 albedo = uColor;
  vec3 emissive = uEmissive;
#ifdef MAP
  albedo *= texture(uMap, vUv).rgb;
#endif
#ifdef EMISSIVE_MAP
  emissive *= texture(uEmissiveMap, vUv).rgb;
#endif
#ifdef BUMP
  n = bumped(n);
#endif

  vec3 diffuseColor = albedo * (1.0 - uMetalness);
  vec3 f0 = mix(vec3(0.04), albedo, uMetalness);
  // widen highlights where the surface curves faster than the pixel grid can show
  vec3 curve = max(abs(dFdx(smoothNormal)), abs(dFdy(smoothNormal)));
  float roughness = min(max(uRoughness, 0.0525) + max(max(curve.x, curve.y), curve.z), 1.0);

  vec3 diffuse = vec3(0.0);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 toLight = uLightPos[i] - vViewPos;
    float dist = length(toLight);
    vec3 l = toLight / dist;
    float fade = saturate(1.0 - pow(dist / uLightRange[i].x, 4.0));
    vec3 irradiance = uLightColor[i] * (fade * fade / max(pow(dist, uLightRange[i].y), 0.01)) * saturate(dot(n, l));
    diffuse += irradiance * diffuseColor / PI;
    spec += irradiance * specular(l, v, n, f0, roughness);
  }

  // sky / ground ambient
  diffuse += mix(uHemiGround, uHemiSky, dot(n, uHemiUp) * 0.5 + 0.5) * diffuseColor / PI;

  // reflections of the surroundings, split into single and multiple scattering
  float nv = saturate(dot(n, v));
  vec4 r = roughness * vec4(-1.0, -0.0275, -0.572, 0.022) + vec4(1.0, 0.0425, 1.04, -0.04);
  float a004 = min(r.x * r.x, exp2(-9.28 * nv)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  vec3 single = f0 * ab.x + ab.y;
  float lost = 1.0 - (ab.x + ab.y);
  vec3 average = f0 + (1.0 - f0) * 0.047619;
  vec3 multi = single * average / (1.0 - lost * average) * lost;
  vec3 scattered = single + multi;
  vec3 reflected = normalize(mix(reflect(-v, n), n, pow(roughness, 4.0)));
  float alpha = roughness * roughness;
  vec3 radiance = surroundings(uViewToWorld * reflected, 0.5 / (alpha * alpha)) * uEnvIntensity;
  vec3 ambient = surroundings(uViewToWorld * n, 2.0) * uEnvIntensity;
  spec += radiance * single + multi * ambient;
  diffuse += diffuseColor * (1.0 - max(max(scattered.r, scattered.g), scattered.b)) * ambient;

  fragColor = vec4(present(diffuse + spec + emissive, -vViewPos.z), 1.0);
}
`;

const BASIC_VERTEX = /* glsl */ `
uniform vec4 uUvTransform;
out vec2 vUv;
out float vDepth;

void main() {
  vec4 mv = project(uModelView * vec4(position, 1.0));
  vUv = uv * uUvTransform.xy + uUvTransform.zw;
  vDepth = -mv.z;
  gl_Position = uProjection * mv;
}
`;

// Camera-facing quad centred on the node's origin and sized by its scale.
const SPRITE_VERTEX = /* glsl */ `
uniform vec4 uUvTransform;
out vec2 vUv;
out float vDepth;

void main() {
  vec4 mv = uModelView * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * vec2(length(uModelView[0].xyz), length(uModelView[1].xyz));
  mv = project(mv);
  vUv = uv * uUvTransform.xy + uUvTransform.zw;
  vDepth = -mv.z;
  gl_Position = uProjection * mv;
}
`;

const BASIC_FRAGMENT = /* glsl */ `
in vec2 vUv;
in float vDepth;
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;

void main() {
  vec4 c = vec4(uColor, uOpacity);
#ifdef MAP
  c *= texture(uMap, vUv);
#endif
  fragColor = vec4(present(c.rgb, vDepth), c.a);
}
`;

const POINTS_VERTEX = /* glsl */ `
uniform float uPointScale; // world size -> pixels at depth 1
out vec3 vColor;
out float vDepth;

void main() {
  vec4 mv = project(uModelView * vec4(position, 1.0));
  vColor = color;
  vDepth = -mv.z;
  gl_Position = uProjection * mv;
  gl_PointSize = uPointScale / max(-mv.z, 0.001);
}
`;

const POINTS_FRAGMENT = /* glsl */ `
in vec3 vColor;
in float vDepth;
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;

void main() {
  vec4 c = vec4(uColor * vColor, uOpacity);
#ifdef MAP
  c *= texture(uMap, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
#endif
  fragColor = vec4(present(c.rgb, vDepth), c.a);
}
`;

const SOURCES = {
  standard: [STANDARD_VERTEX, STANDARD_FRAGMENT],
  basic: [BASIC_VERTEX, BASIC_FRAGMENT],
  sprite: [SPRITE_VERTEX, BASIC_FRAGMENT],
  points: [POINTS_VERTEX, POINTS_FRAGMENT],
};

// Full vertex and fragment sources for a shader kind with the given feature flags.
export function shaderSource(kind, flags) {
  const [vertex, fragment] = SOURCES[kind];
  const defines = flags.map((f) => `#define ${f}\n`).join('');
  return [VERTEX_HEAD + vertex, FRAGMENT_HEAD + defines + fragment];
}
