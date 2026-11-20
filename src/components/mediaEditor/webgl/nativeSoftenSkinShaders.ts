/** Telegram Android 21f7d109da6ab3506c9e9577f98c6a38771ab335,
 * FilterShaders.java:28–124,159–287,430–443,788–945,1722–1864.
 * Ordinary photo sampler2D variants, no HDR/video extensions. Keep lowp and
 * six-decimal Java shader emission: these are part of the reference, not knobs.
 */
export const skinVertex = `attribute vec4 position;
attribute vec2 inputTexCoord;
varying vec2 vTextureCoord;
varying vec2 texCoord2;
void main() {
  gl_Position = position;
  vTextureCoord = inputTexCoord;
  texCoord2 = inputTexCoord;
}`;

export const skinSingleVertex = `attribute vec4 position;
attribute vec2 inputTexCoord;
varying vec2 vTextureCoord;
void main() {
  gl_Position = position;
  vTextureCoord = inputTexCoord;
}`;

export const skinOverlayFragment = `
precision lowp float;
varying highp vec2 vTextureCoord;
uniform sampler2D sTexture;
void main() {
  vec4 inp = texture2D(sTexture, vTextureCoord);
  vec4 image = vec4(inp.rgb * pow(2.0, -1.0), inp.w);
  vec4 base = vec4(image.g, image.g, image.g, 1.0);
  vec4 overlay = vec4(image.b, image.b, image.b, 1.0);
  float ba = 2.0 * overlay.b * base.b + overlay.b * (1.0 - base.a) + base.b * (1.0 - overlay.a);
  gl_FragColor = vec4(ba,ba,ba,image.a);
}`;

export const skinHighpassFragment = `precision lowp float;
varying highp vec2 vTextureCoord;
varying highp vec2 texCoord2;
uniform sampler2D sTexture;
uniform sampler2D inputImageTexture2;
void main() {
  vec4 image = texture2D(sTexture, vTextureCoord);
  vec4 blurredImage = texture2D(inputImageTexture2, texCoord2);
  gl_FragColor = vec4((image.rgb - blurredImage.rgb + vec3(0.5,0.5,0.5)), image.a);
}`;

export const skinBoostFragment = `precision lowp float;
varying highp vec2 vTextureCoord;
uniform sampler2D sTexture;
void main() {
  vec4 color = texture2D(sTexture, vTextureCoord);
  float hardLightColor = color.b;
  for (int i = 0; i < 3; ++i)
  {
    if (hardLightColor < 0.5) {
      hardLightColor = hardLightColor * hardLightColor * 2.0;
    } else {
      hardLightColor = 1.0 - (1.0 - hardLightColor) * (1.0 - hardLightColor) * 2.0;
    }
  }
  float k = 255.0 / (164.0 - 75.0);
  hardLightColor = (hardLightColor - 75.0 / 255.0) * k;
  gl_FragColor = vec4(vec3(hardLightColor), color.a);
}`;

export const skinCompositeFragment = `
precision lowp float;
varying highp vec2 vTextureCoord;
varying highp vec2 texCoord2;
uniform sampler2D sTexture;
uniform sampler2D toneCurveTexture;
uniform sampler2D inputImageTexture3;
uniform lowp float mixturePercent;
void main() {
  vec4 image = texture2D(sTexture, vTextureCoord);
  vec4 mask = texture2D(inputImageTexture3, texCoord2);
  float redCurveValue = texture2D(toneCurveTexture, vec2(image.r, 0.0)).r;
  float greenCurveValue = texture2D(toneCurveTexture, vec2(image.g, 0.0)).g;
  float blueCurveValue = texture2D(toneCurveTexture, vec2(image.b, 0.0)).b;
  vec4 result = vec4(redCurveValue, greenCurveValue, blueCurveValue, image.a);
  vec4 tone = mix(image, result, mixturePercent);
  gl_FragColor = vec4(mix(image.rgb, tone.rgb, 1.0 - mask.b), 1.0);
}`;

export function createSkinGaussian(width: number) {
  const f = Math.fround;
  const sigma = Math.floor(f(f(width) * f(0.006)) + 0.5);
  // The pinned generator emits NaN for sigma=0. Do not silently repair its math.
  if(sigma < 1) throw new RangeError('Native skin Gaussian sigma=0 is undefined (width < 84)');
  let radius = Math.floor(Math.sqrt(-2 * sigma * sigma * Math.log(1 / 256 * Math.sqrt(2 * Math.PI * sigma * sigma))));
  radius += radius % 2;
  if(!Number.isFinite(radius) || radius < 0) throw new RangeError('Native skin Gaussian radius unsupported');
  const weights: number[] = [];
  let sum = 0;
  for(let i = 0; i <= radius; ++i) {
    weights[i] = f(1 / Math.sqrt(2 * Math.PI * sigma * sigma) * Math.exp(-i * i / (2 * sigma * sigma)));
    sum = f(sum + (i ? 2 * weights[i] : weights[i]));
  }
  weights.forEach((weight, i) => weights[i] = f(weight / sum));
  const pairs = Array.from({length: radius / 2}, (_, i) => {
    const a = weights[2 * i + 1], b = weights[2 * i + 2], weight = f(a + b);
    return {weight, offset: f(f(f(a * (2 * i + 1)) + f(b * (2 * i + 2))) / weight)};
  });
  const count = Math.min(pairs.length, 7), decimal = (v: number) => v.toFixed(6);
  let vertex = `attribute vec4 position;
attribute vec4 inputTexCoord;
uniform float texelWidthOffset;
uniform float texelHeightOffset;
varying vec2 blurCoordinates[${1 + count * 2}];
void main()
{
gl_Position = position;
vec2 singleStepOffset = vec2(texelWidthOffset, texelHeightOffset);
blurCoordinates[0] = inputTexCoord.xy;
`;
  let fragment = `uniform sampler2D sTexture;
uniform highp float texelWidthOffset;
uniform highp float texelHeightOffset;
varying highp vec2 blurCoordinates[${1 + count * 2}];
void main()
{
lowp vec4 sum = vec4(0.0);
sum += texture2D(sTexture, blurCoordinates[0]) * ${decimal(weights[0])};
`;
  pairs.forEach((pair, i) => {
    const offset = decimal(pair.offset), weight = decimal(pair.weight);
    if(i < count) {
      vertex += `blurCoordinates[${2 * i + 1}] = inputTexCoord.xy + singleStepOffset * ${offset};\nblurCoordinates[${2 * i + 2}] = inputTexCoord.xy - singleStepOffset * ${offset};\n`;
      fragment += `sum += texture2D(sTexture, blurCoordinates[${2 * i + 1}]) * ${weight};\nsum += texture2D(sTexture, blurCoordinates[${2 * i + 2}]) * ${weight};\n`;
    } else {
      if(i === count) fragment += 'highp vec2 singleStepOffset = vec2(texelWidthOffset, texelHeightOffset);\n';
      fragment += `sum += texture2D(sTexture, blurCoordinates[0] + singleStepOffset * ${offset}) * ${weight};\nsum += texture2D(sTexture, blurCoordinates[0] - singleStepOffset * ${offset}) * ${weight};\n`;
    }
  });
  return {vertex: vertex + '}', fragment: fragment + 'gl_FragColor = sum;\n}\n', sigma, radius};
}

/** ToneCurve's fixed three-point natural spline, NOT the editor's adjustable
 * 200-sample curves. Identity channel offsets are exactly zero. The native byte
 * upload orders B,G,R,A; here those three curves are identical. Java truncates.
 */
export function createSkinToneLut() {
  const f = Math.fround, x = f(f(0.47) * 255), y = f(f(0.57) * 255);
  const second = ((f(255 - y) / f(255 - x)) - y / x) / (255 / 3);
  const bytes = new Uint8Array(256 * 4);
  for(let i = 0; i < 256; ++i) {
    const right = i >= Math.trunc(x);
    const startX = right ? x : 0, endX = right ? 255 : x;
    const startY = right ? y : 0, endY = right ? 255 : y;
    const t = f(i - startX) / f(endX - startX), a = 1 - t, h = f(endX - startX);
    const splineY = Math.min(255, Math.max(0, f(a * startY + t * endY + h * h / 6 * ((a * a * a - a) * (right ? second : 0) + (t * t * t - t) * (right ? 0 : second)))));
    const distance = f(splineY - i);
    const value = Math.trunc(Math.min(255, Math.max(0, f(i + distance))));
    bytes.set([value, value, value, 255], i * 4);
  }
  return bytes;
}
