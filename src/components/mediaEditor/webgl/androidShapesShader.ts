/**
 * TEST-ONLY reference, not imported by the editor.
 * TelegramMessenger/Telegram-Android@21f7d109da6ab3506c9e9577f98c6a38771ab335
 * TMessagesProj/src/main/java/org/telegram/ui/Components/Paint/ShaderSet.java
 * PAINT_SHAPE_FSH, whitespace-only transcription (including source quirks).
 * IQ distance functions: https://iquilezles.org/articles/distfunctions2d/
 * This is source equivalence, NOT an Android device pixel oracle.
 */
export const androidShapesSource = {
  repository: 'TelegramMessenger/Telegram-Android',
  revision: '21f7d109da6ab3506c9e9577f98c6a38771ab335',
  path: 'TMessagesProj/src/main/java/org/telegram/ui/Components/Paint/ShaderSet.java',
  symbol: 'PAINT_SHAPE_FSH'
} as const;

// PAINT_BLIT_VSH with its orthographic mvpMatrix resolved from the existing
// 0..2 position buffer to clip space. Texture/painting coordinates stay bottom-left.
export const androidShapesVertex = `
precision highp float;
attribute vec2 inPosition;
attribute vec2 inTexcoord;
varying vec2 varTexcoord;
void main(void) {
  gl_Position = vec4(inPosition - 1., 0., 1.);
  varTexcoord = inTexcoord;
}`;

export const androidShapesFragment = `
precision highp float;
varying vec2 varTexcoord;
uniform sampler2D texture;
uniform sampler2D mask;
uniform bool composite;
uniform int type;
uniform vec4 color;
uniform vec2 resolution;
uniform vec2 center;
uniform vec2 radius;
uniform float thickness;
uniform float rounding;
uniform float rotation;
uniform float arrowTriangleLength;
uniform vec2 middle;
uniform bool fill;
uniform bool clear;
float sdTriangle(in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0*clamp(dot(v0,e0)/dot(e0,e0), 0.0, 1.0), pq1 = v1 - e1*clamp(dot(v1,e1)/dot(e1,e1), 0.0, 1.0), pq2 = v2 - e2*clamp(dot(v2,e2)/dot(e2,e2), 0.0, 1.0);
  float s = e0.x * e2.y - e0.y * e2.x;
  vec2 d = min(min(vec2(dot(pq0, pq0), s*(v0.x*e0.y-v0.y*e0.x)),
                   vec2(dot(pq1, pq1), s*(v1.x*e1.y-v1.y*e1.x))),
                   vec2(dot(pq2, pq2), s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdBezier(vec2 A, vec2 B, vec2 C, vec2 P) {
  vec2 a=B-A,b=A-B*2.+C,c=a*2.,d=A-P;
  vec3 k=vec3(3.*dot(a,b),2.*dot(a,a)+dot(d,b),dot(d,a))/dot(b,b);
  float p=k.y-k.x*k.x/3., p3=p*p*p, q=k.x*(2.*k.x*k.x-9.*k.y)/27.+k.z, D=q*q+4.*p3/27.;
  if(D >= 0.) {
    float z=sqrt(D);
    vec2 x=(vec2(z,-z)-q)/2., uv=sign(x)*pow(abs(x),vec2(1./3.));
    float r=clamp(uv.x+uv.y-k.x/3.,0.,1.);
    return length(d+(c+b*r)*r);
  } else {
    float v=acos(-sqrt(-27./p3)*q/2.)/3., m=cos(v), n=sin(v)*1.73205;
    vec3 t=clamp(vec3(m+m,-n-m,n-m)*sqrt(-p/3.)-k.x/3.,0.,1.);
    return min(min(length(d+(c+b*t.x)*t.x),length(d+(c+b*t.y)*t.y)),length(d+(c+b*t.z)*t.z));
  }
}
vec4 blendOver(vec4 a, vec4 b) {
  float alpha = b.a + a.a * (1. - b.a);
  if(alpha <= 0.) return vec4(0.);
  return vec4((b.rgb * b.a + a.rgb * a.a * (1. - b.a)) / alpha, alpha);
}
void main(void) {
  vec4 dst = clear ? vec4(0.) : texture2D(texture, varTexcoord.st, 0.0);
  vec2 p = varTexcoord.st * resolution - center;
  float sdf;
  vec2 pp = p;
  p *= mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  if(type == 0) {
    sdf = length(p) - min(radius.x, radius.y);
  } else if(type == 1 || type == 3) {
    vec2 q = abs(p) - abs(radius) + rounding;
    sdf = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rounding;
  } else if(type == 2) {
    float n = 5.;
    float an = 3.141593 / float(n);
    vec2 acs = vec2(cos(an), sin(an)), ecs = vec2(cos(1.), sin(1.));
    float bn = mod(atan(p.x, -p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= min(radius.x, radius.y) * acs;
    p += ecs*clamp(-dot(p, ecs), 0.0, min(radius.x, radius.y) * acs.y / ecs.y);
    sdf = length(p) * sign(p.x);
  } else if(type == 4) {
    p += center;
    sdf = sdBezier(center, middle, radius, p) - thickness;
    vec2 ba = center - middle;
    float a = atan(ba.y, ba.x), g = 30. / 180. * 3.14, ar = sin(g) * arrowTriangleLength;
    vec2 ac = center + vec2(cos(a),sin(a)) * ar / 2.;
    sdf = min(sdf, max(0., sdTriangle(p, ac, ac+vec2(cos(a+3.14-g), sin(a+3.14-g))*ar, ac+vec2(cos(a+3.14+g), sin(a+3.14+g))*ar)));
    sdf += thickness;
  }
  if(type == 3) {
    vec2 c = middle-center;
    float a = atan(c.x, -c.y), r = min(radius.x, radius.y) / 2.;
    float k = rounding/2., bsdf = sdTriangle(pp+center, center-vec2(cos(a),sin(a))*r, center-vec2(cos(a-3.14),sin(a-3.14))*r, middle);
    float h = max(k-abs(sdf-bsdf), 0.)/k;
    sdf = min(sdf,bsdf)-h*h*h*k*(1.0/6.0);
  }
  if(fill && sdf < 0.) {
    sdf = 0.;
  }
  vec4 c = vec4(color.rgb, color.a * (1. - clamp((abs(sdf) - thickness), 0., 2.) / 2.));
  gl_FragColor = blendOver(dst, c);
  if(!composite) {
    gl_FragColor.rgb *= gl_FragColor.a;
  }
}`;
