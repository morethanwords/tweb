//# allFunctionsCalledOnLoad
import{n as e}from"./rolldown-runtime-CdcDxHOQ.js";import{A as t,M as n,j as r,k as i}from"./appDialogsManager-3veEpXl0.js";import{a,d as o,n as s,o as c,r as l,s as u,t as d}from"./geometry-DeM_O1fT.js";function f(e,t,n,r,i){let a=Math.min(1,Math.max(0,e));if(a===0||a===1)return a;let o=0,s=1;for(let e=0;e<18;e++){let e=(o+s)*.5,n=1-e;3*n*n*e*t+3*n*e*e*r+e*e*e<a?o=e:s=e}let c=(o+s)*.5,l=1-c;return 3*l*l*c*n+3*l*c*c*i+c*c*c}var p=12.6,m=.95/1.4,h=1.1,g=6*Math.PI,_=.8,v=[.17,.1],y=[5.3,8.9],b=class e{constructor(){this.yaw=0,this.pitch=d,this.isDragging=!1,this.zoom=1,this.targetYaw=0,this.targetPitch=d,this.rawPitchOffset=0,this.yawSpringVelocity=0,this.pitchSpringVelocity=0,this.yawVelocity=0,this.swayPhase=[Math.random()*2*Math.PI,Math.random()*2*Math.PI],this.swayScale=1,this.tilt=0,this.releaseDecay=0,this.spinVelocity=0,this.spinDecay=.7,this.lastDragTime=0,this.timeSinceRelease=10,this.tapRotation=null,this.spinAtPress=0}clone(){let t=Object.assign(new e,this);return t.swayPhase=this.swayPhase,t.tapRotation=this.tapRotation&&{...this.tapRotation},t}spin(e,t){this.spinVelocity+=e,this.spinDecay=Math.max(t,.05)}setSpin(e,t){this.isDragging||(this.tapRotation=null,this.spinVelocity=e,this.spinDecay=Math.max(t,.05))}sway(e){let t=v,n=2*Math.PI/y[0],r=2*Math.PI/y[1];return this.swayScale*(t[0]*Math.sin(n*e+this.swayPhase[0])+t[1]*Math.sin(r*e+this.swayPhase[1]))}fling(e,t){if(this.isDragging)return;let n=this.yawSpringVelocity;this.targetYaw=this.yaw,this.yawSpringVelocity=0,t?(this.yawVelocity=0,this.setSpin(e*t,.7)):this.startRotation(e,n,!0)}startRotation(e,t,n){this.tapRotation={velocity:t,boost:e*(n?p:3.36),decayTime:n?m:.85,responseTime:n?.08:.16,isFast:n},this.yawVelocity=0,this.timeSinceRelease=.75}begin(e){this.spinAtPress=this.spinVelocity,this.isDragging=!0,this.tapRotation=null,this.targetYaw=this.yaw,this.targetPitch=this.pitch;let t=Math.min(1.0990000000000002,Math.max(-1.1+.001,this.pitch-d));this.rawPitchOffset=t/(1-Math.abs(t)/h),this.yawSpringVelocity=0,this.pitchSpringVelocity=0,this.yawVelocity=0,this.spinVelocity=0,this.lastDragTime=e}drag(e,t,n,r){if(!this.isDragging)return;let i=Math.PI/Math.max(n,100),a=e*i;this.targetYaw+=a,this.rawPitchOffset+=t*i,this.targetPitch=d+this.rawPitchOffset/(1+Math.abs(this.rawPitchOffset)/h);let o=Math.max(1/240,Math.min(r-this.lastDragTime,.1));this.yawVelocity=Math.min(5,Math.max(-5,a/o)),this.lastDragTime=r}end(e,t=!1){this.isDragging=!1,this.timeSinceRelease=0,this.targetPitch=d,t||(this.pitchSpringVelocity-=2.6),this.releaseDecay>0&&!t&&e-this.lastDragTime<=.12&&(this.spinVelocity+=this.yawVelocity,this.spinDecay=this.releaseDecay,this.yawVelocity=0),(t||e-this.lastDragTime>.12)&&(this.yawVelocity=0),t&&(this.targetYaw=this.yaw,this.yawSpringVelocity=0,this.pitchSpringVelocity=0)}step(e,t,n){e=Math.min(Math.max(e,0),.05);let r=e;for(;r>0;){let e=Math.min(r,1/120),i=Math.max(0,n-r+e);if(!this.isDragging){this.timeSinceRelease+=e;let n=Math.exp(-4.2*e);this.targetYaw+=this.yawVelocity*(1-n)/4.2,this.yawVelocity*=n;let r=Math.exp(-e/this.spinDecay),i=this.spinVelocity*this.spinDecay*(1-r);this.spinVelocity*=r,Math.abs(this.spinVelocity)<.002&&(this.spinVelocity=0),this.targetYaw+=i,this.yaw+=i;let a,o=this.tapRotation;if(o){let n=o.velocity;o.boost*=Math.exp(-e/o.decayTime),o.velocity+=(t+o.boost-o.velocity)*(1-Math.exp(-e/o.responseTime)),Math.abs(o.boost)<.001&&Math.abs(o.velocity-t)<.001&&(o.boost=0,o.velocity=t),a=(n+o.velocity)*.5*e}else a=t*e;let s=a*Math.min(this.timeSinceRelease/.75,1);this.targetYaw+=s,this.yaw+=s}this.isDragging||(this.targetPitch=d+this.sway(i)+this.tilt);let a=g*g,o=2*_*g;this.yawSpringVelocity+=((this.targetYaw-this.yaw)*a-o*this.yawSpringVelocity)*e,this.pitchSpringVelocity+=((this.targetPitch-this.pitch)*a-o*this.pitchSpringVelocity)*e,this.yaw+=this.yawSpringVelocity*e,this.pitch+=this.pitchSpringVelocity*e,r=Math.max(0,r-e)}let i=Math.trunc(this.yaw/(2*Math.PI));this.yaw-=i*2*Math.PI,this.targetYaw-=i*2*Math.PI}};function x(e){if(e===0||e===1)return e;let t=0,n=1;for(let r=0;r<16;r++){let r=(t+n)*.5,i=1-r;1.5*i*i*r+1.5*i*r*r+r*r*r<e?t=r:n=r}let r=(t+n)*.5;return r*r*(3-2*r)}var S=[-115.8,40.3,-279.3,240.6],C=[317,-341.9,188,-131.9],w=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n,e[3]+(t[3]-e[3])*n];function T(e,t){for(let n=1;n<t.length;n++)if(e<t[n]){let r=f((e-t[n-1])/(t[n]-t[n-1]),.333,0,.667,1);return n%2==1?w(S,C,r):w(C,S,r)}return t.length%2==0?C:S}var E=[[-53.8,112.9,50.5,-54.2],[12,53.4,143.3,-112.9],[-126.9,168.8,190.3,-192.8],[-53.8,112.9,50.5,-54.2]],D=[[-53.8,80.7,10.8,-165.2],[-34.2,23.1,104.6,-191],[-147.9,125.5,-9.9,-106.1],[-53.8,80.7,10.8,-165.2]],O=[-.05,.84,-.88,-.05];function k(e){let t=Math.max(0,e*60)%180,n=Math.max(0,e*60*.5)%180,r=[0,39,99,179],i=t<39?0:t<99?1:2,a=x(Math.min(1,Math.max(0,(t-r[i])/(r[i+1]-r[i])))),o;return o=t<25?.45*t/25:t<142?.45:.45*Math.max(0,(166-t)/24),{crown:w(E[i],E[i+1],a),pavilion:w(D[i],D[i+1],a),sweep:[O[i]+(O[i+1]-O[i])*a,t/180*2*Math.PI,o,0],crownSweep:T(n,[11,49,127,179]),rightCrownSweep:T(n,[6,44,88]),leftCrownSweep:T(n,[0,38,118,167]),pavilionSweep:T(n,[0,38,103,163]),rightPavilionSweep:T(n,[5,43,92]),leftPavilionSweep:T(n,[0,38,112,168])}}var A=(e,t,n=.333,r=0,i=.667,a=1)=>({frame:e,value:t,ox:n,oy:r,ix:i,iy:a}),j=[A(0,1,.333,0,.833,.833),A(22.123,0,.167,0,.833,1),A(83,0,.41,0,.12,1),A(120,1)],M=[A(0,0,.167,.167,.833,.833),A(12,1,.167,.167,.833,.833),A(102,1,.167,.167,.4,1),A(120,0)],N=[A(0,1),A(12.066,1),A(23.463,.8),A(33.52,1),A(43.576,.8),A(60.336,1),A(70.391,.8),A(80.447,1),A(90.502,.8),A(114.637,1)],P=[A(5.363,1),A(17.43,1),A(28.826,.8),A(38.883,1),A(48.939,.8),A(65.699,1),A(75.754,.8),A(85.811,1),A(95.865,.8),A(120,1)];function F(e,t){if(!(t>e[0].frame))return e[0].value;for(let n=1;n<e.length;n++)if(t<e[n].frame){let r=e[n-1],i=e[n],a=f((t-r.frame)/(i.frame-r.frame),r.ox,r.oy,r.ix,r.iy);return r.value+(i.value-r.value)*a}return e[e.length-1].value}function I(e){let t=Math.max(0,e*60)%180*121/180;return{shape:[F(j,t),F(M,t),F(N,t),1],haloScale:F(P,t)}}function L(e,t){let n=d,r=[0,-Math.sin(n),Math.cos(n)],i=-1,a=0;for(let t=0;t<4;t++){let n=t*Math.PI/2,s=o.transformDirection(e,[Math.sin(n),0,Math.cos(n)]),c=s[0]*r[0]+s[1]*r[1]+s[2]*r[2];c>i&&(i=c,a=n)}let s=e=>{let t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)},c=Math.PI*12/180,l=Math.acos(Math.min(1,Math.max(-1,i))),u=2*c/Math.max(Math.abs(t),.001);return{faceRotation:a,visibility:s(1-l/c)*s((u-.06)/.34)}}var R=`
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
`,z=`#version 300 es
precision highp float;
${R}
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
}`,B=`#version 300 es
precision highp float;
${R}
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
}`,V=`#version 300 es
precision highp float;
${R}
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
}`,H=`#version 300 es
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
}`,U=`#version 300 es
precision highp float;
const vec2 corners[4] = vec2[4](vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1));
void main() { gl_Position = vec4(corners[gl_VertexID], 0, 1); }`,W=`#version 300 es
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
}`,G=6.4,K=`#version 300 es
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
}`,q=`#version 300 es
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
}`,ee=e({Appearance:()=>J,GemPose:()=>X,GemView:()=>$,defaultStyle:()=>Y}),J={blue:0,white:1,cool:2};function Y(){return{appearance:J.blue,rotationSpeed:0,sparkles:!0,refraction:.72,brightness:1,widthPoints:20,dragGrow:1,growDamping:.42,releaseDecay:0,swayScale:1,tilt:0,lean:0,leanFrequency:10.5,leanDamping:.55,backgroundStars:!1,starOpacity:1,starZoom:1,starEmission:1,burstSize:1,hideStone:!1,lightBackground:!1,verticalOffset:0,floatAmplitude:0,floatPeriod:3.2}}var X=class{constructor(){this.yaw=0,this.pitch=d,this.grow=1,this.time=0}},Z=null,Q=0;function te(){return Z||(Z=new re),++Q,Z}function ne(){--Q>0||!Z||(Q=0,Z.destroy(),Z=null)}var re=class{constructor(){let e=document.createElement(`canvas`);e.width=e.height=256;let n=t(e,{alpha:!0,premultipliedAlpha:!0,antialias:!0,depth:!0,preserveDrawingBuffer:!1,powerPreference:`high-performance`});this.canvas=e,this.gl=n;try{this.setup()}catch(e){throw r(n),e}}setup(){let e=this.gl,t=l();this.assets=t;let r=c(d,0),a=0,u=-1/0,f=t.vertices;for(let e=0;e<f.length;e+=10){let t=s(o.transformPoint(r,[f[e],f[e+1],f[e+2]]));a=Math.max(a,Math.abs(t[0])),u=Math.max(u,t[1])}this.facetProjection=[Math.cos(d),Math.sin(d),223.95/a,u],this.diamond=i(e,z,B),this.sparkle=i(e,V,H),this.lens=i(e,U,W),this.star=i(e,K,q),this.du=n(e,this.diamond),this.su=n(e,this.sparkle),this.lu=n(e,this.lens),this.tu=n(e,this.star),this.vertexCount=f.length/10,this.stoneVAO=e.createVertexArray(),e.bindVertexArray(this.stoneVAO);let p=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,p),e.bufferData(e.ARRAY_BUFFER,f,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,40,0),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,40,12),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,4,e.FLOAT,!1,40,24);let m=t=>{let n=e.createVertexArray();e.bindVertexArray(n);let r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,t,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,4,e.FLOAT,!1,20,0),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,1,e.FLOAT,!1,20,16),{vao:n,count:t.length/5}};this.mainSparkle=m(t.sparkles.main),this.smallSparkle=m(t.sparkles.small),this.emptyVAO=e.createVertexArray(),e.bindVertexArray(null),this.planes=new Float32Array(t.planes.flat()),this.anchorPositions=new Float32Array(t.anchors.flatMap(e=>[...e.position,1])),this.anchorNormals=new Float32Array(t.anchors.flatMap(e=>[...e.normal,0])),this.hull=new Float32Array(96)}texture(){let e=this.gl,t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(4)),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),t}draw(e){let t=this.gl,n=e.canvas.width,r=e.canvas.height;if(n<1||r<1)return;(this.canvas.width<n||this.canvas.height<r)&&(this.canvas.width=Math.max(this.canvas.width,n),this.canvas.height=Math.max(this.canvas.height,r));let i=this.canvas.height;t.viewport(0,0,n,r),t.disable(t.SCISSOR_TEST),t.clearColor(0,0,0,0),t.clearDepth(1),t.depthMask(!0),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA);let s=e.style,l=e.motion,d=e.elapsed,f=c(l.pitch,l.yaw+e.lean),p=a(n/r,Math.min(2.4,Math.max(.05,l.zoom*e.zoom()*e.grow))),m=s.verticalOffset;if(s.floatAmplitude&&s.floatPeriod>0&&(m+=s.floatAmplitude*Math.sin(2*Math.PI*d/s.floatPeriod)),m){let t=-2*m/e.cssSize;for(let e=0;e<4;++e)p[e*4+1]+=t*p[e*4+3]}let h=I(d),g=1/120,_=l.clone();_.step(g,s.rotationSpeed,d+g);let v=Math.atan2(Math.sin(_.yaw-l.yaw),Math.cos(_.yaw-l.yaw)),y=L(f,Math.hypot(v,_.pitch-l.pitch)/g),b=k(d);if(s.backgroundStars&&s.starOpacity>.001&&e.bursts.length){t.disable(t.DEPTH_TEST),t.disable(t.CULL_FACE),t.depthMask(!1),t.useProgram(this.star);let i=this.tu,a=u(n/r,Math.max(.2,s.starZoom));a[13]-=2*s.verticalOffset/e.cssSize,t.uniformMatrix4fv(i.u_projection,!1,a),t.uniform4f(i.u_appearance,s.appearance,0,0,0),t.uniform4f(i.u_tint,0,Math.min(1,Math.max(0,s.starOpacity)),Math.max(.05,s.starEmission),0),t.uniform1i(i.u_baseInstance,240),t.bindVertexArray(this.emptyVAO);let o=Math.max(1,Math.round(144*Math.min(1,Math.max(0,s.burstSize))));for(let a of e.bursts){let e=d-a.start;e<0||e>=6.4||(t.uniform4f(i.u_animation,e,d,1,+!!s.lightBackground),t.uniform4f(i.u_layout,n,r,240,a.seed),t.drawArraysInstanced(t.TRIANGLES,0,6,o))}t.depthMask(!0)}let x=e=>{t.uniformMatrix4fv(e.u_model,!1,f),t.uniformMatrix4fv(e.u_projection,!1,p),e.u_inverseModel&&t.uniformMatrix4fv(e.u_inverseModel,!1,o.transpose(f)),t.uniform4f(e.u_parameters,d,s.refraction,s.brightness,+!!s.sparkles),e.u_viewport&&t.uniform4f(e.u_viewport,n,r,17,0),e.u_sparkleShape&&t.uniform4fv(e.u_sparkleShape,h.shape),e.u_sparkleHalo&&t.uniform4f(e.u_sparkleHalo,h.haloScale,y.faceRotation,1,y.visibility),e.u_appearance&&t.uniform4f(e.u_appearance,s.appearance,0,0,0)};if(!s.hideStone){t.useProgram(this.diamond);let r=this.du;if(x(r),t.uniform4fv(r.u_crownGradient,b.crown),t.uniform4fv(r.u_pavilionGradient,b.pavilion),t.uniform4fv(r.u_lightSweep,b.sweep),t.uniform4fv(r.u_facetProjection,this.facetProjection),t.uniform4fv(r.u_crownSweep,b.crownSweep),t.uniform4fv(r.u_rightCrownSweep,b.rightCrownSweep),t.uniform4fv(r.u_leftCrownSweep,b.leftCrownSweep),t.uniform4fv(r.u_pavilionSweep,b.pavilionSweep),t.uniform4fv(r.u_rightPavilionSweep,b.rightPavilionSweep),t.uniform4fv(r.u_leftPavilionSweep,b.leftPavilionSweep),t.uniform4fv(r[`u_planes[0]`],this.planes),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.enable(t.CULL_FACE),t.cullFace(t.BACK),t.frontFace(t.CCW),t.bindVertexArray(this.stoneVAO),t.drawArrays(t.TRIANGLES,0,this.vertexCount),s.sparkles){t.disable(t.DEPTH_TEST),t.depthMask(!1),t.disable(t.CULL_FACE),t.useProgram(this.sparkle);let e=this.su;x(e),t.uniform4fv(e[`u_anchorPosition[0]`],this.anchorPositions),t.uniform4fv(e[`u_anchorNormal[0]`],this.anchorNormals),t.uniform1i(e.u_baseInstance,0),t.bindVertexArray(this.mainSparkle.vao),t.drawArrays(t.TRIANGLES,0,this.mainSparkle.count),t.uniform1i(e.u_baseInstance,1),t.bindVertexArray(this.smallSparkle.vao),t.drawArraysInstanced(t.TRIANGLES,0,this.smallSparkle.count,7)}let i=e.lensState;if(i&&e.textTexture&&i.hull.length>2&&i.strength>.002){t.disable(t.DEPTH_TEST),t.disable(t.CULL_FACE),t.useProgram(this.lens);let r=this.lu,a=i.hull,o=Math.min(48,a.length);this.hull.fill(0);for(let e=0;e<o;e++){let t=a[Math.floor(e*a.length/o)];this.hull[e*2]=t[0],this.hull[e*2+1]=t[1]}t.uniform2fv(r[`u_hull[0]`],this.hull),t.uniform1i(r.u_count,o),t.uniform2f(r.u_center,i.center[0],i.center[1]),t.uniform2f(r.u_canvas,e.cssSize,e.cssSize),t.uniform1f(r.u_pixelRatio,n/e.cssSize),t.uniform1f(r.u_strength,Math.min(1,i.strength)),t.uniform1f(r.u_spin,i.spin),t.uniform1f(r.u_textScale,i.textScale),t.uniform1f(r.u_textShift,i.textShift),t.uniform1f(r.u_opacity,(i.opacity??.65)*Math.min(1,i.strength)),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,e.textTexture),t.uniform1i(r.u_text,0),t.bindVertexArray(this.emptyVAO),t.drawArrays(t.TRIANGLE_STRIP,0,4)}}t.bindVertexArray(null);let S=e.ctx;S.clearRect(0,0,n,r),S.drawImage(this.canvas,0,i-r,n,r,0,0,n,r)}destroy(){r(this.gl),this.gl=null,this.assets=null}},$=class{constructor(e,t={}){this.destroyed=!1,this.tapStreak=0,this.stage=te(),this.canvas=e,this.ctx=e.getContext(`2d`),this.style={...Y(),...t},this.motion=new b,this.pose=new X,this.grow=1,this.growVelocity=0,this.lean=0,this.leanVelocity=0,this.elapsed=0,this.lastTime=null,this.cssSize=1,this.bursts=[],this.nextSeed=1,this.lensState=null,this.textTexture=null}setSize(e,t){this.cssSize=e;let n=Math.max(1,Math.round(e*t));(this.canvas.width!==n||this.canvas.height!==n)&&(this.canvas.width=n,this.canvas.height=n)}zoom(){return this.style.widthPoints*1.52/Math.max(this.cssSize,1)}setText(e){if(this.destroyed)return;let t=this.stage.gl;this.textTexture||(this.textTexture=this.stage.texture()),t.bindTexture(t.TEXTURE_2D,this.textTexture),t.pixelStorei(t.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e),t.pixelStorei(t.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1)}setLens(e){this.lensState=e}get isDragging(){return this.motion.isDragging}beginDrag(e){this.updateMotion(e),this.motion.begin(e)}drag(e,t,n){this.updateMotion(n),this.motion.drag(e,t,this.dragScale||this.cssSize,n)}endDrag(e,t,n=!1,r,i){this.updateMotion(t),this.motion.step(0,this.style.rotationSpeed,this.elapsed),this.motion.end(t,n),!n&&(r?this.tapSpin(r,t):Math.abs(e)>600&&(this.motion.fling(e<0?-1:1,i),this.burst()))}tapSpin(e,t){let n=this.motion.spinAtPress,r=Math.abs(n)>.5?Math.sign(n):e;this.tapStreak=this.lastTapTime!==void 0&&t-this.lastTapTime<1?this.tapStreak+1:1,this.lastTapTime=t;let i=Math.min(16,Math.max(Math.abs(n)+5,16*this.tapStreak/4)),a=i>=15.2;a&&(this.tapStreak=0),this.motion.setSpin(r*i,a?2.5:Math.max(this.style.releaseDecay,.05)),a&&this.burst()}kick(e,t=.7){this.motion.spin(e,t)}burst(){this.bursts.length>=3&&this.bursts.shift(),this.bursts.push({start:this.elapsed,seed:this.nextSeed}),this.nextSeed=(this.nextSeed+1)%65536}adopt(e){this.motion=e.motion.clone(),this.elapsed=e.elapsed,this.lean=e.lean,this.leanVelocity=e.leanVelocity,this.lastTime=e.lastTime}resetClock(){this.lastTime=null}updateMotion(e){let t=this.style;this.lastTime===null&&this.elapsed===0&&(this.lean=t.lean,this.leanVelocity=0);let n=this.lastTime===null?0:Math.min(Math.max(0,e-this.lastTime),.05);this.lastTime=e,this.elapsed+=n;let r=this.motion;r.swayScale=t.swayScale,r.tilt=t.tilt,r.releaseDecay=t.releaseDecay;let i=r.isDragging?t.dragGrow:1,a=n;for(;a>0;){let e=Math.min(a,1/240);this.growVelocity+=((i-this.grow)*196-2*t.growDamping*14*this.growVelocity)*e,this.grow+=this.growVelocity*e;let n=t.leanFrequency;n>0?(this.leanVelocity+=((t.lean-this.lean)*n*n-2*t.leanDamping*n*this.leanVelocity)*e,this.lean+=this.leanVelocity*e):(this.lean=t.lean,this.leanVelocity=0),a-=e}this.bursts=this.bursts.filter(e=>this.elapsed-e.start<G),r.step(n,t.rotationSpeed,this.elapsed),this.pose.yaw=r.yaw+this.lean,this.pose.pitch=r.pitch,this.pose.grow=this.grow,this.pose.time=this.elapsed}render(e){this.destroyed||(this.updateMotion(e),this.stage.draw(this))}destroy(){this.destroyed||(this.destroyed=!0,this.textTexture&&this.stage.gl.deleteTexture(this.textTexture),this.textTexture=null,this.lensState=null,this.bursts=[],this.stage=null,ne())}};export{f as i,$ as n,ee as r,J as t};
//# sourceMappingURL=stage-Rwbgw4Vp.js.map