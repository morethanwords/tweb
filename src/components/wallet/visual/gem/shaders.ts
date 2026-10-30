// The gem's shaders — a port of DiamondLux.metalsrc to GLSL ES 3.0. Only what
// the gem on the card needs is kept: the cut with its optics, the palettes and
// the sparkles. The stars around the gem (stars.ts) and the reference's running
// glints are not drawn here.

const UNIFORMS = /* glsl */`
uniform mat4 u_model;
uniform mat4 u_projection;
uniform mat4 u_inverseModel;
uniform vec4 u_parameters;     // time, refraction, brightness, sparkles
uniform vec4 u_viewport;       // width, height, plane count, sparkles only
uniform vec4 u_sparkleShape;   // main scale, morph, core, star
uniform vec4 u_sparkleHalo;    // halo, main rotation, x correction, visibility
uniform vec4 u_crownGradient;
uniform vec4 u_pavilionGradient;
uniform vec4 u_lightSweep;     // diagonal, studio phase, transmission
uniform vec4 u_facetProjection;
uniform vec4 u_crownSweep;
uniform vec4 u_rightCrownSweep;
uniform vec4 u_leftCrownSweep;
uniform vec4 u_pavilionSweep;
uniform vec4 u_rightPavilionSweep;
uniform vec4 u_leftPavilionSweep;
uniform vec4 u_appearance;     // palette, whiteness
uniform vec4 u_planes[17];
`;

export const DIAMOND_VERTEX = /* glsl */`#version 300 es
precision highp float;
${UNIFORMS}
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_surface;
out vec3 v_local;
out vec3 v_normal;
out vec3 v_world;
out vec3 v_facet;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  gl_Position = u_projection * world;
  v_local = a_position;
  v_normal = normalize((u_model * vec4(a_normal, 0.0)).xyz);
  v_world = world.xyz;
  float kind = a_surface.z;
  v_facet = kind > 2.5 ? vec3(a_surface.xy, 1.0 - a_surface.x - a_surface.y)
                       : vec3(kind < 0.5 ? 1.0 : 0.0, abs(kind - 1.0) < 0.5 ? 1.0 : 0.0, abs(kind - 2.0) < 0.5 ? 1.0 : 0.0);
}`;

export const DIAMOND_FRAGMENT = /* glsl */`#version 300 es
precision highp float;
${UNIFORMS}
in vec3 v_local;
in vec3 v_normal;
in vec3 v_world;
in vec3 v_facet;
out vec4 fragColor;

#define PI 3.14159265358979

vec3 referenceCrown(vec2 p, vec4 g) {
  const float stops[7] = float[7](0.0, 0.162, 0.324, 0.501, 0.667, 0.833, 1.0);
  vec3 colors[7] = vec3[7](vec3(0.145,0.792,1), vec3(0.373,0.875,1), vec3(0.6,0.957,1), vec3(0.3,0.798,1),
                           vec3(0,0.639,1), vec3(0,0.545,1), vec3(0,0.451,1));
  vec2 start = g.xy, direction = g.zw - start;
  float t = clamp(dot(p - start, direction) / dot(direction, direction), 0.0, 1.0);
  for (int i = 1; i < 7; ++i) {
    if (t <= stops[i]) return mix(colors[i-1], colors[i], (t - stops[i-1]) / (stops[i] - stops[i-1]));
  }
  return colors[6];
}

vec3 lateralDepth(vec3 color, vec3 normal, float y, vec3 fw, float opticalLuminance) {
  float horizontalNormal = length(normal.xz);
  float side = smoothstep(0.22, 0.80, abs(normal.x) / max(horizontalNormal, 0.001));
  float shoulder = smoothstep(0.06, 0.57, y);
  float lower = smoothstep(0.12, 0.90, -y);
  float reflectedLight = smoothstep(0.28, 0.78, color.g);
  vec3 deepBlue = mix(vec3(0.017, 0.035, 0.90), vec3(0.006, 0.11, 1), reflectedLight);
  vec3 sideColor = mix(deepBlue, vec3(0.22, 0.86, 1), shoulder * 0.69);
  sideColor = mix(sideColor, vec3(0.018, 0.39, 1), lower * 0.52);
  float detail = 0.105 + opticalLuminance * 0.14 + smoothstep(0.70, 0.95, color.g) * 0.26;
  sideColor = mix(sideColor, color, detail);
  return mix(color, sideColor, side * 0.96 * (1.0 - fw.x));
}

vec3 facetBarycentric(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 v = b - a, w = c - a, q = p - a;
  float d = v.x * w.y - v.y * w.x;
  float y = (q.x * w.y - q.y * w.x) / d;
  float z = (v.x * q.y - v.y * q.x) / d;
  return vec3(1.0 - y - z, y, z);
}

float facetCoverage(vec3 b) {
  float edge = min(b.x, min(b.y, b.z));
  float aa = max(fwidth(edge), 0.004);
  return smoothstep(-aa, aa, edge);
}

vec2 sourceFacetPoint(vec3 lp, vec2 outward) {
  float across = dot(lp.xz, vec2(outward.y, -outward.x));
  float depth = dot(lp.xz, outward);
  float c = u_facetProjection.x, s = u_facetProjection.y;
  float y = c * lp.y - s * depth;
  float z = s * lp.y + c * depth;
  float w = u_projection[2].w * z + u_projection[3].w;
  return vec2(257.6 + across / w * u_facetProjection.z, 103.8 + (u_facetProjection.w - y / w) * u_facetProjection.z);
}

vec3 illustratedFacets(vec3 color, vec3 n, vec3 localNormal) {
  vec2 outward = abs(localNormal.x) > abs(localNormal.z) ? vec2(sign(localNormal.x), 0) : vec2(0, sign(localNormal.z));
  vec3 tangent = vec3(outward.y, 0, -outward.x);
  vec2 p = sourceFacetPoint(v_local, outward);
  vec2 nxz = abs(localNormal.xz);
  float broad = 1.0 - smoothstep(0.20, 0.65, min(nxz.x, nxz.y) / max(max(nxz.x, nxz.y), 0.0001));
  vec3 worldTangent = (u_model * vec4(tangent, 0)).xyz;
  vec3 light = normalize(vec3(0.6 * sin(u_lightSweep.y), 0.5, 1));
  float leftLight = pow(clamp(dot(normalize(n - worldTangent * 0.38), light), 0.0, 1.0), 5.0);
  float rightLight = pow(clamp(dot(normalize(n + worldTangent * 0.38), light), 0.0, 1.0), 5.0);
  if (v_facet.y > 0.0) {
    const vec2 junction = vec2(258.8, 128.9);
    const vec2 baseLeft = vec2(108.8, 240.8);
    const vec2 baseRight = vec2(406.8, 240.8);
    vec3 left = facetBarycentric(p, vec2(142.1, 106.3), junction, baseLeft);
    float leftStrength = facetCoverage(left) * (0.18 + 0.40 * leftLight) * clamp(1.0 - left.y, 0.0, 1.0);
    color = mix(color, vec3(0.79, 0.988, 1), leftStrength * v_facet.y * broad);
    vec3 right = facetBarycentric(p, baseRight, junction, vec2(378.5, 108.2));
    float g = smoothstep(junction.x, baseRight.x, p.x);
    vec3 tint = mix(vec3(0.28, 0.83, 1), vec3(0.025, 0.43, 1), g);
    tint = mix(tint, vec3(0.57, 0.95, 1), rightLight * 0.24);
    color = mix(color, tint, facetCoverage(right) * 0.90 * v_facet.y * broad);
  }
  if (v_facet.z > 0.0) {
    vec2 kite = vec2(dot(v_local, tangent), v_local.y);
    const float halfWidth = 0.245, top = -0.61, shoulder = -0.70, bottom = -1.075;
    const float upperHeight = top - shoulder, lowerHeight = shoulder - bottom;
    float upperEdge = ((top - kite.y) * halfWidth - abs(kite.x) * upperHeight) / length(vec2(halfWidth, upperHeight));
    float lowerEdge = ((kite.y - bottom) * halfWidth - abs(kite.x) * lowerHeight) / length(vec2(halfWidth, lowerHeight));
    float edge = min(upperEdge, lowerEdge);
    float aa = max(fwidth(edge), 0.0015);
    float coverage = smoothstep(-aa, aa, edge);
    float illumination = clamp(dot(n, normalize(vec3(-0.65, 0.5, 1))), 0.0, 1.0);
    vec3 tint = mix(vec3(0.48, 0.96, 1), vec3(0.70, 1, 1), illumination);
    float across = clamp(0.5 + kite.x / (2.0 * halfWidth), 0.0, 1.0);
    tint *= mix(vec3(1), vec3(0.88, 0.97, 1), across);
    color = mix(color, tint, coverage * 0.28 * v_facet.z * broad);
  }
  return color;
}

vec3 studio(vec3 d, float phase) {
  float angle = 0.85 * sin(phase);
  d.xz = vec2(cos(angle) * d.x - sin(angle) * d.z, sin(angle) * d.x + cos(angle) * d.z);
  float up = smoothstep(-0.65, 0.85, d.y);
  vec3 c = mix(vec3(0.002, 0.075, 0.88), vec3(0.19, 0.78, 1.0), up);
  float key = pow(clamp(dot(d, normalize(vec3(-0.6, 0.8, 0.7))), 0.0, 1.0), 10.0);
  float stripPosition = 0.12 + 0.48 * sin(phase);
  float strip = exp(-pow((d.x + d.y * 0.42 - stripPosition) * 9.0, 2.0));
  float side = pow(clamp(dot(d, normalize(vec3(0.8, 0.2, -0.5))), 0.0, 1.0), 18.0);
  c = mix(c, vec3(0.68, 0.98, 1.0), key * 0.94);
  c = mix(c, vec3(0.80, 0.99, 1.0), strip * 0.64);
  c += side * vec3(0.1, 0.3, 0.38);
  return c;
}

vec2 facetEdgeRoll(vec2 p, vec2 a, vec2 b) {
  vec2 segment = b - a;
  float edgeLength = length(segment);
  vec2 along = segment / edgeLength;
  vec2 across = vec2(-along.y, along.x);
  float distance = dot(p - a, across);
  float progress = dot(p - a, along);
  float width = max(1.6, fwidth(distance));
  float q = distance / width;
  float ends = smoothstep(0.0, 5.0, progress) * (1.0 - smoothstep(edgeLength - 5.0, edgeLength, progress));
  return across * (q * exp(-q * q) * 0.22 * ends);
}

vec3 polishedNormal(vec3 localNormal) {
  if (v_facet.y <= 0.0) return normalize(v_normal);
  vec2 outward = abs(localNormal.x) > abs(localNormal.z) ? vec2(sign(localNormal.x), 0) : vec2(0, sign(localNormal.z));
  vec2 nxz = abs(localNormal.xz);
  float broad = 1.0 - smoothstep(0.20, 0.65, min(nxz.x, nxz.y) / max(max(nxz.x, nxz.y), 0.0001));
  vec2 p = sourceFacetPoint(v_local, outward);
  vec2 roll = facetEdgeRoll(p, vec2(258.8, 128.9), vec2(108.8, 240.8))
            + facetEdgeRoll(p, vec2(258.8, 128.9), vec2(406.8, 240.8));
  vec3 across = vec3(outward.y, 0, -outward.x);
  vec3 up = normalize(cross(localNormal, across));
  vec3 normal = normalize(localNormal - (across * roll.x - up * roll.y) * broad * v_facet.y);
  return normalize((u_model * vec4(normal, 0)).xyz);
}

float studioPanel(vec3 reflected, vec3 direction, vec2 size) {
  float alignment = dot(reflected, direction);
  vec3 horizontal = normalize(cross(vec3(0, 1, 0), direction));
  vec3 vertical = cross(direction, horizontal);
  vec2 point = vec2(dot(reflected, horizontal), dot(reflected, vertical)) / max(alignment, 0.15);
  vec2 dx = dFdx(point), dy = dFdy(point);
  vec2 variance = size * size + dx * dx + dy * dy;
  float energy = size.x * size.y / sqrt(variance.x * variance.y);
  return exp(-dot(point * point, 1.0 / variance)) * energy * smoothstep(0.15, 0.40, alignment);
}

vec3 surfaceFinish(vec3 color, vec3 normal, vec3 view) {
  vec3 reflected = reflect(-view, normal);
  float phase = u_lightSweep.y;
  float key = studioPanel(reflected, normalize(vec3(-0.36 + 0.14 * sin(phase), 0.90, 0.72)), vec2(0.16, 0.48));
  float rim = studioPanel(reflected, normalize(vec3(0.72, -0.52 + 0.10 * cos(phase), 0.18)), vec2(0.10, 0.60));
  float fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 4.0);
  float strength = key * (0.35 + 0.35 * fresnel) + rim * (0.16 + 0.30 * fresnel);
  return mix(color, vec3(0.87, 0.99, 1), strength);
}

float nearestExit(vec3 origin, vec3 ray, inout vec3 normal) {
  float nearest = 1e5;
  float second = 1e5;
  vec3 secondNormal = normal;
  for (int i = 0; i < 17; ++i) {
    vec4 plane = u_planes[i];
    float denominator = dot(plane.xyz, ray);
    if (denominator > 0.0001) {
      float t = -(dot(plane.xyz, origin) + plane.w) / denominator;
      if (t > 0.001 && t < nearest) {
        second = nearest; secondNormal = normal;
        nearest = t; normal = plane.xyz;
      } else if (t > 0.001 && t < second) {
        second = t; secondNormal = plane.xyz;
      }
    }
  }
  if (second < 1e5) {
    float width = max(0.008, min(0.035, fwidth(second - nearest)));
    float blend = 0.5 * (1.0 - smoothstep(0.0, width, second - nearest));
    normal = normalize(mix(normal, secondNormal, blend));
  }
  return nearest;
}

vec4 oppositeFacets(vec3 p, vec3 ray) {
  vec3 origin = p + ray * 0.004;
  vec3 normal = vec3(0, 1, 0);
  float distance = nearestExit(origin, ray, normal);
  if (distance > 100.0 || normal.y > 0.95) return vec4(0);
  vec3 hit = origin + ray * distance;
  vec3 worldNormal = (u_model * vec4(normal, 0)).xyz;
  vec3 tangent = normalize(vec3(normal.z + 0.00001, 0, -normal.x));
  float across = dot(hit, tangent);
  vec2 authored = vec2(across * 225.8, (normal.y > 0.0 ? 0.3065 - hit.y : -0.54 - hit.y) * 239.0);
  vec3 color;
  if (normal.y > 0.0) {
    color = referenceCrown(authored, u_crownGradient);
    float response = pow(clamp(dot(worldNormal, normalize(vec3(0.7 * sin(u_lightSweep.y), 0.55, -1))), 0.0, 1.0), 4.0);
    color = mix(color * vec3(0.45, 0.70, 0.98), vec3(0.60, 0.94, 1), response * 0.55);
  } else {
    vec3 reflected = normalize((u_model * vec4(reflect(ray, normal), 0)).xyz);
    vec3 environment = studio(reflected, u_lightSweep.y);
    float response = pow(clamp(dot(worldNormal, normalize(vec3(-0.4, -0.55, -1))), 0.0, 1.0), 2.0);
    color = mix(vec3(0.012, 0.38, 1), vec3(0.27, 0.94, 1), response * 0.65 + environment.g * 0.35);
    color = mix(color, environment, 0.28);
    float panel = studioPanel(reflected, normalize(vec3(-0.36, 0.90, 0.72)), vec2(0.20, 0.52));
    color = mix(color, vec3(0.72, 0.98, 1), panel * 0.48);
  }
  float coverage = smoothstep(0.03, 0.35, distance) * exp(-distance * 0.16);
  return vec4(color, coverage);
}

float sourceBand(vec2 p, vec4 g) {
  vec2 direction = g.zw - g.xy;
  float t = dot(p - g.xy, direction) / dot(direction, direction);
  return clamp(1.0 - abs(t - 0.49) / 0.49, 0.0, 1.0);
}

float facetSweep(vec3 localNormal) {
  vec3 tangent = normalize(vec3(localNormal.z + 0.00001, 0, -localNormal.x));
  float across = dot(v_local, tangent) * 225.8;
  float side = smoothstep(0.20, 0.50, abs(normalize(v_normal).x));
  bool right = v_normal.x > 0.0;
  vec4 crown = mix(u_crownSweep, right ? u_rightCrownSweep : u_leftCrownSweep, side);
  vec4 pavilion = mix(u_pavilionSweep, right ? u_rightPavilionSweep : u_leftPavilionSweep, side);
  return sourceBand(vec2(across, (0.3065 - v_local.y) * 239.0), crown) * v_facet.y
       + sourceBand(vec2(across, (-0.54 - v_local.y) * 235.0), pavilion) * v_facet.z;
}

vec3 internalEnvironment(vec3 position, vec3 direction, float pavilion) {
  vec3 wp = (u_model * vec4(position, 1)).xyz;
  vec3 wd = normalize((u_model * vec4(direction, 0)).xyz);
  float along = dot(wp, wd);
  float distance = -along + sqrt(max(0.0, along * along + 3.2 * 3.2 - dot(wp, wp)));
  vec3 s = normalize(wp + wd * distance);
  if (pavilion <= 0.0) return studio(s, u_lightSweep.y);
  float phase = u_lightSweep.y;
  float key = studioPanel(s, normalize(vec3(-0.12 + 0.035 * sin(phase), -0.60, 0.79)), vec2(0.055, 0.52));
  float rim = studioPanel(s, normalize(vec3(0.12, 0.75 + 0.035 * cos(phase), -0.65)), vec2(0.055, 0.50));
  vec3 lower = mix(vec3(0.015, 0.41, 1), vec3(0.58, 0.94, 1), key * 0.95);
  lower = mix(lower, vec3(0.24, 0.78, 1), rim * 0.82);
  return pavilion < 1.0 ? mix(studio(s, u_lightSweep.y), lower, pavilion) : lower;
}

float reflectionTriangle(vec3 origin, vec3 ray, vec3 a, vec3 b, vec3 c, out vec3 coordinates) {
  vec3 ab = b - a, ac = c - a, crossRay = cross(ray, ac);
  float determinant = dot(ab, crossRay);
  coordinates = vec3(0);
  if (abs(determinant) < 0.00001) return 1e5;
  vec3 offset = origin - a;
  float u = dot(offset, crossRay) / determinant;
  vec3 q = cross(offset, ab);
  float v = dot(ray, q) / determinant;
  float t = dot(ac, q) / determinant;
  coordinates = vec3(1.0 - u - v, u, v);
  return min(min(coordinates.x, coordinates.y), coordinates.z) >= 0.0 && t > 0.001 ? t : 1e5;
}

vec3 pavilionReflections(vec3 color, vec3 origin, vec3 ray) {
  if (u_parameters.y <= 0.0) return color;
  const vec3 top = vec3(0, -0.28, 0), tip = vec3(0, -1.06, 0);
  float entry = 0.0, exit = 1e5;
  vec3 entryNormal = vec3(0, 1, 0);
  vec3 worldRay = normalize((u_model * vec4(ray, 0)).xyz);
  vec3 illumination = normalize(vec3(-0.55, 0.65, 1));
  vec3 sideColor = vec3(0);
  float sideWeight = 0.0;
  vec3 veilColor = vec3(0);
  float veilWeight = 0.0;
  for (int i = 0; i < 8; ++i) {
    float a0 = float(i) * PI / 4.0, a1 = float(i + 1) * PI / 4.0;
    vec2 current = vec2(sin(a0), cos(a0)), next = vec2(sin(a1), cos(a1));
    vec3 a = vec3(current.x * 0.28, -0.68, current.y * 0.28);
    vec3 b = vec3(next.x * 0.28, -0.68, next.y * 0.28);
    for (int part = 0; part < 2; ++part) {
      vec3 peak = part == 0 ? top : tip;
      vec3 n = normalize(cross(a - peak, b - peak));
      if (dot(n, (a + b + peak) / 3.0 - vec3(0, -0.68, 0)) < 0.0) n = -n;
      float denominator = dot(n, ray);
      float side = dot(n, origin - peak);
      if (abs(denominator) < 0.00001) {
        if (side > 0.0) exit = -1.0;
      } else {
        float t = -side / denominator;
        if (denominator < 0.0 && t > entry) { entry = t; entryNormal = n; }
        if (denominator > 0.0) exit = min(exit, t);
      }
    }
    vec3 radial = vec3(current.x, 0, current.y);
    vec3 tangent = vec3(current.y, 0, -current.x);
    const float upperY = 0.20;
    const float extension = (upperY + 0.12) / 0.65;
    const float upperRadius = 0.64 + (0.64 - 0.19) * extension;
    const float upperWidth = 0.265097 + (0.265097 - 0.078701) * extension;
    vec3 upperLeft = radial * upperRadius - tangent * upperWidth + vec3(0, upperY, 0);
    vec3 upperRight = radial * upperRadius + tangent * upperWidth + vec3(0, upperY, 0);
    vec3 lowerLeft = radial * 0.19 - tangent * 0.078701 + vec3(0, -0.77, 0);
    vec3 lowerRight = radial * 0.19 + tangent * 0.078701 + vec3(0, -0.77, 0);
    vec3 rc;
    float ribbon = reflectionTriangle(origin, ray, upperLeft, upperRight, lowerLeft, rc);
    if (ribbon > 100.0) ribbon = reflectionTriangle(origin, ray, upperRight, lowerRight, lowerLeft, rc);
    if (ribbon < 100.0) {
      vec3 hit = origin + ray * ribbon;
      float depth = (-0.12 - hit.y) / 0.65;
      float across = dot(hit, tangent);
      float right = mix(0.265097, 0.078701, depth), left = -right;
      vec3 worldRadial = normalize((u_model * vec4(radial, 0)).xyz);
      float facing = clamp(-dot(worldRadial, worldRay), 0.0, 1.0);
      float fade = smoothstep(0.0, 0.065, upperY - hit.y) * (1.0 - smoothstep(0.70, 1.0, depth));
      float opacity = fade * (0.16 + 0.84 * facing);
      float light = clamp(0.5 + 0.5 * dot(worldRadial, illumination), 0.0, 1.0);
      float acrossPlane = clamp((across - left) / (right - left), 0.0, 1.0);
      float diagonal = smoothstep(-0.045, 0.045, acrossPlane - 0.35 - depth * 0.55);
      float middle = smoothstep(0.12, 0.24, depth) * (1.0 - smoothstep(0.50, 0.64, depth));
      vec3 tint = mix(vec3(0.015, 0.56, 1), vec3(0.33, 0.97, 1), light);
      tint = mix(tint, vec3(0.42, 0.97, 1), middle * (0.32 - 0.20 * diagonal));
      tint = mix(tint, vec3(0.015, 0.46, 1), diagonal * 0.24);
      veilColor += tint * opacity;
      veilWeight += opacity;
    }
    vec3 aSide = radial * 0.72 + tangent * 0.055 + vec3(0, -0.30, 0);
    vec3 bSide = radial * 0.49 - tangent * 0.105 + vec3(0, -0.60, 0);
    vec3 cSide = radial * 0.15 + tangent * 0.020 + vec3(0, -0.93, 0);
    vec3 coordinates;
    float t = reflectionTriangle(origin, ray, aSide, bSide, cSide, coordinates);
    if (t < 100.0) {
      vec3 worldRadial = normalize((u_model * vec4(radial, 0)).xyz);
      float sideFacing = 1.0 - abs(dot(worldRadial, worldRay));
      float edge = min(coordinates.y, coordinates.z);
      float opacity = smoothstep(0.20, 0.75, sideFacing) * smoothstep(0.0, 0.085, edge) * smoothstep(0.0, 0.035, coordinates.x);
      float light = 0.5 + 0.5 * dot(worldRadial, illumination);
      vec3 tint = mix(vec3(0.16, 0.80, 1), vec3(0.85, 1, 1), light);
      sideColor += tint * opacity;
      sideWeight += opacity;
    }
  }
  float strength = clamp(u_parameters.y / 0.72, 0.0, 1.0);
  if (veilWeight > 0.0) color = mix(color, veilColor / veilWeight, (1.0 - exp(-veilWeight * 0.46)) * strength);
  if (sideWeight > 0.0) color = mix(color, sideColor / sideWeight, (1.0 - exp(-sideWeight * 1.4)) * strength);
  if (entry < exit) {
    vec3 hit = origin + ray * entry;
    vec3 worldNormal = normalize((u_model * vec4(entryNormal, 0)).xyz);
    float light = clamp(dot(worldNormal, normalize(vec3(-0.65, 0.15, 1))), 0.0, 1.0);
    float gleam = studioPanel(reflect(worldRay, worldNormal),
      normalize(vec3(-0.35 + 0.15 * sin(u_lightSweep.y), 0.60, 0.75)), vec2(0.25, 0.65));
    vec3 tint = mix(vec3(0.025, 0.54, 1), vec3(0.40, 0.92, 1), light);
    tint = mix(tint, vec3(0.72, 0.99, 1), gleam * 0.16);
    float thickness = smoothstep(0.0, 0.18, exit - entry);
    float fade = smoothstep(-1.07, -0.93, hit.y);
    color = mix(color, tint, 0.28 * thickness * fade * strength);
  }
  return color;
}

vec3 interior(vec3 p, vec3 direction, float pavilion) {
  vec3 accumulated = vec3(0);
  float weight = 0.60;
  vec3 origin = p + direction * 0.004;
  for (int bounce = 0; bounce < 2; ++bounce) {
    vec3 n = vec3(0, 1, 0);
    float distance = nearestExit(origin, direction, n);
    if (distance > 100.0) break;
    vec3 hit = origin + direction * distance;
    vec3 outgoing = refract(direction, -n, 1.62);
    vec3 reflection = reflect(direction, n);
    vec3 color = internalEnvironment(hit, reflection, pavilion);
    if (dot(outgoing, outgoing) > 0.01) {
      float incident = clamp(dot(direction, n), 0.0, 1.0);
      float transmitted = clamp(dot(outgoing, n), 0.0, 1.0);
      float rs = (1.62 * incident - transmitted) / (1.62 * incident + transmitted);
      float rp = (incident - 1.62 * transmitted) / (incident + 1.62 * transmitted);
      float reflectance = 0.5 * (rs * rs + rp * rp);
      color = mix(internalEnvironment(hit, outgoing, pavilion), color, reflectance);
    }
    color *= exp(-vec3(0.30, 0.07, 0.006) * distance);
    accumulated += weight * color;
    weight *= 0.52;
    direction = reflection;
    origin = hit + direction * 0.004;
  }
  return accumulated;
}

vec3 materialPalette(vec3 color, vec3 fw, int appearance) {
  if (appearance == 1) {
    float tone = smoothstep(0.0, 0.92, clamp(dot(color.rg, vec2(0.22, 0.78)), 0.0, 1.0));
    vec3 shadow = mix(vec3(0.63, 0.77, 0.95), vec3(0.733, 0.859, 1), fw.y * 0.25);
    const vec3 ice = vec3(207, 241, 253) / 255.0;
    vec3 upper = mix(shadow, ice, smoothstep(0.0, 0.62, tone));
    upper = mix(upper, vec3(1), smoothstep(0.58, 1.0, tone) * 0.92);
    vec3 lower = mix(vec3(0.59, 0.71, 0.865), vec3(0.96, 0.985, 1), pow(tone, 1.10));
    return mix(upper, lower, fw.z);
  }
  if (appearance == 2) {
    float tone = smoothstep(0.035, 0.90, clamp(dot(color.rg, vec2(0.20, 0.80)), 0.0, 1.0));
    vec3 cool = mix(vec3(0.025, 0.29, 0.83), vec3(0.38, 0.78, 1), smoothstep(0.0, 0.65, tone));
    vec3 upper = mix(cool, vec3(0.94, 0.99, 1), smoothstep(0.45, 1.0, tone));
    vec3 lower = mix(vec3(0.025, 0.34, 0.92), vec3(0.90, 0.99, 1), pow(tone, 2.35));
    return mix(upper, lower, fw.z);
  }
  return color;
}

void main() {
  vec3 n = normalize(v_normal);
  float cameraDistance = -u_projection[3].w / u_projection[2].w;
  vec3 view = normalize(vec3(0, 0, cameraDistance) - v_world);
  vec3 localView = (u_inverseModel * vec4(-view, 0)).xyz;
  vec3 localNormal = normalize((u_inverseModel * vec4(n, 0)).xyz);
  vec3 transmitted = refract(localView, localNormal, 1.0 / 1.62);
  vec3 optical = interior(v_local, transmitted, v_facet.z);
  vec3 reflection = studio(reflect(-view, n), u_lightSweep.y);
  float fresnel = 0.08 + 0.46 * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 4.0);

  float height = clamp((v_local.y + 1.05) / 1.65, 0.0, 1.0);
  float key = clamp(dot(n, normalize(vec3(-0.65, 0.85, 1.0))), 0.0, 1.0);
  float left = clamp(0.52 - v_world.x * 0.43, 0.0, 1.0);
  vec3 body = mix(vec3(0.008, 0.22, 1.0), vec3(0.29, 0.87, 1.0), clamp(key * 0.60 + left * 0.38, 0.0, 1.0));
  float verticalBand = mix(0.5 + 0.5 * sin(height * 18.0 + n.x * 3.0), 1.0, v_facet.z);
  body *= mix(vec3(0.24, 0.48, 0.96), vec3(1), verticalBand * 0.5 + 0.5);
  float opticalLuminance = smoothstep(0.25, 0.85, optical.g);
  vec3 opticalShadow = mix(vec3(0.005, 0.13, 1), vec3(0.015, 0.36, 1), v_facet.z);
  vec3 opticalLight = mix(vec3(0.58, 0.97, 1), vec3(0.45, 0.99, 1), v_facet.z);
  optical = mix(opticalShadow, opticalLight, opticalLuminance);
  float opticalWeight = u_parameters.y * mix(0.90, 0.08, v_facet.y);
  vec3 color = mix(body, optical, opticalWeight);
  color = mix(color, reflection, fresnel);

  float crownGlow = smoothstep(0.10, 0.60, v_local.y) * left;
  color = mix(color, vec3(0.70, 0.99, 1.0), crownGlow * 0.58);
  float crownLight = pow(clamp(dot(n, normalize(vec3(-0.38, 0.55, 1.0))), 0.0, 1.0), 9.0);
  crownLight *= smoothstep(-0.03, 0.28, v_local.y);
  color = mix(color, vec3(0.65, 0.98, 1.0), crownLight * 0.35);
  vec3 facetBase = color;
  if (v_facet.y > 0.0) {
    float softbox = exp(-pow((v_world.x + 0.42) * 1.6, 2.0) - pow((v_world.y - 0.32) * 2.2, 2.0));
    color = mix(color, vec3(0.71, 0.99, 1.0), softbox * crownLight * 0.36);
    float shadow = pow(clamp(1.0 - key, 0.0, 1.0), 1.4);
    color = mix(color, vec3(0.015, 0.08, 1.0), shadow * 0.7);
    vec3 tangent = normalize(vec3(localNormal.z, 0, -localNormal.x));
    vec2 authored = vec2(dot(v_local, tangent) * 225.8 + n.x * 65.0, (0.3065 - v_local.y) * 244.0);
    color = mix(referenceCrown(authored, u_crownGradient), color, 0.28);
    color = mix(facetBase, color, v_facet.y);
  }
  if (v_facet.z > 0.0) color = mix(color, mix(vec3(0.008, 0.32, 1), optical, 0.86), v_facet.z * u_parameters.y);
  float facetFlash = smoothstep(0.20, 0.78, opticalLuminance);
  float flashWeight = mix(0.24, 0.08, v_facet.y);
  color *= mix(vec3(1), mix(vec3(0.76, 0.82, 0.99), vec3(1), facetFlash), flashWeight);
  color = mix(color, vec3(0.66, 0.98, 1), pow(facetFlash, 2.0) * 0.24 * flashWeight);
  color = lateralDepth(color, n, v_local.y, v_facet, opticalLuminance);
  color = mix(color, optical, v_facet.z * u_parameters.y * 0.48);
  color = mix(color, body, v_facet.z * pow(clamp(n.z, 0.0, 1.0), 2.0) * 0.32);
  vec3 rearRay = normalize(mix(localView, transmitted, mix(0.68, 0.18, v_facet.y)));
  vec4 rear = oppositeFacets(v_local, rearRay);
  float transmission = mix(0.34, 0.12 + u_lightSweep.z * 0.65, v_facet.y) * u_parameters.y;
  float facing = smoothstep(0.12, 0.65, n.z);
  color = mix(color, rear.rgb, rear.a * transmission * facing * mix(1.0, 0.12, v_facet.y));
  if (v_facet.z > 0.0) {
    vec3 detailRay = normalize(mix(localView, transmitted, 0.16));
    color = mix(color, pavilionReflections(color, v_local, detailRay), v_facet.z);
  }
  float tipGlow = pow(clamp((-v_local.y - 0.55) / 0.50, 0.0, 1.0), 2.0);
  color = mix(color, vec3(0.57, 0.96, 1.0), tipGlow * 0.20);
  // Translucent reflection of the table, like Layer 36 in the Lottie.
  vec3 tableRay = localView;
  tableRay.y *= 0.72;
  if (tableRay.y > 0.001) {
    float tableHeight = -u_planes[0].w / u_planes[0].y;
    float distance = (tableHeight - v_local.y) / tableRay.y;
    vec2 hit = (v_local + tableRay * distance).xz;
    const float extent = 0.632;
    const float corner = 0.285;
    vec2 q = abs(hit);
    float edge = max(max(q.x, q.y) - extent, (q.x + q.y - extent - corner) * 0.70710678);
    float aa = max(fwidth(edge), 0.001);
    float coverage = 1.0 - smoothstep(-aa, aa, edge);
    vec2 direction = tableRay.xz / max(length(tableRay.xz), 0.0001);
    float depth = clamp(0.5 + dot(hit, direction) / (2.0 * extent), 0.0, 1.0);
    float opacity = mix(0.39, 0.52, depth);
    color = mix(color, vec3(0.765, 0.988, 1), coverage * opacity * clamp(u_parameters.y / 0.72, 0.0, 1.0) * v_facet.y);
  }
  color = illustratedFacets(color, n, localNormal);
  color = mix(color, vec3(0.63, 0.96, 1), 0.58 * v_facet.x);
  float sweep = facetSweep(localNormal);
  float sweepCore = smoothstep(0.35, 1.0, sweep);
  color = mix(color, vec3(0.592, 0.953, 1), sweep * 0.20 + sweepCore * sweepCore * 0.62);
  color = surfaceFinish(color, polishedNormal(localNormal), view);
  color = materialPalette(color, v_facet, int(u_appearance.x + 0.5));
  fragColor = vec4(clamp(color * u_parameters.z, 0.0, 1.0), 1.0);
}`;

export const SPARKLE_VERTEX = /* glsl */`#version 300 es
precision highp float;
${UNIFORMS}
layout(location = 0) in vec4 a_contours;
layout(location = 1) in float a_layer;
uniform vec4 u_anchorPosition[8];
uniform vec4 u_anchorNormal[8];
uniform int u_baseInstance;
out vec2 v_source;
flat out float v_strength;
flat out int v_layer;
void main() {
  int instance = gl_InstanceID + u_baseInstance;
  int layer = int(a_layer + 0.5);
  const float authoringToWorld = 2.0 / 447.9;
  vec3 local = u_anchorPosition[instance].xyz;
  vec3 normal = u_anchorNormal[instance].xyz;
  if (instance == 0) {
    float c = cos(u_sparkleHalo.y), s = sin(u_sparkleHalo.y);
    local.xz = vec2(c * local.x + s * local.z, -s * local.x + c * local.z);
    normal.xz = vec2(c * normal.x + s * normal.z, -s * normal.x + c * normal.z);
  } else {
    local += normal * 0.008;
  }
  vec3 worldNormal = (u_model * vec4(normal, 0)).xyz;
  float pulse = pow(max(0.0, sin(u_parameters.x * 2.1 + float(instance) * 2.37 + 1.5)), 16.0);
  float front = instance == 0 ? u_sparkleHalo.w : smoothstep(0.15, 0.55, worldNormal.z);
  float strength = front * u_parameters.w;
  vec4 center = u_projection * u_model * vec4(local, 1);
  float morph = instance == 0 ? u_sparkleShape.y : 0.0;
  vec2 source = mix(a_contours.xy, a_contours.zw, morph);
  float groupScale = 1.0;
  vec2 offset = vec2(0);
  if (layer == 0) { groupScale = u_sparkleHalo.x; offset.y = 5.9; }
  if (layer == 1) { groupScale = u_sparkleShape.w; offset.y = -0.8; }
  if (layer == 2) { groupScale = u_sparkleShape.z; offset.y = -0.9; }
  if (layer == 3) { groupScale = 0.309; offset = vec2(0.6, -0.4); }
  float scale = instance == 0 ? u_sparkleShape.x * u_sparkleHalo.w : (0.632 / 0.75) * pulse;
  vec2 point = (source * groupScale + offset) * authoringToWorld * scale;
  gl_Position = center + center.w * vec4(point.x * u_projection[0][0] / u_sparkleHalo.z, -point.y * u_projection[1][1], 0, 0);
  v_source = source;
  v_strength = strength;
  v_layer = layer;
}`;

export const SPARKLE_FRAGMENT = /* glsl */`#version 300 es
precision highp float;
uniform vec4 u_appearance;
in vec2 v_source;
flat in float v_strength;
flat in int v_layer;
out vec4 fragColor;
float radialOpacity(float radius, float first, float middle) {
  if (radius <= first) return 1.0;
  if (radius <= middle) return mix(1.0, 0.5, (radius - first) / (middle - first));
  return 0.5 * clamp((1.0 - radius) / (1.0 - middle), 0.0, 1.0);
}
void main() {
  float alpha = 1.0;
  vec3 color = vec3(1);
  if (v_layer == 0) {
    alpha = radialOpacity(length(v_source - vec2(-0.5, 0.2)) / 108.5, 0.312, 0.624) * 0.60;
  } else if (v_layer == 1) {
    alpha = radialOpacity(length(v_source - vec2(-0.5, 0.9)) / 113.1, 0.297, 0.503) * 0.60;
    color = vec3(0.82, 1, 0.902);
  } else if (v_layer == 2) {
    alpha = 0.96;
  } else if (v_layer == 3) {
    float r = clamp(length(v_source) / length(vec2(176, -170)), 0.0, 1.0);
    alpha = 1.0 - r;
    color = mix(vec3(0.694, 0.969, 1), vec3(0.663, 0.957, 1), r);
  }
  int appearance = int(u_appearance.x + 0.5);
  if (appearance == 1) {
    color = v_layer == 0 ? vec3(0.635, 0.749, 1) : vec3(1);
    if (v_layer == 1) alpha = 0.0;
  } else if (appearance == 2) {
    color = v_layer == 1 ? vec3(0.82, 0.96, 1) : vec3(1);
  }
  alpha *= v_strength;
  fragColor = vec4(color * alpha, alpha);
}`;

// The amount through the grown gem: the same glyphs, through the faceted lens,
// only inside the gem's silhouette and at half strength. A port of gemLens from Lens.metal.
export const LENS_VERTEX = /* glsl */`#version 300 es
precision highp float;
const vec2 corners[4] = vec2[4](vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1));
void main() { gl_Position = vec4(corners[gl_VertexID], 0, 1); }`;

export const LENS_FRAGMENT = /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_text;
uniform vec2 u_hull[48];
uniform int u_count;
uniform vec2 u_center;     // gem centre, canvas points
uniform vec2 u_canvas;     // canvas size in points
uniform float u_pixelRatio;
uniform float u_strength;
uniform float u_spin;
uniform float u_textScale; // the canvas has grown — glyphs go back to their size
uniform float u_textShift; // the canvas moved right — glyphs stay in place
uniform float u_opacity;
out vec4 fragColor;
void main() {
  vec2 position = vec2(gl_FragCoord.x, u_canvas.y * u_pixelRatio - gl_FragCoord.y) / u_pixelRatio;
  bool inside = false;
  float best = 1e9;
  float radius = 0.0;
  for (int i = 0, j = u_count - 1; i < 48; j = i++) {
    if (i >= u_count) break;
    vec2 a = u_hull[i], b = u_hull[j];
    if (((a.y > position.y) != (b.y > position.y)) &&
        (position.x < (b.x - a.x) * (position.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    vec2 e = b - a;
    float h = clamp(dot(position - a, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
    best = min(best, distance(position, a + e * h));
    radius = max(radius, distance(a, u_center));
  }
  if (!inside) discard;
  float edge = smoothstep(0.0, 5.0, best) * u_strength;
  vec2 d = position - u_center;
  vec2 q = d / max(radius, 1.0);
  const float facet = 3.14159265 / 4.0;
  float u = (asin(clamp(q.x, -0.999, 0.999)) - u_spin) / facet;
  float wave = sin(3.14159265 * u);
  float prism = sign(wave) * pow(abs(wave), 0.6);
  float crown = 1.0 - smoothstep(-0.25, 0.05, q.y);
  vec2 bend = vec2(prism * 0.12, mix(-0.08 * q.y, 0.09, crown)) * radius;
  float zoom = mix(0.84, 0.72, crown * (1.0 - smoothstep(0.2, 0.6, abs(q.x))));
  vec2 s = u_center + d * mix(1.0, zoom, edge) + bend * edge;
  // Into the glyph texture coordinates: it covers the whole canvas, without growth or shift.
  vec2 c = u_canvas * 0.5;
  vec2 t = (s - c) * u_textScale + c + vec2(u_textShift, 0);
  vec4 ink = texture(u_text, t / u_canvas);
  float mask = smoothstep(0.0, 1.0, best);
  fragColor = ink * u_opacity * mask;
}`;
