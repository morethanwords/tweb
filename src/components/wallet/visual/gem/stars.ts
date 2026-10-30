// Stars around the gem — the bursts. A port of backgroundStarVertex /
// backgroundStarFragment from DiamondLux.metalsrc: every star is a quad, all
// of the motion is computed in the vertex shader from the time and the index.

export const STEADY_STAR_COUNT = 240;
export const BURST_STAR_COUNT = 144;
export const BURST_LIFETIME = 6.4;

export const STAR_VERTEX = /* glsl */`#version 300 es
precision highp float;
uniform mat4 u_projection;
uniform vec4 u_animation;   // burst age, time, burst, light background
uniform vec4 u_layout;      // pixels, steady star count, burst seed
uniform vec4 u_appearance;
uniform vec4 u_tint;        // y — visibility, z — the radius from which they show
uniform int u_baseInstance;
out vec2 v_uv;
flat out vec4 v_color;
flat out float v_halo;
#define PI 3.14159265358979

float starRandom(uint seed) {
  seed ^= seed >> 16u; seed *= 0x7feb352du;
  seed ^= seed >> 15u; seed *= 0x846ca68bu;
  seed ^= seed >> 16u;
  return float(seed & 0x00ffffffu) / 16777216.0;
}

void main() {
  vec2 corners[6] = vec2[6](vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(-1, 1), vec2(1, -1), vec2(1, 1));
  uint instance = uint(gl_InstanceID + u_baseInstance);
  uint seed = instance * 127u + 9137u;
  bool burst = instance >= uint(u_layout.z);
  if (burst) seed += uint(u_layout.w) * 104729u;
  float lifetime = mix(4.5, 7.5, starRandom(seed + 1u));
  float clock = u_animation.y + starRandom(seed + 2u) * lifetime;
  uint cycle = uint(floor(clock / lifetime));
  float age = mod(clock, lifetime);
  if (burst) {
    // A burst lives in real time: it flies apart at once and fades.
    lifetime = mix(1.2, 2.0, starRandom(seed + 1u));
    age = u_animation.x;
    cycle = 0u;
  }
  seed += cycle * 7919u;
  float progress = clamp(age / lifetime, 0.0, 1.0);
  float alive = float(age >= 0.0 && age < lifetime) * (burst ? u_animation.z : 1.0);
  float fadeIn = burst ? smoothstep(0.0, 0.03, age) : smoothstep(0.0, 0.10, progress);
  float fade = fadeIn * (1.0 - smoothstep(0.62, 1.0, progress)) * alive * u_tint.y;
  float depth = mix(0.60, 1.0, starRandom(seed + 3u));
  float sector = starRandom(seed + 4u);
  float spread = starRandom(seed + 14u);
  const float verticalSpread = 0.78;
  float lowerFan = atan(tan(-PI / 6.0) / verticalSpread);
  float elevation = sector < 0.85 ? mix(lowerFan, 0.34, spread) : mix(0.52, 1.40, spread);
  float side = starRandom(seed + 15u) < 0.5 ? -1.0 : 1.0;
  vec2 direction = vec2(side * cos(elevation), sin(elevation));
  float distance;
  if (burst) {
    float travel = max(age, 0.0);
    float index = float(instance - uint(u_layout.z));
    // Evenly in every direction and over the whole area (R2 sequences).
    float angle = 2.0 * PI * fract(0.5 + index * 0.75487767 + (starRandom(seed + 13u) - 0.5) * 0.04);
    direction = vec2(cos(angle), sin(angle));
    float fill = fract(0.5 + index * 0.56984029 + (starRandom(seed + 5u) - 0.5) * 0.06);
    float reach = 2.4 * sqrt(mix(0.08, 1.0, fill));
    distance = 0.04 + reach * (1.0 - exp(-travel / 0.22)) + 0.06 * travel;
  } else {
    distance = 0.32 + age * mix(0.38, 0.63, starRandom(seed + 5u));
  }
  float drift = sin(age * 0.85 + starRandom(seed + 6u) * 6.28) * (burst ? 0.02 : 0.16);
  vec2 center = direction * distance + vec2(-direction.y, direction.x) * drift;
  center *= vec2(1, verticalSpread) * (burst ? 1.0 : depth);
  center.y += -0.10 + (burst ? 0.0 : mix(-0.26, 0.24, starRandom(seed + 16u)) * depth);
  float breathPeriod = mix(2.0, 3.4, starRandom(seed + 24u));
  float breathWave = 0.5 - 0.5 * cos(age * (2.0 * PI / breathPeriod) + starRandom(seed + 25u) * 2.0 * PI);
  float shine = smoothstep(0.0, 1.0, fade) * mix(burst ? 0.7 : 0.12, 1.0, breathWave);
  float radius = 1.53 * mix(0.0228, 0.084, pow(starRandom(seed + 7u), 1.7)) * depth * mix(0.87, 1.0, shine);
  // Visible as soon as they come out from behind the gem.
  fade *= burst ? smoothstep(0.45 * u_tint.z, 0.7 * u_tint.z, length(center))
                : smoothstep(0.72 * u_tint.z, 1.02 * u_tint.z, length(center));
  float rotation = starRandom(seed + 8u) * 1.57 + age * mix(-0.20, 0.20, starRandom(seed + 9u));
  vec2 uv = corners[gl_VertexID] * 1.45;
  vec2 point = vec2(cos(rotation) * uv.x - sin(rotation) * uv.y, sin(rotation) * uv.x + cos(rotation) * uv.y) * radius;
  float choice = starRandom(seed + 10u);
  vec3 darkColor = choice < 0.22 ? vec3(0.045, 0.36, 1) : (choice < 0.50 ? vec3(0, 0.451, 1)
                 : (choice < 0.82 ? vec3(0, 0.639, 1) : vec3(0.145, 0.792, 1)));
  darkColor = mix(darkColor, vec3(0.247, 0.894, 1), smoothstep(0.12, 1.0, shine) * 0.30);
  vec3 lightColor = darkColor * 0.78;
  int appearance = int(u_appearance.x + 0.5);
  if (appearance == 1) { darkColor = vec3(1); lightColor = vec3(1); }
  gl_Position = u_projection * vec4(center + point, -1.6 - depth, 1);
  v_uv = uv;
  v_color = vec4(mix(darkColor, lightColor, u_animation.w),
                 fade * mix(0.52, 0.95, starRandom(seed + 11u)) * mix(0.80, 1.0, depth));
  v_halo = mix(0.075, 0.035, u_animation.w);
}`;

export const STAR_FRAGMENT = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv;
flat in vec4 v_color;
flat in float v_halo;
out vec4 fragColor;
void main() {
  vec2 p = abs(v_uv);
  float d = sqrt(max(p.x, 0.00001)) + sqrt(max(p.y, 0.00001)) - 1.0;
  float aa = max(fwidth(d), 0.04);
  float core = 1.0 - smoothstep(-aa, aa, d);
  float glow = exp(-dot(v_uv, v_uv) * 4.5) * v_halo;
  float alpha = clamp(core + glow, 0.0, 1.0) * v_color.a;
  fragColor = vec4(v_color.rgb * alpha, alpha);
}`;
