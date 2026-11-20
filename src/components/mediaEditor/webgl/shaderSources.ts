import {NATIVE_CURVES_SAMPLE_COUNT} from '@components/mediaEditor/webgl/nativeCurves';

// FilterShaders.java:458–500, 21f7d109. UV row order is preserved in the FBO;
// the existing final vertex shader alone performs the canvas Y inversion.
export const nativeSharpenVertexSource = `
precision highp float;
attribute vec2 aPosition;
attribute vec2 aUv;
uniform vec2 uSize;
varying vec2 vUv;
varying vec2 vLeft;
varying vec2 vRight;
varying vec2 vTop;
varying vec2 vBottom;
void main() {
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
  vUv = aUv;
  vec2 dx = vec2(1.0 / uSize.x, 0.0);
  vec2 dy = vec2(0.0, 1.0 / uSize.y);
  vLeft = aUv - dx;
  vRight = aUv + dx;
  vTop = aUv + dy;
  vBottom = aUv - dy;
}`;

export const nativeSharpenFragmentSource = `
precision highp float;
uniform sampler2D uSource;
uniform float uStrength;
varying vec2 vUv;
varying vec2 vLeft;
varying vec2 vRight;
varying vec2 vTop;
varying vec2 vBottom;
void main() {
  vec4 result = texture2D(uSource, vUv);
  vec3 neighbours = texture2D(uSource, vLeft).rgb + texture2D(uSource, vRight).rgb
    + texture2D(uSource, vTop).rgb + texture2D(uSource, vBottom).rgb;
  result.rgb = result.rgb * (1.0 + 4.0 * uStrength) - neighbours * uStrength;
  gl_FragColor = result;
}`;

export const vertexShaderSource = `
precision highp float;

attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform float uAngle;
uniform float uScale;
uniform vec2 uFlip;
uniform vec2 uImageSize;
uniform vec2 uResolution;
uniform vec2 uTranslation;
uniform mat3 uPreviewAffine;
uniform float uPreviewAffineEnabled;

varying highp vec2 vTextureCoord;

void main(void) {
  vec2 position = aVertexPosition;
  // Center to 0,0
  position = position - uImageSize / 2.0;
  // Flip
  position = position * uFlip;
  // Scale
  position *= uScale;

  // Rotate
  vec2 rotation = vec2(sin(uAngle), cos(uAngle));
  position = vec2(
    position.x * rotation.y + position.y * rotation.x,
    position.y * rotation.y - position.x * rotation.x
  );

  // Go to canvas center
  position += uResolution / 2.0;

  // Translate and normalize
  position = ((position + uTranslation) / uResolution) * 2.0 - 1.0;

  if(uPreviewAffineEnabled > 0.5) {
    // Apply before clipping, from the same source domain as layers/brush points.
    vec2 source = (aVertexPosition - uImageSize / 2.0) * uFlip;
    position = ((uPreviewAffine * vec3(source, 1.0)).xy / uResolution) * 2.0 - 1.0;
  }

  gl_Position = vec4(position * vec2(1, -1), 0.0, 1.0);
  vTextureCoord = aTextureCoord;
}
`;

export const fragmentShaderSource = `
precision highp float;

varying highp vec2 vTextureCoord;

uniform vec2 uImageSize;

uniform sampler2D uSampler;

uniform vec2 uResolution;

uniform float uEnhance;
uniform float uSaturation;
uniform float uBrightness;
uniform float uContrast;
uniform float uWarmth;
uniform float uFade;
uniform float uShadows;
uniform float uHighlights;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpen;
uniform vec4 uTintShadows;
uniform vec4 uTintHighlights;
uniform vec4 uBlur;
uniform vec2 uBlurCenter;
uniform sampler2D uCurvesTexture;
uniform float uCurvesEnabled;
uniform float uNativeProcessing;
uniform float uOriginal;
uniform vec4 uCurve0;
uniform vec4 uCurve1;
uniform vec4 uCurve2;
uniform vec4 uCurve3;
uniform vec4 uCurve4;
uniform vec4 uCurveChannelsEnabled;

// Exact pre-versioned polynomial and selected-channel semantics (9c2bfa101).
vec4 legacyCurve(float value) {
  float p = clamp(value, 0.0, 1.0) * 4.0;
  vec4 a; vec4 b; vec4 c; vec4 d;
  if(p < 1.0) { a = uCurve0; b = uCurve0; c = uCurve1; d = uCurve2; }
  else if(p < 2.0) { a = uCurve0; b = uCurve1; c = uCurve2; d = uCurve3; }
  else if(p < 3.0) { a = uCurve1; b = uCurve2; c = uCurve3; d = uCurve4; }
  else { a = uCurve2; b = uCurve3; c = uCurve4; d = uCurve4; }
  float t = p - min(3.0, floor(p));
  return clamp(0.5 * (2.0*b + (c-a)*t + (2.0*a-5.0*b+4.0*c-d)*t*t + (3.0*b-a-3.0*c+d)*t*t*t), 0.0, 1.0);
}

vec3 applyLegacyCurves(vec3 color) {
  if(uCurvesEnabled < 0.5) return color;
  if(uCurveChannelsEnabled.a > 0.5) {
    float hi = max(max(color.r, color.g), color.b);
    float lo = min(min(color.r, color.g), color.b);
    float light = (hi + lo) * 0.5;
    float target = legacyCurve(light).a;
    // Preserve HSL hue/saturation while changing the master luminance curve.
    float chroma = hi - lo;
    float saturation = chroma / max(0.00001, 1.0 - abs(2.0 * light - 1.0));
    saturation *= smoothstep(0.0, 0.1, light) * (1.0 - smoothstep(0.8, 1.0, light));
    vec3 hue = (color - vec3(light)) / max(chroma, 0.00001);
    color = vec3(target) + hue * saturation * (1.0 - abs(2.0 * target - 1.0));
  }
  if(uCurveChannelsEnabled.r > 0.5) color.r = legacyCurve(color.r).r;
  if(uCurveChannelsEnabled.g > 0.5) color.g = legacyCurve(color.g).g;
  if(uCurveChannelsEnabled.b > 0.5) color.b = legacyCurve(color.b).b;
  return color;
}

// Android FilterShaders.java:544–607,623–636,683–685 (21f7d109).
vec3 rgbToHsl(vec3 color) {
  vec3 hsl;
  float lo = min(min(color.r, color.g), color.b);
  float hi = max(max(color.r, color.g), color.b);
  float delta = hi - lo;
  hsl.z = (hi + lo) / 2.0;
  if(delta == 0.0) {
    hsl.xy = vec2(0.0);
  } else {
    hsl.y = hsl.z < 0.5 ? delta / (hi + lo) : delta / (2.0 - hi - lo);
    vec3 deltaRgb = ((vec3(hi) - color) / 6.0 + delta / 2.0) / delta;
    if(color.r == hi) hsl.x = deltaRgb.b - deltaRgb.g;
    else if(color.g == hi) hsl.x = 1.0 / 3.0 + deltaRgb.r - deltaRgb.b;
    else hsl.x = 2.0 / 3.0 + deltaRgb.g - deltaRgb.r;
    if(hsl.x < 0.0) hsl.x += 1.0;
    else if(hsl.x > 1.0) hsl.x -= 1.0;
  }
  return hsl;
}

float hueToRgb(float f1, float f2, float hue) {
  if(hue < 0.0) hue += 1.0;
  else if(hue > 1.0) hue -= 1.0;
  if(6.0 * hue < 1.0) return f1 + (f2 - f1) * 6.0 * hue;
  if(2.0 * hue < 1.0) return f2;
  if(3.0 * hue < 2.0) return f1 + (f2 - f1) * (2.0 / 3.0 - hue) * 6.0;
  return f1;
}

vec3 hslToRgb(vec3 hsl) {
  if(hsl.y == 0.0) return vec3(hsl.z);
  float f2 = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.y * hsl.z;
  float f1 = 2.0 * hsl.z - f2;
  return vec3(hueToRgb(f1, f2, hsl.x + 1.0 / 3.0), hueToRgb(f1, f2, hsl.x), hueToRgb(f1, f2, hsl.x - 1.0 / 3.0));
}

vec4 curve(float value) {
  float index = floor(clamp(value / (1.0 / ${NATIVE_CURVES_SAMPLE_COUNT}.0), 0.0, ${NATIVE_CURVES_SAMPLE_COUNT - 1}.0));
  // Native LINEAR sampling is deliberately NOT at the texel center.
  return texture2D(uCurvesTexture, vec2(1.0 / ${NATIVE_CURVES_SAMPLE_COUNT}.0 * index, 0.0));
}

vec3 applyCurves(vec3 color) {
  if(uNativeProcessing < 0.5) return applyLegacyCurves(color);
  if(uCurvesEnabled < 0.5) return color;
  vec3 hsl = rgbToHsl(color);
  hsl.y = mix(0.0, hsl.y, smoothstep(0.0, 0.1, hsl.z) * (1.0 - smoothstep(0.8, 1.0, hsl.z)));
  hsl.z = curve(hsl.z).a;
  color = hslToRgb(hsl);
  return vec3(curve(color.r).r, clamp(curve(color.g).g, 0.0, 1.0), clamp(curve(color.b).b, 0.0, 1.0));
}

vec3 tintRaise(vec3 color) {
  return -0.003671 * color*color*color + 0.3842 * color*color + 0.3764 * color + 0.2515;
}

vec4 selectiveBlur(vec4 sharp) {
  if(uBlur.x < 0.5) return sharp;
  float aspect = uImageSize.y / uImageSize.x;
  vec2 delta = vTextureCoord - uBlurCenter;
  delta.y *= aspect;
  float distanceToCenter = uBlur.x < 1.5 ? length(delta) : abs(dot(delta, vec2(cos(uBlur.w), sin(uBlur.w))));
  float amount = smoothstep(max(0.0, uBlur.y - uBlur.z), uBlur.y, distanceToCenter);
  if(amount < 0.001) return sharp;
  vec4 blurred = vec4(0.0);
  float weight = 0.0;
  vec2 radius = vec2(0.012, 0.012 / aspect);
  for(int x = -2; x <= 2; x++) {
    for(int y = -2; y <= 2; y++) {
      float w = exp(-float(x*x+y*y) * 0.5);
      blurred += texture2D(uSampler, clamp(vTextureCoord + vec2(float(x), float(y)) * radius, 0.0, 1.0)) * w;
      weight += w;
    }
  }
  return mix(sharp, blurred / weight, amount);
}


// Constants

vec3 hsLuminanceWeighting = vec3(0.3, 0.3, 0.3);
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const vec3 luminosityFactor = vec3(0.2126, 0.7152, 0.0722);

const lowp float permTexUnit = 1.0 / 256.0;
const lowp float permTexUnitHalf = 0.5 / 256.0;
const lowp float grainsize = 2.3;


// Utils

highp vec3 rgbToYuv(vec3 rgb){
    highp float y = 0.299*rgb.r + 0.587*rgb.g + 0.114*rgb.b;
    return vec3(y, (rgb.b-y) / 1.772, (rgb.r-y) / 1.402);
}

highp vec3 yuvToRgb(vec3 yuv){
    highp float y = yuv.x;
    highp float u = yuv.y;
    highp float v = yuv.z;

    highp vec3 r = vec3(
        y + 1.402*v,
        y - (0.299 * 1.402 / 0.587)*v - (0.114 * 1.772 / 0.587)*u,
        y + 1.772*u
    );
    return r;
}

float colorLuminosity(vec3 color) {
  return dot(color, luminosityFactor);
}

float easeInOutSigmoid(float x, float k) {
  if(x > 0.5) return 1.0 - pow(2.0 - 2.0 * x, 1.0 / (1.0 - k)) * 0.5;
  return pow(2.0 * x, 1.0 / (1.0 - k)) * 0.5;
}

highp vec4 rnm(in highp vec2 tc) {
  highp float noise = sin(dot(tc,vec2(12.9898,78.233))) * 43758.5453;

  highp float noiseR = fract(noise)*2.0-1.0;
  highp float noiseG = fract(noise*1.2154)*2.0-1.0;
  highp float noiseB = fract(noise*1.3453)*2.0-1.0;
  highp float noiseA = fract(noise*1.3647)*2.0-1.0;

  return vec4(noiseR,noiseG,noiseB,noiseA);
}

highp float fade(in highp float t) {
  return t*t*t*(t*(t*6.0-15.0)+10.0);
}

highp float pnoise3D(in highp vec3 p) {
  highp vec3 pi = permTexUnit*floor(p)+permTexUnitHalf;
  highp vec3 pf = fract(p);

  // Noise contributions from (x=0, y=0), z=0 and z=1
  highp float perm00 = rnm(pi.xy).a ;
  highp vec3  grad000 = rnm(vec2(perm00, pi.z)).rgb * 4.0 - 1.0;
  highp float n000 = dot(grad000, pf);
  highp vec3  grad001 = rnm(vec2(perm00, pi.z + permTexUnit)).rgb * 4.0 - 1.0;
  highp float n001 = dot(grad001, pf - vec3(0.0, 0.0, 1.0));

  // Noise contributions from (x=0, y=1), z=0 and z=1
  highp float perm01 = rnm(pi.xy + vec2(0.0, permTexUnit)).a ;
  highp vec3  grad010 = rnm(vec2(perm01, pi.z)).rgb * 4.0 - 1.0;
  highp float n010 = dot(grad010, pf - vec3(0.0, 1.0, 0.0));
  highp vec3  grad011 = rnm(vec2(perm01, pi.z + permTexUnit)).rgb * 4.0 - 1.0;
  highp float n011 = dot(grad011, pf - vec3(0.0, 1.0, 1.0));

  // Noise contributions from (x=1, y=0), z=0 and z=1
  highp float perm10 = rnm(pi.xy + vec2(permTexUnit, 0.0)).a ;
  highp vec3  grad100 = rnm(vec2(perm10, pi.z)).rgb * 4.0 - 1.0;
  highp float n100 = dot(grad100, pf - vec3(1.0, 0.0, 0.0));
  highp vec3  grad101 = rnm(vec2(perm10, pi.z + permTexUnit)).rgb * 4.0 - 1.0;
  highp float n101 = dot(grad101, pf - vec3(1.0, 0.0, 1.0));

  // Noise contributions from (x=1, y=1), z=0 and z=1
  highp float perm11 = rnm(pi.xy + vec2(permTexUnit, permTexUnit)).a ;
  highp vec3  grad110 = rnm(vec2(perm11, pi.z)).rgb * 4.0 - 1.0;
  highp float n110 = dot(grad110, pf - vec3(1.0, 1.0, 0.0));
  highp vec3  grad111 = rnm(vec2(perm11, pi.z + permTexUnit)).rgb * 4.0 - 1.0;
  highp float n111 = dot(grad111, pf - vec3(1.0, 1.0, 1.0));

  // Blend contributions along x
  highp vec4 n_x = mix(vec4(n000, n001, n010, n011), vec4(n100, n101, n110, n111), fade(pf.x));

  // Blend contributions along y
  highp vec2 n_xy = mix(n_x.xy, n_x.zw, fade(pf.y));

  // Blend contributions along z
  highp float n_xyz = mix(n_xy.x, n_xy.y, fade(pf.z));

  return n_xyz;
}

lowp vec2 coordRot(in lowp vec2 tc, in lowp float angle) {
  lowp float rotX = ((tc.x * 2.0 - 1.0) * cos(angle)) - ((tc.y * 2.0 - 1.0) * sin(angle));
  lowp float rotY = ((tc.y * 2.0 - 1.0) * cos(angle)) + ((tc.x * 2.0 - 1.0) * sin(angle));
  rotX = rotX * 0.5 + 0.5;
  rotY = rotY * 0.5 + 0.5;
  return vec2(rotX,rotY);
}



// Adjustments
// Telegram Android 21f7d109 FilterShaders.toolsFragmentShaderCode / PhotoFilterView getters.
const float toolEpsilon = 0.005;

vec4 brightness(vec4 color, float value) {
  if(abs(value) <= toolEpsilon) return color;
  float mag = value * 1.045;
  float exppower = 1.0 + abs(mag);

  if (mag < 0.0) {
    exppower = 1.0 / exppower;
  }

  color.r = 1.0 - pow(1.0 - color.r, exppower);
  color.g = 1.0 - pow(1.0 - color.g, exppower);
  color.b = 1.0 - pow(1.0 - color.b, exppower);

  return color;
}

vec4 contrast(vec4 color, float value) {
  value *= .3;
  return vec4(clamp(0.5 + (1.0 + value) * (color.rgb - 0.5), 0.0, 1.0), color.a);
}

vec4 saturation(vec4 color, float value) {
  if(value > 0.0) value *= 1.05;
  vec3 grayscale = vec3(colorLuminosity(color.rgb));
  return vec4(clamp(mix(grayscale, color.rgb, 1.0 + value), 0.0, 1.0), color.a);
}

vec4 warmth(vec4 color, float value) {
  if(abs(value) <= toolEpsilon) return color;
  highp vec3 yuvVec;

  if(value > 0.0) {
      yuvVec = vec3(0.1765, -0.1255, 0.0902);
  }
  else {
      yuvVec = -vec3(0.0588,  0.1569, -0.1255);
  }
  highp vec3 yuvColor = rgbToYuv(color.rgb);
  highp float luma = yuvColor.r;
  highp float curveScale = sin(luma * 3.14159);
  yuvColor += 0.375 * value * curveScale * yuvVec;

  return vec4(yuvToRgb(yuvColor), color.a);
}

vec4 fade(vec4 color, float value) {
  if(abs(value) <= toolEpsilon) return color;
  highp vec3 co1 = vec3(-0.9772);
  highp vec3 co2 = vec3(1.708);
  highp vec3 co3 = vec3(-0.1603);
  highp vec3 co4 = vec3(0.2878);

  highp vec3 comp1 = co1 * pow(color.rgb, vec3(3.0));
  highp vec3 comp2 = co2 * pow(color.rgb, vec3(2.0));
  highp vec3 comp3 = co3 * color.rgb;
  highp vec3 comp4 = co4;

  highp vec3 finalComponent = comp1 + comp2 + comp3 + comp4;
  highp vec3 faded = finalComponent + color.rgb * 0.1;

  return vec4((color.rgb * (1.0 - value)) + (faded * value), color.a);
}

vec4 highlights(vec4 color, float highlights, float shadows) {
  mediump float hsLuminance = dot(color.rgb, hsLuminanceWeighting);

  mediump float shadow = clamp((pow(hsLuminance, 1.0 / shadows) + (-0.76) * pow(hsLuminance, 2.0 / shadows)) - hsLuminance, 0.0, 1.0);
  mediump float highlight = clamp((1.0 - (pow(1.0 - hsLuminance, 1.0 / (2.0 - highlights)) + (-0.8) * pow(1.0 - hsLuminance, 2.0 / (2.0 - highlights)))) - hsLuminance, -1.0, 0.0);
  lowp vec3 hsresult = ((hsLuminance + shadow + highlight)) * (color.rgb / max(hsLuminance, 0.00001));

  mediump float contrastedLuminance = ((hsLuminance - 0.5) * 1.5) + 0.5;
  mediump float whiteInterp = contrastedLuminance * contrastedLuminance * contrastedLuminance;
  mediump float whiteTarget = clamp(highlights, 1.0, 2.0) - 1.0;
  hsresult = mix(hsresult, vec3(1.0), clamp(whiteInterp * whiteTarget, 0.0, 1.0));

  mediump float invContrastedLuminance = 1.0 - contrastedLuminance;
  mediump float blackInterp = invContrastedLuminance * invContrastedLuminance * invContrastedLuminance;
  mediump float blackTarget = 1.0 - clamp(shadows, 0.0, 1.0);
  hsresult = mix(hsresult, vec3(0.0), clamp(blackInterp * blackTarget, 0.0, 1.0));

  return vec4(hsresult.rgb, color.a);
}

vec4 vignette(vec4 color, float value) {
  if(abs(value) <= toolEpsilon) return color;
  vec2 coord = vTextureCoord.xy;

  const lowp float midpoint = 0.7;
  const lowp float fuzziness = 0.62;

  lowp float radDist = length(coord - 0.5) / sqrt(0.5);
  lowp float mag = easeInOutSigmoid(radDist * midpoint, fuzziness) * value * 0.645;
  color.rgb = mix(pow(color.rgb, vec3(1.0 / (1.0 - mag))), vec3(0.0), mag * mag);
  return color;
}

vec4 grain(vec4 color, float value) {
  if(abs(value) <= toolEpsilon) return color;
  vec2 coord = vTextureCoord.xy;

  highp vec3 rotOffset = vec3(1.425, 3.892, 5.835);
  highp vec2 rotCoordsR = coordRot(coord, rotOffset.x);
  highp vec3 noise = vec3(pnoise3D(vec3(rotCoordsR * vec2(uImageSize.x / grainsize, uImageSize.y / grainsize),0.0)));

  lowp vec3 lumcoeff = vec3(0.299,0.587,0.114);
  lowp float luminance = dot(color.rgb, lumcoeff);
  lowp float lum = smoothstep(0.2, 0.0, luminance);
  lum += luminance;

  noise = mix(noise,vec3(0.0),pow(lum,4.0));
  color.rgb = color.rgb + noise * value;
  return color;
}

vec4 sharpen(float value) {
  vec2 coord = vTextureCoord.xy;

  vec2 step = 1.0 / uImageSize.xy;

  vec3 texA = texture2D( uSampler, coord + vec2(-step.x, -step.y) * 1.5 ).rgb;
  vec3 texB = texture2D( uSampler, coord + vec2( step.x, -step.y) * 1.5 ).rgb;
  vec3 texC = texture2D( uSampler, coord + vec2(-step.x,  step.y) * 1.5 ).rgb;
  vec3 texD = texture2D( uSampler, coord + vec2( step.x,  step.y) * 1.5 ).rgb;

  vec3 around = value * (texA + texB + texC + texD);
  vec4 center = texture2D(uSampler, coord);

  float centerMultiplier = 1.0 + 4.0 * value;

  return vec4(clamp(center.rgb * centerMultiplier - around, 0.0, 1.0), center.a);
}



void main(void) {
  vec4 color = texture2D(uSampler, vTextureCoord);

  if(uOriginal > 0.5) {
    gl_FragColor = color;
    return;
  }

  // Original preview supplies zero adjustments: bypass every stage, including sharpening.
  if(uEnhance == 0.0 && uSharpen == 0.0 && uBrightness == 0.0 && uContrast == 0.0 &&
     uSaturation == 0.0 && uWarmth == 0.0 && uFade == 0.0 && uShadows == 0.0 &&
     uHighlights == 0.0 && uVignette == 0.0 && uGrain == 0.0 && uBlur.x < 0.5 &&
     uCurvesEnabled < 0.5 && uTintShadows.a == 0.0 && uTintHighlights.a == 0.0) {
    gl_FragColor = color;
    return;
  }

  // Still approximate: source-based blur/sharpen and Enhance's coupled preset are not
  // Android's skin / histogram Enhance / sharpen / tools / final selective-blur passes.
  // Versioned photos already sharpened into RGBA8; native video skips sharpen.
  // Enhance and selective blur remain legacy approximations in this slice.
  color = selectiveBlur(uNativeProcessing > 0.5 ? color : sharpen(uSharpen * 0.45 + uEnhance * .15));
  color.rgb = applyCurves(color.rgb);

  color = highlights(color, (uHighlights + uEnhance * 0.15) * 0.75 + 1.0, (uShadows - uEnhance * 0.075) * 0.55 + 1.0);
  color = contrast(color, uContrast + uEnhance * 0.1);
  color = fade(color, uFade);
  color = saturation(color, uSaturation + uEnhance * .2);

  color.rgb = clamp(mix(color.rgb, mix(color.rgb, tintRaise(color.rgb), uTintShadows.rgb), uTintShadows.a), 0.0, 1.0);
  color.rgb = clamp(mix(color.rgb, mix(color.rgb, 1.0 - tintRaise(1.0 - color.rgb), 1.0 - uTintHighlights.rgb), uTintHighlights.a), 0.0, 1.0);

  color = brightness(color, uBrightness + uEnhance * .25);
  color = warmth(color, uWarmth);
  color = grain(color, uGrain * 0.04);
  color = vignette(color, uVignette);

  gl_FragColor = color;
}
`;
