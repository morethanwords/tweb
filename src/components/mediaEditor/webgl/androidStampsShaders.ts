export const androidStampVertex = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
uniform vec2 size;
varying vec2 texcoord;
void main() {
  gl_Position = vec4(position / size * 2.0 - 1.0, 0.0, 1.0);
  texcoord = uv;
}`;

export const androidStampFragment = `
precision highp float;
uniform sampler2D stamp;
uniform float intensity;
uniform bool neon;
varying vec2 texcoord;
void main() {
  vec4 f = texture2D(stamp, texcoord);
  gl_FragColor = neon ? vec4(f.r * intensity, f.g, f.b, 0.0) : vec4(1.0, 1.0, 1.0, intensity * f.r);
}`;

export const androidStampCompositeFragment = `
precision highp float;
uniform sampler2D source;
uniform sampler2D mask;
uniform vec4 color;
uniform bool neon;
varying vec2 texcoord;
void main() {
  vec4 dst = texture2D(source, texcoord);
  vec4 m = texture2D(mask, texcoord);
  float srcAlpha = color.a * m.a;
  vec3 finalColor = color.rgb;
  if(neon) {
    srcAlpha = clamp(0.78 * m.r + m.b + m.g, 0.0, 1.0);
    vec3 borderColor = mix(color.rgb, vec3(1.0), 0.86);
    finalColor = mix(color.rgb, borderColor, m.g);
    finalColor = mix(finalColor.rgb, vec3(1.0), m.b);
  }
  float outAlpha = srcAlpha + dst.a * (1.0 - srcAlpha);
  gl_FragColor.rgb = (finalColor * srcAlpha + dst.rgb * dst.a * (1.0 - srcAlpha)) / outAlpha;
  gl_FragColor.a = outAlpha;
}`;
