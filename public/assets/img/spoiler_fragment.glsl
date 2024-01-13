#version 300 es

precision highp float;

in float alpha;
out vec4 fragColor;

uniform vec3 color;

void main() {
  vec2 c = 2.0 * gl_PointCoord - 1.0;
  if (dot(c, c) > 1.0) {
    discard;
  }
  fragColor = vec4(color, alpha);
}