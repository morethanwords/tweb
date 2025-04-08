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
    return vec3(y, 0.493*(rgb.b-y), 0.877*(rgb.r-y));
}

highp vec3 yuvToRgb(vec3 yuv){
    highp float y = yuv.x;
    highp float u = yuv.y;
    highp float v = yuv.z;
    
    highp vec3 r = vec3(
        y + 1.0/0.877*v,
        y - 0.39393*u - 0.58081*v,
        y + 1.0/0.493*u
    );
    return r;
}

float colorLuminosity(vec3 color) {
  return dot(color, luminosityFactor);
}

float easeInOutSigmoid(float x, float k) {
  x = clamp(x, 0.0, 1.0);
  float sigmoid = 1.0 / (1.0 + exp(-k * (x - 0.5)));
  return sigmoid;
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

vec4 brightness(vec4 color, float value) {
  float mag = value * 1.045;
  float exppower = 1.0 + abs(mag);

  if (mag < 0.0) {
    exppower = 1.0 / exppower;
  }

  color.r = 1.0 - pow((1.0 - color.r), exppower);
  color.g = 1.0 - pow((1.0 - color.g), exppower);
  color.b = 1.0 - pow((1.0 - color.b), exppower);
  return color;
}

vec4 contrast(vec4 color, float value) {
  value *= .3;
  return vec4(clamp(0.5 + (1.0 + value) * (color.rgb - 0.5), 0.0, 1.0), color.a);
}

vec4 saturation(vec4 color, float value) {
  vec3 grayscale = vec3(colorLuminosity(color.rgb));
  return vec4(mix(grayscale, color.rgb, 1.0 + value), color.a);
}

vec4 warmth(vec4 color, float value) {
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

  return vec4(clamp(yuvToRgb(yuvColor), 0.0, 1.0), color.a);
}

vec4 fade(vec4 color, float value) {
  highp vec3 co1 = vec3(-0.9772);
  highp vec3 co2 = vec3(1.708);
  highp vec3 co3 = vec3(-0.1603);
  highp vec3 co4 = vec3(0.2878);
  
  highp vec3 comp1 = co1 * pow(color.rgb, vec3(3.0));
  highp vec3 comp2 = co2 * pow(color.rgb, vec3(2.0));
  highp vec3 comp3 = co3 * color.rgb;
  highp vec3 comp4 = co4;
  
  highp vec3 finalComponent = comp1 + comp2 + comp3 + comp4;
  highp vec3 difference = finalComponent - color.rgb;
  highp vec3 scalingValue = vec3(0.9);
  
  highp vec3 faded = color.rgb + (difference * scalingValue);
  
  return vec4((color.rgb * (1.0 - value)) + (faded * value), color.a);
}

vec4 highlights(vec4 color, float highlights, float shadows) {
  mediump float hsLuminance = dot(color.rgb, hsLuminanceWeighting);

  mediump float shadow = clamp((pow(hsLuminance, 1.0 / shadows) + (-0.76) * pow(hsLuminance, 2.0 / shadows)) - hsLuminance, 0.0, 1.0);
  mediump float highlight = clamp((1.0 - (pow(1.0 - hsLuminance, 1.0 / (2.0 - highlights)) + (-0.8) * pow(1.0 - hsLuminance, 2.0 / (2.0 - highlights)))) - hsLuminance, -1.0, 0.0);
  lowp vec3 hsresult = vec3(0.0, 0.0, 0.0) + ((hsLuminance + shadow + highlight) - 0.0) * ((color.rgb - vec3(0.0, 0.0, 0.0)) / (hsLuminance - 0.0));
  
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
  vec2 coord = vTextureCoord.xy;

  const lowp float midpoint = 0.7;
  const lowp float fuzziness = 0.62;
  
  lowp float radDist = length(coord - 0.5) / sqrt(0.5);
  lowp float mag = easeInOutSigmoid(radDist * midpoint, fuzziness) * value * 0.645;
  color.rgb = mix(pow(color.rgb, vec3(1.0 / (1.0 - mag))), vec3(0.0), mag * mag);
  return color;
}

vec4 grain(vec4 color, float value) {
  if(value < 0.001) return color;
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

  vec2 step = 1.0 / uResolution.xy;

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

  color = sharpen(uSharpen * 0.45 + uEnhance * .15);
  color = grain(color, uGrain * 0.04);
  color = saturation(color, uSaturation + uEnhance * .2);
  color = warmth(color, uWarmth);
  color = fade(color, uFade);
  
  color = highlights(color, (uHighlights + uEnhance * 0.15) * 0.75 + 1.0, (uShadows - uEnhance * 0.075) * 0.55 + 1.0);
  color = contrast(color, uContrast + uEnhance * 0.1);

  color = brightness(color, uBrightness + uEnhance * .25);
  color = vignette(color, uVignette);

  gl_FragColor = color;
}
`;
