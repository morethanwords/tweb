// Isolated, not imported by the production renderer. Telegram-Android
// 21f7d109da6ab3506c9e9577f98c6a38771ab335 FilterShaders.java:126–253,1229.
// BlurProgram(8, 3.0f, false): Java float weights/offsets, emitted via %f.
export const nativeGaussianPairs = [
  [1.458430, 0.233308], [3.403985, 0.135928],
  [5.351806, 0.051383], [7.302940, 0.012595]
] as const;
export const nativeGaussianCenterWeight = 0.133571;

export const nativeGaussianVertex = `
precision highp float;
attribute vec2 position;
uniform vec2 stepOffset;
varying highp vec2 blurCoordinates[9];
void main() {
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
  blurCoordinates[0] = position;
  ${nativeGaussianPairs.map(([offset], i) => `
  blurCoordinates[${i * 2 + 1}] = position + stepOffset * ${offset.toFixed(6)};
  blurCoordinates[${i * 2 + 2}] = position - stepOffset * ${offset.toFixed(6)};`).join('')}
}`;

export const nativeGaussianFragment = `
precision highp float;
uniform sampler2D source;
varying highp vec2 blurCoordinates[9];
void main() {
  lowp vec4 sum = vec4(0.0);
  sum += texture2D(source, blurCoordinates[0]) * ${nativeGaussianCenterWeight.toFixed(6)};
  ${nativeGaussianPairs.map(([, weight], i) => `
  sum += texture2D(source, blurCoordinates[${i * 2 + 1}]) * ${weight.toFixed(6)};
  sum += texture2D(source, blurCoordinates[${i * 2 + 2}]) * ${weight.toFixed(6)};`).join('')}
  gl_FragColor = sum;
}`;

export const nativeSelectiveMixVertex = `
precision highp float;
attribute vec2 position;
varying highp vec2 uv;
void main() {
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
  uv = position;
}`;

export const nativeSelectiveMixFragment = `
precision highp float;
varying highp vec2 uv;
uniform sampler2D source;
uniform sampler2D blurred;
uniform lowp float excludeSize;
uniform lowp float excludeBlurSize;
uniform lowp vec2 excludePoint;
uniform highp float aspectRatio;
uniform highp float angle;
uniform bool linear;
void main() {
  lowp vec4 sharpImageColor = texture2D(source, uv);
  lowp vec4 blurredImageColor = texture2D(blurred, uv);
  highp vec2 texCoordToUse = vec2(uv.x, uv.y * aspectRatio + 0.5 - 0.5 * aspectRatio);
  highp float distanceFromCenter;
  if(linear) {
    distanceFromCenter = abs((texCoordToUse.x - excludePoint.x) * aspectRatio * cos(angle) +
      (texCoordToUse.y - excludePoint.y) * sin(angle));
  } else {
    distanceFromCenter = distance(excludePoint, texCoordToUse);
  }
  gl_FragColor = mix(sharpImageColor, blurredImageColor,
    smoothstep(excludeSize - excludeBlurSize, excludeSize, distanceFromCenter));
}`;
