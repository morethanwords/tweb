//# allFunctionsCalledOnLoad
import{i as e}from"./rolldown-runtime-CdcDxHOQ.js";import{a as t,u as n}from"./langPack-DI22e6Z_.js";import{C as r,M as i,N as a,g as o,i as s,j as c,p as l,s as u,y as d}from"./solid-B0Du5GQu.js";import{n as f,t as p}from"./appWindow-DIkXTT2w.js";import{_ as m,c as h,f as g,g as _,o as v,s as y,u as b}from"./web-FH1QzTRi.js";import{t as x}from"./liteMode-ChUmwLmV.js";import{t as ee}from"./classNames-HGN7N_ne.js";import{t as te}from"./iconTsx-BRufHQtf.js";import{t as S}from"./listenerSetter-CQfoiUkF.js";import{an as C,cn as w,tn as T}from"./confirmationPopup-CZd-YGdn.js";import{t as E}from"./BigInteger-C6lYLsys.js";import{A as D,M as O,j as k,k as ne,nt as A}from"./appDialogsManager-3veEpXl0.js";import{t as j}from"./clock-Cd61zBie.js";import{r as re,t as ie}from"./frameLoop-C7JaTr_Z.js";import{c as M,d as N,l as P,u as ae}from"./stream-DuDPqLWE.js";import{i as oe,r as se}from"./dom-iH783pfZ.js";import{c as F,i as ce,l as I,r as le,u as L}from"./geometry-DeM_O1fT.js";import{n as ue,t as de}from"./stage-Rwbgw4Vp.js";import{t as R}from"./wallet.module-gtqb9Jd2.js";import{t as z}from"./pull-DBZA4Ouj.js";var B=[[70,42],[272,148],[25,22],[210,178],[104,56],[203,133],[220,155],[52,21],[120,36],[51,67]],V=[.05,.63,.22,.87,.42,.12,.74,.33,.55,.94];function H(e=3){let t=document.createElement(`canvas`);t.width=Math.round(P.width*e),t.height=Math.round(P.height*e);let n=t.getContext(`2d`);return n.scale(e,e),B.forEach(([e,t],r)=>{let i=.8485;n.beginPath(),n.moveTo(e,t-4),n.lineTo(e+i,t-i),n.lineTo(e+4,t),n.lineTo(e+i,t+i),n.lineTo(e,t+4),n.lineTo(e-i,t+i),n.lineTo(e-4,t),n.lineTo(e-i,t-i),n.closePath(),n.fillStyle=`rgb(255, ${Math.round(V[r]*255)}, 0)`,n.fill()}),t}function U(){let e=625341585,t=()=>(e^=e<<13,e>>>=0,e^=e>>>17,e^=e<<5,e>>>=0,(e&65535)/65535),n=new Float32Array(65536);for(let e=0;e<n.length;e++)n[e]=t();let r=new Uint8Array(65536);for(let e=0;e<256;e++)for(let i=0;i<256;i++){let a=0;for(let t=-9;t<=9;t++)a+=n[e*256+(i+t+256)%256];let o=a/19;o=.5+(o-.5)*3.4;let s=.68*o+.32*t();r[e*256+i]=Math.max(0,Math.min(255,s*255))}return{data:r,size:256}}var W=`M20.5427 19.9812C21.0105 19.9812 21.4057 19.9802 21.7283 20.0066C22.0593 20.0336 22.3785 20.0931 22.6824 20.2478C23.1428 20.4824 23.5171 20.8577 23.7517 21.3181C23.9064 21.6219 23.9659 21.9412 23.9929 22.2722C24.0192 22.5947 24.0193 22.9903 24.0193 23.4578V24.8288C24.0193 25.2965 24.0192 25.6919 23.9929 26.0144C23.9658 26.3454 23.9065 26.6647 23.7517 26.9685C23.517 27.4288 23.1427 27.8032 22.6824 28.0378C22.3785 28.1926 22.0594 28.252 21.7283 28.279C21.4057 28.3054 21.0105 28.3054 20.5427 28.3054H19.1716C18.7039 28.3054 18.3086 28.3054 17.9861 28.279C17.655 28.252 17.3358 28.1926 17.032 28.0378C16.5716 27.8032 16.1963 27.4289 15.9617 26.9685C15.807 26.6648 15.7475 26.3453 15.7205 26.0144C15.6941 25.6919 15.6951 25.2965 15.6951 24.8288V23.4578C15.6951 22.9903 15.6942 22.5947 15.7205 22.2722C15.7475 21.9413 15.8071 21.6218 15.9617 21.3181C16.1963 20.8576 16.5715 20.4825 17.032 20.2478C17.3358 20.0931 17.6551 20.0336 17.9861 20.0066C18.3086 19.9803 18.7039 19.9812 19.1716 19.9812H20.5427ZM27.9568 25.6423C28.1965 25.6423 28.3173 25.6426 28.4089 25.6892C28.4893 25.7302 28.5544 25.7963 28.5955 25.8767C28.6421 25.9683 28.6423 26.0883 28.6423 26.3279V27.0994C28.6423 27.3393 28.6421 27.4598 28.5955 27.5515C28.5544 27.632 28.4894 27.6979 28.4089 27.739C28.3173 27.7857 28.1967 27.7859 27.9568 27.7859H27.1853C26.9459 27.7859 26.8257 27.7855 26.7341 27.739C26.6537 27.6979 26.5877 27.632 26.5466 27.5515C26.5001 27.4599 26.4997 27.3391 26.4997 27.0994V26.3279C26.4997 26.0883 26.5 25.9683 26.5466 25.8767C26.5877 25.7961 26.6536 25.7303 26.7341 25.6892C26.8257 25.6427 26.9458 25.6423 27.1853 25.6423H27.9568ZM33.0994 25.6423C33.3391 25.6423 33.4599 25.6426 33.5515 25.6892C33.632 25.7302 33.6979 25.7962 33.739 25.8767C33.7856 25.9683 33.7859 26.0885 33.7859 26.3279V27.0994C33.7859 27.3392 33.7856 27.4599 33.739 27.5515C33.6979 27.6321 33.6321 27.6979 33.5515 27.739C33.4599 27.7856 33.3392 27.7859 33.0994 27.7859H32.3279C32.0885 27.7859 31.9683 27.7856 31.8767 27.739C31.7962 27.6979 31.7302 27.632 31.6892 27.5515C31.6426 27.4599 31.6423 27.3391 31.6423 27.0994V26.3279C31.6423 26.0884 31.6426 25.9683 31.6892 25.8767C31.7303 25.7961 31.7961 25.7303 31.8767 25.6892C31.9683 25.6426 32.0884 25.6423 32.3279 25.6423H33.0994ZM19.1716 21.448C18.6796 21.448 18.3543 21.4482 18.1052 21.4685C17.8648 21.4882 17.7597 21.5225 17.697 21.5544C17.5127 21.6485 17.3623 21.7988 17.2683 21.9831C17.2364 22.0459 17.202 22.1513 17.1824 22.3913C17.1621 22.6403 17.1619 22.966 17.1619 23.4578V24.8288C17.1619 25.3207 17.162 25.6463 17.1824 25.8953C17.202 26.1347 17.2364 26.2397 17.2683 26.3025C17.3623 26.4867 17.5128 26.6372 17.697 26.7312C17.7598 26.7631 17.865 26.7975 18.1052 26.8171C18.3543 26.8375 18.6796 26.8386 19.1716 26.8386H20.5427C21.0348 26.8386 21.3601 26.8375 21.6091 26.8171C21.8491 26.7975 21.9536 26.7631 22.0164 26.7312C22.2008 26.6372 22.351 26.4869 22.4451 26.3025C22.477 26.2398 22.5114 26.1351 22.531 25.8953C22.5513 25.6463 22.5525 25.3207 22.5525 24.8288V23.4578C22.5525 22.966 22.5513 22.6403 22.531 22.3913C22.5114 22.1514 22.477 22.0459 22.4451 21.9831C22.351 21.7989 22.2007 21.6484 22.0164 21.5544C21.9536 21.5226 21.8488 21.4881 21.6091 21.4685C21.3601 21.4482 21.0348 21.448 20.5427 21.448H19.1716ZM30.5281 23.071C30.7678 23.071 30.8886 23.0714 30.9802 23.1179C31.0607 23.159 31.1266 23.225 31.1677 23.3054C31.2142 23.397 31.2136 23.5172 31.2136 23.7566V24.5281C31.2136 24.768 31.2144 24.8886 31.1677 24.9802C31.1266 25.0609 31.0609 25.1266 30.9802 25.1677C30.8886 25.2144 30.768 25.2136 30.5281 25.2136H29.7566C29.5172 25.2136 29.397 25.2142 29.3054 25.1677C29.225 25.1266 29.159 25.0607 29.1179 24.9802C29.0714 24.8886 29.071 24.7678 29.071 24.5281V23.7566C29.071 23.5171 29.0713 23.397 29.1179 23.3054C29.159 23.2248 29.2248 23.159 29.3054 23.1179C29.397 23.0713 29.5171 23.071 29.7566 23.071H30.5281ZM27.9568 20.4997C28.1965 20.4997 28.3173 20.5001 28.4089 20.5466C28.4893 20.5877 28.5544 20.6537 28.5955 20.7341C28.6421 20.8257 28.6423 20.9457 28.6423 21.1853V21.9568C28.6423 22.1967 28.6421 22.3173 28.5955 22.4089C28.5544 22.4892 28.4892 22.5544 28.4089 22.5955C28.3173 22.6421 28.1967 22.6423 27.9568 22.6423H27.1853C26.9457 22.6423 26.8257 22.6421 26.7341 22.5955C26.6537 22.5544 26.5877 22.4893 26.5466 22.4089C26.5001 22.3173 26.4997 22.1965 26.4997 21.9568V21.1853C26.4997 20.9458 26.5001 20.8257 26.5466 20.7341C26.5877 20.6536 26.6536 20.5877 26.7341 20.5466C26.8257 20.5001 26.9458 20.4997 27.1853 20.4997H27.9568ZM33.0994 20.4997C33.3391 20.4997 33.4599 20.5001 33.5515 20.5466C33.632 20.5877 33.6979 20.6537 33.739 20.7341C33.7855 20.8257 33.7859 20.9459 33.7859 21.1853V21.9568C33.7859 22.1967 33.7857 22.3173 33.739 22.4089C33.6979 22.4894 33.632 22.5544 33.5515 22.5955C33.4598 22.6421 33.3393 22.6423 33.0994 22.6423H32.3279C32.0883 22.6423 31.9683 22.6421 31.8767 22.5955C31.7963 22.5544 31.7302 22.4893 31.6892 22.4089C31.6426 22.3173 31.6423 22.1965 31.6423 21.9568V21.1853C31.6423 20.9458 31.6427 20.8257 31.6892 20.7341C31.7303 20.6536 31.7961 20.5877 31.8767 20.5466C31.9683 20.5 32.0883 20.4997 32.3279 20.4997H33.0994ZM20.5427 9.69506C21.0105 9.69506 21.4057 9.69411 21.7283 9.72045C22.0593 9.7475 22.3785 9.80692 22.6824 9.96166C23.1429 10.1963 23.517 10.5715 23.7517 11.032C23.9065 11.3359 23.9659 11.655 23.9929 11.9861C24.0192 12.3086 24.0193 12.7039 24.0193 13.1716V14.5427C24.0193 15.0106 24.0193 15.4057 23.9929 15.7283C23.9659 16.0595 23.9066 16.3784 23.7517 16.6824C23.517 17.1429 23.1429 17.517 22.6824 17.7517C22.3784 17.9066 22.0595 17.9659 21.7283 17.9929C21.4057 18.0193 21.0106 18.0193 20.5427 18.0193H19.1716C18.7039 18.0193 18.3086 18.0192 17.9861 17.9929C17.655 17.9659 17.3359 17.9065 17.032 17.7517C16.5715 17.517 16.1963 17.1429 15.9617 16.6824C15.8069 16.3785 15.7475 16.0593 15.7205 15.7283C15.6941 15.4057 15.6951 15.0105 15.6951 14.5427V13.1716C15.6951 12.7039 15.6941 12.3086 15.7205 11.9861C15.7475 11.6551 15.807 11.3358 15.9617 11.032C16.1963 10.5715 16.5715 10.1963 17.032 9.96166C17.3358 9.80697 17.6551 9.7475 17.9861 9.72045C18.3086 9.69413 18.7039 9.69506 19.1716 9.69506H20.5427ZM30.8288 9.69506C31.2965 9.69506 31.6919 9.69412 32.0144 9.72045C32.3453 9.74752 32.6648 9.80698 32.9685 9.96166C33.4289 10.1963 33.8032 10.5716 34.0378 11.032C34.1926 11.3358 34.252 11.655 34.279 11.9861C34.3054 12.3086 34.3054 12.7039 34.3054 13.1716V14.5427C34.3054 15.0105 34.3054 15.4057 34.279 15.7283C34.252 16.0594 34.1926 16.3785 34.0378 16.6824C33.8032 17.1427 33.4288 17.517 32.9685 17.7517C32.6647 17.9065 32.3454 17.9658 32.0144 17.9929C31.6919 18.0192 31.2965 18.0193 30.8288 18.0193H29.4578C28.9903 18.0193 28.5947 18.0192 28.2722 17.9929C27.9412 17.9659 27.6219 17.9064 27.3181 17.7517C26.8577 17.5171 26.4824 17.1428 26.2478 16.6824C26.0931 16.3785 26.0336 16.0593 26.0066 15.7283C25.9802 15.4057 25.9812 15.0105 25.9812 14.5427V13.1716C25.9812 12.7039 25.9803 12.3086 26.0066 11.9861C26.0336 11.6551 26.0931 11.3358 26.2478 11.032C26.4825 10.5715 26.8576 10.1963 27.3181 9.96166C27.6218 9.80709 27.9413 9.74749 28.2722 9.72045C28.5947 9.69416 28.9903 9.69506 29.4578 9.69506H30.8288ZM19.1716 11.1619C18.6796 11.1619 18.3543 11.162 18.1052 11.1824C17.8648 11.202 17.7597 11.2363 17.697 11.2683C17.5126 11.3623 17.3623 11.5126 17.2683 11.697C17.2363 11.7597 17.202 11.8648 17.1824 12.1052C17.162 12.3543 17.1619 12.6796 17.1619 13.1716V14.5427C17.1619 15.0348 17.162 15.3601 17.1824 15.6091C17.202 15.8488 17.2364 15.9536 17.2683 16.0164C17.3623 16.2007 17.5127 16.351 17.697 16.4451C17.7597 16.477 17.8648 16.5113 18.1052 16.531C18.3543 16.5513 18.6796 16.5525 19.1716 16.5525H20.5427C21.0348 16.5525 21.3601 16.5513 21.6091 16.531C21.8493 16.5114 21.9536 16.477 22.0164 16.4451C22.2009 16.351 22.351 16.2009 22.4451 16.0164C22.477 15.9536 22.5114 15.8493 22.531 15.6091C22.5513 15.3601 22.5525 15.0348 22.5525 14.5427V13.1716C22.5525 12.6796 22.5513 12.3543 22.531 12.1052C22.5113 11.8648 22.477 11.7597 22.4451 11.697C22.351 11.5127 22.2007 11.3623 22.0164 11.2683C21.9536 11.2364 21.8488 11.202 21.6091 11.1824C21.3601 11.162 21.0348 11.1619 20.5427 11.1619H19.1716ZM29.4578 11.1619C28.966 11.1619 28.6403 11.1621 28.3913 11.1824C28.1513 11.202 28.0459 11.2364 27.9831 11.2683C27.7988 11.3623 27.6485 11.5127 27.5544 11.697C27.5225 11.7597 27.4882 11.8648 27.4685 12.1052C27.4482 12.3543 27.448 12.6796 27.448 13.1716V14.5427C27.448 15.0348 27.4482 15.3601 27.4685 15.6091C27.4881 15.8488 27.5226 15.9536 27.5544 16.0164C27.6484 16.2007 27.7989 16.351 27.9831 16.4451C28.0459 16.477 28.1514 16.5114 28.3913 16.531C28.6403 16.5513 28.966 16.5525 29.4578 16.5525H30.8288C31.3207 16.5525 31.6463 16.5513 31.8953 16.531C32.1351 16.5114 32.2398 16.477 32.3025 16.4451C32.4869 16.351 32.6372 16.2008 32.7312 16.0164C32.7631 15.9536 32.7975 15.8491 32.8171 15.6091C32.8375 15.3601 32.8386 15.0348 32.8386 14.5427V13.1716C32.8386 12.6796 32.8375 12.3543 32.8171 12.1052C32.7975 11.865 32.7631 11.7598 32.7312 11.697C32.6372 11.5128 32.4867 11.3623 32.3025 11.2683C32.2397 11.2364 32.1347 11.202 31.8953 11.1824C31.6463 11.162 31.3207 11.1619 30.8288 11.1619H29.4578Z`;function G(e=8){let t=document.createElement(`canvas`);t.width=50*e,t.height=38*e;let n=t.getContext(`2d`);return n.scale(e,e),n.fillStyle=`#fff`,n.fill(new Path2D(W)),t}var K,q=`#version 300 es
precision highp float;
uniform vec4 u_front[4];   // face corners: bottom-left, bottom-right, top-left, top-right
uniform vec4 u_back[4];
uniform int u_slices;
uniform vec4 u_aa;         // layer pixels, card pixels
out vec2 v_uv;
out float v_layer;
void main() {
  int slices = max(u_slices, 0);
  bool face = gl_InstanceID >= slices;
  float depth = face ? 1.0 : float(gl_InstanceID) / float(max(slices - 1, 1));
  int id = gl_VertexID;
  vec4 p = mix(u_back[id], u_front[id], depth);
  vec2 uvs[4] = vec2[4](vec2(0, 1), vec2(1, 1), vec2(0, 0), vec2(1, 0));
  vec2 dirs[4] = vec2[4](vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1));
  // A quad slightly wider than the card — the shader antialiases the edge itself.
  const float inset = 2.0;
  vec2 ndc = p.xy / p.w + dirs[id] * inset * 2.0 / max(u_aa.xy, vec2(1));
  gl_Position = vec4(ndc * p.w, 0, p.w);
  v_uv = uvs[id] + vec2(dirs[id].x, -dirs[id].y) * inset / max(u_aa.zw, vec2(1));
  v_layer = face ? 2.0 : depth;
}`,J=`#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_highlightTilt;  // nod, turn — with the gyroscope and the idle sway
uniform vec2 u_surfaceTilt;    // nod, turn — without the idle sway
uniform vec2 u_size;           // the card in design points
uniform sampler2D u_stars;
uniform sampler2D u_noise;
uniform sampler2D u_qr;
uniform vec2 u_lensCenter;
uniform float u_lensStrength;
uniform float u_lensSpin;
uniform int u_lensCount;
uniform vec2 u_chip;       // the QR chip's alpha and blur: it fades with the card's details as the card folds
uniform float u_chipX;     // the chip's left edge: at the inline end, mirrored right to left with the card's text
uniform vec2 u_hull[48];
in vec2 v_uv;
in float v_layer;
out vec4 fragColor;

#define PI 3.14159265358979
const float RADIUS = 20.0;

float roundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - (halfSize - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec2 roundRectNormal(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - (halfSize - r);
  vec2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1, 0) : vec2(0, 1));
  return n * vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
}
float hash(float v) { return fract(sin(v * 127.1) * 43758.5453); }
vec3 linearToSrgb(vec3 v) {
  v = max(v, vec3(0));
  return mix(1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, v * 12.92, lessThanEqual(v, vec3(0.0031308)));
}

// The lens of the grown gem: inside its silhouette the metal is magnified and broken
// into facets that run with the gem's rotation. Maps a card point.
vec2 lensPoint(vec2 position) {
  int n = u_lensCount;
  if (n < 3 || u_lensStrength <= 0.001) return position;
  bool inside = false;
  float best = 1e9;
  float radius = 0.0;
  for (int i = 0, j = n - 1; i < 48; j = i++) {
    if (i >= n) break;
    vec2 a = u_hull[i], b = u_hull[j];
    if (((a.y > position.y) != (b.y > position.y)) &&
        (position.x < (b.x - a.x) * (position.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    vec2 e = b - a;
    float h = clamp(dot(position - a, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
    best = min(best, distance(position, a + e * h));
    radius = max(radius, distance(a, u_lensCenter));
  }
  if (!inside) return position;
  float edge = smoothstep(0.0, 4.0, best) * u_lensStrength;
  vec2 d = position - u_lensCenter;
  vec2 q = d / max(radius, 1.0);
  float u = (asin(clamp(q.x, -0.999, 0.999)) - u_lensSpin) / (PI / 4.0);
  float wave = sin(PI * u);
  float prism = sign(wave) * pow(abs(wave), 0.6);
  float crown = 1.0 - smoothstep(-0.25, 0.05, q.y);
  vec2 bend = vec2(prism * 0.12, mix(-0.08 * q.y, 0.09, crown)) * radius;
  float zoom = mix(0.84, 0.72, crown * (1.0 - smoothstep(0.2, 0.6, abs(q.x))));
  return u_lensCenter + d * mix(1.0, zoom, edge) + bend * edge;
}

// The conic gradient from the design: «from 90deg», transitions every quarter,
// with its own skew (matrix 6.95 -11.05 18.111 11.391). 0 — shade, 1 — highlight.
float lobe(vec2 p, float turn) {
  vec2 d = p - u_size * 0.5;
  float c = cos(turn), s = sin(turn);
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  mat2 m = inverse(mat2(6.95, -11.05, 18.111, 11.391));
  vec2 local = m * d;
  float t = atan(local.y, local.x) / (2.0 * PI);
  float f = 1.0 - abs(fract(2.0 * t) * 2.0 - 1.0);
  // In the middle the conic gradient converges to a point; in the design the
  // background blur smears it.
  return mix(0.5, f, smoothstep(0.0, 22.0, length(d)));
}

vec3 softLightWhite(vec3 b) {
  return mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, lessThanEqual(b, vec3(0.25)));
}

void main() {
  vec2 size = u_size;
  vec2 halfSize = size * 0.5;
  vec2 surface = clamp(vec2(u_surfaceTilt.y / 0.30, u_surfaceTilt.x / 0.20), vec2(-1), vec2(1));

  // The edge. A slice is filled whole, but only the ring outside the face shows —
  // the middle is not shaded at all.
  if (v_layer < 1.5) {
    float t = v_layer;
    vec2 p = v_uv * size - halfSize;
    float d = roundRect(p, halfSize, RADIUS);
    if (d < -9.0) discard;
    float aa = max(0.5 * fwidth(d), 0.001);
    float cover = 1.0 - smoothstep(-aa, aa, d);
    vec2 n = roundRectNormal(p, halfSize, RADIUS);
    // Light from above and slightly left: the top edge is lighter than the bottom.
    float diffuse = 0.5 + 0.5 * dot(n, normalize(vec2(-0.35, -1.0)));
    // The rim is a flat cut of blue metal, darker than the face.
    float lines = 1.0 + (hash(floor(t * 9.0) + 3.1) - 0.5) * 0.05;
    vec3 edge = vec3(0.016, 0.11, 0.46) * (0.62 + 0.62 * diffuse) * lines;
    vec2 along = vec2(-n.y, n.x);
    float run = dot(p, along) / max(halfSize.x, 1.0);
    float streak = exp(-pow((run - (surface.x * 0.9 - surface.y * 0.7)) / 0.38, 2.0));
    edge += vec3(0.30, 0.62, 1.0) * streak * 0.18 * (0.35 + 0.65 * diffuse);
    edge += vec3(0.30, 0.62, 1.0) * step(0.88, t) * (0.18 + 0.40 * diffuse);
    vec3 color = linearToSrgb(edge);
    fragColor = vec4(color * cover, cover);
    return;
  }

  // The card's edge follows the real point, the material — the point through the lens.
  vec2 edgePoint = v_uv * size;
  vec2 P = lensPoint(edgePoint);
  vec2 uv = P / size;

  // The highlight turns with the tilt — like the key light of the iOS card.
  vec2 nt = clamp(vec2(u_highlightTilt.y / 0.24, u_highlightTilt.x / 0.17), vec2(-1), vec2(1));
  float turn = -(nt.x * size.y / size.x + nt.y) * PI * 0.5;
  float f = lobe(P, turn);
  vec3 color = mix(vec3(51, 144, 236) / 255.0, vec3(73, 164, 255) / 255.0, f);

  // Brushed metal: thin rings from the centre and fibres — barely visible.
  vec2 cardPosition = vec2((uv.x - 0.5) * 2.0, (0.5 - uv.y) * 2.0 * size.y / size.x);
  float radius = length(cardPosition);
  float ringIndex = floor(radius * 117.0);
  float footprint = length(vec2(dFdx(radius), dFdy(radius))) * 0.65;
  float ringFilter = 1.0 - smoothstep(0.35, 1.10, footprint * 180.0);
  float waveFilter = 1.0 - smoothstep(1.15, 3.10, footprint * 560.0);
  float fine = mix(0.5, hash(ringIndex), ringFilter) + 0.35 * sin(radius * 364.0 + hash(ringIndex * 0.37) * 6.2831853) * waveFilter;
  float radialFinish = (fine - 0.5) * 0.05 * smoothstep(0.018, 0.090, radius);
  float brushed = texture(u_noise, uv * vec2(1.4, 8.0)).r;
  float medium = texture(u_noise, uv * vec2(4.0, 3.0)).r;
  float grain = texture(u_noise, uv * vec2(19.0, 13.0)).r;
  float variation = radialFinish * 0.22 * (0.6 + 0.8 * f) + (brushed - 0.5) * 0.020 + (medium - 0.5) * 0.020 + (grain - 0.5) * 0.010;
  color *= 1.0 + variation;

  // Stars — white in soft light, only inside the highlight, and slightly deeper than the face.
  vec2 parallax = vec2(clamp(u_surfaceTilt.y / 0.24, -1.0, 1.0), -clamp(u_surfaceTilt.x / 0.17, -1.0, 1.0)) * 4.0 / size;
  vec4 star = texture(u_stars, uv + parallax);
  float twinkle = 0.75 + 0.25 * sin(u_time * 1.7 + star.g * 6.2831853);
  float starAlpha = 0.5 * star.a * lobe(P + parallax * size, turn) * twinkle;
  color = mix(color, softLightWhite(color), starAlpha);

  vec2 pc = edgePoint - halfSize;
  float d = roundRect(pc, halfSize, RADIUS);
  // Inner shadow at the bottom: inset 0 -1px 1px rgba(0,0,0,.14).
  float lower = smoothstep(-1.0, 1.0, roundRect(pc + vec2(0, 1), halfSize, RADIUS));
  color *= 1.0 - 0.14 * lower;
  // The face's rim catches light — only while the card is being tilted.
  {
    float band = smoothstep(-1.1, -0.35, d);
    vec2 n = roundRectNormal(pc, halfSize, RADIUS);
    vec2 light = normalize(vec2(-0.45 - 0.9 * surface.x, -0.9 + 0.7 * surface.y));
    float lit = max(dot(n, light), 0.0);
    color += vec3(0.22, 0.42, 0.70) * band * lit * 0.35 * clamp(length(surface) * 1.6, 0.0, 1.0);
  }

  // The QR chip — as in the design: light 48×36 metal in a thin dark border.
  // Its gradient and glint follow the tilt.
  {
    vec2 origin = vec2(u_chipX - 1.0, 73);     // chip canvas 50×38
    vec2 center = vec2(u_chipX + 24.0, 92);
    const vec2 chipHalf = vec2(24, 18);
    vec2 local = P - center;
    float cd = roundRect(local, chipHalf, 8.0);
    float aa = max(0.6 * fwidth(cd), 0.001) + u_chip.y;
    float ring = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, cd)) * smoothstep(-aa, aa, cd);
    color = mix(color, vec3(0), 0.16 * ring * u_chip.x);
    if (cd < 1.0 + u_chip.y && u_chip.x > 0.0) {
      vec2 s = P - origin;
      vec2 a = vec2(5.2, 3.4), b = vec2(45.4, 34.0);
      float g = dot(s - a, b - a) / dot(b - a, b - a);
      g += -0.45 * surface.x + 0.35 * surface.y;
      vec3 metal = mix(vec3(253, 254, 255) / 255.0, vec3(187, 189, 192) / 255.0, clamp(g, 0.0, 1.0));
      vec3 chip = mix(color, metal, 0.88);
      // Conic glint: light on the left, shade on the right.
      vec2 l = s - vec2(25, 19);
      float t = fract(atan(-l.x / 0.024, l.y / 0.018) / (2.0 * PI) + 0.10 * surface.x - 0.06 * surface.y);
      float white = t < 0.06 ? 0.0 : (t < 0.25 ? (t - 0.06) / 0.19 : (t < 0.44 ? (0.44 - t) / 0.19 : 0.0));
      float black = t < 0.56 ? 0.0 : (t < 0.75 ? (t - 0.56) / 0.19 : (t < 0.94 ? (0.94 - t) / 0.19 : 0.0));
      chip = mix(chip, vec3(1), white * 0.36);
      chip = mix(chip, vec3(0), black * 0.12);
      // A sharp glint — while the card is being tilted.
      vec2 q = local / chipHalf;
      float across = dot(q, normalize(vec2(1.0, -0.45)));
      float slide = 0.10 + 0.95 * surface.x - 0.55 * surface.y;
      float sharp = exp(-pow((across - slide) / 0.12, 2.0));
      float soft = exp(-pow((across - slide) / 0.5, 2.0));
      float amount = clamp(length(surface) * 1.4, 0.0, 1.0);
      chip = mix(chip, vec3(1), (sharp * 0.30 + soft * 0.10) * amount);
      // The icon is pressed in: a light imprint one point lower, the icon itself on top.
      vec2 qrUV = s / vec2(50, 38);
      float ink = texture(u_qr, qrUV).a;
      float lip = texture(u_qr, qrUV - vec2(0, 1.0 / 38.0)).a;
      chip = mix(chip, vec3(1), 0.5 * lip * (1.0 - ink));
      chip = mix(chip, vec3(26) / 255.0, 0.5 * ink);
      float cover = (1.0 - smoothstep(-aa, aa, cd)) * u_chip.x;
      color = mix(color, chip, cover);
    }
  }

  float aa = max(0.5 * fwidth(d), 0.001);
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  fragColor = vec4(clamp(color, 0.0, 1.0) * coverage, coverage);
}`,Y=class e{constructor(e){this.canvas=e;let t=D(e,{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,powerPreference:`high-performance`});this.gl=t;try{this.setup()}catch(e){throw k(t),e}}setup(){let e=this.gl;this.program=ne(e,q,J),this.u=O(e,this.program),this.vao=e.createVertexArray();let t=(t,n,r)=>{let i=e.createTexture();return e.activeTexture(e.TEXTURE0+t),e.bindTexture(e.TEXTURE_2D,i),n(),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,r),i};e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),this.stars=t(0,()=>e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,H()),e.CLAMP_TO_EDGE);let n=U();e.pixelStorei(e.UNPACK_ALIGNMENT,1),this.noise=t(1,()=>e.texImage2D(e.TEXTURE_2D,0,e.R8,n.size,n.size,0,e.RED,e.UNSIGNED_BYTE,n.data),e.REPEAT),this.qr=t(2,()=>e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,G()),e.CLAMP_TO_EDGE),this.hull=new Float32Array(96)}setSize(t,n,r){let i=e.padding;this.cardWidth=t,this.cardHeight=n,this.pixelRatio=r;let a=Math.round((t+i*2)*r),o=Math.round((n+i*2)*r);(this.canvas.width!==a||this.canvas.height!==o)&&(this.canvas.width=a,this.canvas.height=o)}slices(t){let n=0;for(let e=0;e<4;e++){let r=t.front[e],i=t.back[e],a=(r[0]/r[3]-i[0]/i[3])*.5*this.canvas.width,o=(r[1]/r[3]-i[1]/i[3])*.5*this.canvas.height;n=Math.max(n,Math.hypot(a,o))}return n<=.35?0:Math.min(e.maxSlices,Math.ceil(n)+1)}render({time:e,highlightTilt:t,surfaceTilt:n,slab:r,lens:i,chip:a,chipX:o}){let s=this.gl,c=this.u;if(!s)return;s.viewport(0,0,this.canvas.width,this.canvas.height),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.useProgram(this.program),s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA);let l=this.slices(r);if(s.uniform4fv(c[`u_front[0]`],r.front.flat()),s.uniform4fv(c[`u_back[0]`],r.back.flat()),s.uniform1i(c.u_slices,l),s.uniform4f(c.u_aa,this.canvas.width,this.canvas.height,this.cardWidth*this.pixelRatio,this.cardHeight*this.pixelRatio),s.uniform1f(c.u_time,e),s.uniform2f(c.u_highlightTilt,t[0],t[1]),s.uniform2f(c.u_surfaceTilt,n[0],n[1]),s.uniform2f(c.u_size,P.width,P.height),s.uniform2f(c.u_chip,a?a[0]:1,a?a[1]:0),s.uniform1f(c.u_chipX,o),s.uniform1i(c.u_stars,0),s.uniform1i(c.u_noise,1),s.uniform1i(c.u_qr,2),i&&i.hull.length>2&&i.strength>.001){let e=i.hull,t=Math.min(48,e.length);for(let n=0;n<t;n++){let r=e[Math.floor(n*e.length/t)];this.hull[n*2]=r[0],this.hull[n*2+1]=r[1]}s.uniform2fv(c[`u_hull[0]`],this.hull),s.uniform1i(c.u_lensCount,t),s.uniform2f(c.u_lensCenter,i.center[0],i.center[1]),s.uniform1f(c.u_lensStrength,Math.min(1,i.strength)),s.uniform1f(c.u_lensSpin,i.spin)}else s.uniform1i(c.u_lensCount,0),s.uniform1f(c.u_lensStrength,0);s.bindVertexArray(this.vao),s.drawArraysInstanced(s.TRIANGLE_STRIP,0,4,l+1),s.bindVertexArray(null)}destroy(){this.gl&&(k(this.gl),this.gl=null)}};K=Y,K.padding=56,K.maxSlices=24;var X=e(E()),Z=.2,Q=.3,fe=.9,pe=.6,me=.16,he=2*Math.PI/26,ge=.12,$=e=>[.013*Math.sin(e*.5),.022*Math.sin(e*.37+1.6)],_e=class{constructor(e){this.destroyed=!1,this.mirrored=!1,this.root=e.root,this.bgCanvas=e.background,this.face=e.face,this.fold=e.fold,this.design=e.design,this.shadow=e.shadow,this.gemCanvas=e.gem,this.balanceRow=e.balance,this.amountRun=e.amount,this.fractionRun=e.fraction,this.runs=[e.amount,e.fraction,e.currency],this.fiat=e.fiat,this.background=new Y(this.bgCanvas);try{this.gem=new ue(this.gemCanvas,{appearance:de.white,widthPoints:P.gemWidth,rotationSpeed:he,dragGrow:2.6,growDamping:.62,releaseDecay:1.1})}catch(e){throw this.background.destroy(),e}this.outline=le().outline,this.gyro=[0,0],this.pan=[0,0],this.hover=[0,0],this.gemRoll=0,this.lastGemYaw=null,this.gemRate=0,this.panTilt=0,this.isPanning=!1,this.card=[0,0],this.depth=[0,0];let t=$(0);this.idle=t,this.highlight=[t[0],t[1]],this.scale=1,this.targetScale=1,this.elapsed=0,this.lastTime=null,this.fitScale=1,this.gemScale=1,this.width=0,this.height=0,this.collapse=0,this.scrollPitch=0,this.chip=[1,0],this.cardMatrix=F.identity(),this.pressedGem=!1,this.listenerSetter=new S,this.placeGem(),this.bindGestures(),this.bindMotion(),this.observeSize()}observeSize(){let e=()=>{if(this.destroyed)return;let e=this.root.clientWidth;if(!e)return;this.width=e,this.height=e*P.height/P.width,this.s=e/P.width,this.root.style.height=`${this.height}px`,this.root.style.setProperty(`--fold-camera`,`${650*e/361}px`),this.design.style.transform=`scale(${this.s})`,this.shadow.style.borderRadius=`${P.radius*this.s}px`;let t=oe();this.pixelRatio=t,this.background.setSize(this.width,this.height,t);let n=Y.padding;Object.assign(this.bgCanvas.style,{left:`${-n}px`,top:`${-n}px`,width:`${this.width+n*2}px`,height:`${this.height+n*2}px`}),this.gem.setSize(P.gemCanvas,t*this.s),this.gem.dragScale=P.gemCanvas*this.s,this.drawBalanceText()},t=new ResizeObserver(e);t.observe(this.root),this.listenerSetter.addCleanup(()=>t.disconnect()),e(),f().document.fonts?.ready.then(()=>{this.destroyed||this.drawBalanceText()})}placeGem(){let e=P.gemCanvas,[t,n]=this.gemCenter();Object.assign(this.gemCanvas.style,{width:`${e}px`,height:`${e}px`,left:`${t-e/2}px`,top:`${n-e/2}px`})}gemCenter(){return N(this.mirrored)}setMirrored(e){this.mirrored!==e&&(this.mirrored=e,this.placeGem(),this.stillFrame=void 0,this.destroyed||this.drawBalanceText())}drawBalanceText(){let e=P.gemCanvas,t=(this.pixelRatio||2)*(this.s||1),n=this.textCanvas||(this.textCanvas=document.createElement(`canvas`));n.width=Math.round(e*t),n.height=Math.round(e*t);let r=n.getContext(`2d`);r.setTransform(t,0,0,t,0,0),r.clearRect(0,0,e,e);let[i,a]=this.gemCenter(),o=i-e/2,s=a-e/2,c=null;for(let e of this.runs){let t=getComputedStyle(e);r.font=`${t.fontWeight} ${t.fontSize} ${t.fontFamily}`,r.fillStyle=t.color,r.textBaseline=`alphabetic`;let n=r.measureText(e.textContent),{x:i,y:a}=se(e,this.design);c===null&&(c=a+n.fontBoundingBoxAscent),r.fillText(e.textContent,i-o,c-s)}this.gem.setText(n)}setBalance(e){let t=(0,X.default)(e);this.balance?.equals(t)||(this.balance=t,this.shownBalance===void 0?(this.shownBalance=t,this.showBalance(t)):x.isAvailable(`motion`)?this.count={from:this.shownBalance,to:t,start:j.now()}:(this.count={from:t,to:t,start:0},this.endCount()))}endCount(){let e=this.count;e&&(this.count=null,this.shownBalance=e.to,this.showBalance(e.to),this.balanceRow.style.transform=``,this.drawBalanceText())}setFiatFormatter(e){this.fiatFormatter=e,this.shownBalance!==void 0&&this.showBalance(this.shownBalance)}setBalanceFormatter(e){this.balanceFormatter=e,this.shownBalance!==void 0&&(this.showBalance(this.shownBalance),this.count||this.drawBalanceText())}showBalance(e){let t=e.toString();if(this.balanceFormatter){let{whole:e,fraction:n}=this.balanceFormatter(t);this.amountRun.textContent=e,this.fractionRun.textContent=n}this.fiat.textContent=this.fiatFormatter?.(t)??``}stepBalance(e){let t=this.count;if(!t)return;let n=Math.min(1,(e-t.start)/1),r=Math.round((1-(1-n)**3)*1e6),i=n>=1?t.to:t.from.add(t.to.subtract(t.from).multiply(r).divide(1e6));this.shownBalance=i,this.showBalance(i);let a=n>=1?0:Math.sin(Math.PI*Math.min(1,n/.55))*(1-n)*.06;this.balanceRow.style.transform=a?`scale(${1-a})`:``,n>=1&&(this.count=null,this.drawBalanceText())}designPoint(e){let t=this.root.getBoundingClientRect();return[(e.clientX-t.left)/this.s,(e.clientY-t.top)/this.s]}gemHit(e){if(this.collapse>0)return!1;let[t,n]=this.gemCenter(),r=t+this.nudge(),i=n+.71;return Math.hypot(e[0]-r,e[1]-i)<=P.gemHitRadius}bindGestures(){let e=this.root,t=this.listenerSetter.add(e),n=null,r=null,i=null;t(`pointermove`,t=>{n||(e.style.cursor=x.isAvailable(`motion`)&&this.gemHit(this.designPoint(t))?`grab`:``)}),t(`pointerdown`,t=>{if(n||t.pointerType===`mouse`&&t.button!==0)return;if(!x.isAvailable(`motion`)){this.pressedGem=!1;return}this.requestGyro();try{e.setPointerCapture(t.pointerId)}catch{}let a=j.now();r=[t.clientX,t.clientY],i=new z(t,a),this.pressedGem=this.gemHit(this.designPoint(t)),this.pressedGem?(n=`gem`,e.style.cursor=`grabbing`,this.gem.beginDrag(a)):(n=`card`,this.isPanning=!0,this.targetScale=1.01),t.preventDefault()}),t(`pointermove`,e=>{if(!n)return;let t=j.now();if(n===`gem`){let[n,r]=i.move(e,t);this.gem.drag(n,r,t)}else{let t=240*Math.max(this.width/361,.01);this.pan[1]=I((e.clientX-r[0])/t*Q,Q),this.pan[0]=I(-(e.clientY-r[1])/t*Z,Z)}});let a=t=>{if(!n)return;let r=j.now();if(n===`gem`){let n=this.gemCenter()[0]+this.nudge(),a=i.isTap(t,r)&&x.isAvailable(`motion`)?this.designPoint(t)[0]<n?-1:1:void 0;this.gem.endDrag(i.velocity(t,r),r,t.type===`pointercancel`,a),e.style.cursor=`grab`}else this.isPanning=!1,this.targetScale=1;n=null};t(`pointerup`,a),t(`pointercancel`,a);let o=(e,t,n)=>{this.listenerSetter.addCleanup(p(e=>e,e,t,n))};o(`pointermove`,e=>{if(n||e.pointerType===`touch`)return;if(!x.isAvailable(`motion`)){this.hover=[0,0];return}let t=this.root.getBoundingClientRect();if(!t.width)return;let r=(e.clientX-t.left)/t.width*2-1,i=(e.clientY-t.top)/t.height*2-1;this.hover=[-.6*Z*i/Math.hypot(1,i),pe*Q*r/Math.hypot(1,r)]},{passive:!0}),this.listenerSetter.addCleanup(p(e=>e.document.documentElement,`pointerleave`,()=>this.hover=[0,0])),o(`blur`,()=>this.hover=[0,0])}bindMotion(){this.baseAttitude=null,this.onOrientation=e=>{if(e.beta==null||e.gamma==null)return;let t=e.beta*Math.PI/180,n=e.gamma*Math.PI/180;this.baseAttitude?(this.gyro[0]=I(-(t-this.baseAttitude[0])*fe,Z*.85),this.gyro[1]=I((n-this.baseAttitude[1])*fe,Q*.8)):this.baseAttitude=[t,n]},typeof DeviceOrientationEvent<`u`&&!DeviceOrientationEvent.requestPermission&&this.listenDeviceOrientation(),this.listenerSetter.addCleanup(p(e=>e.document,`visibilitychange`,()=>{this.baseAttitude=null,this.gyro=[0,0],this.resetClock()}))}listenDeviceOrientation(){this.listenerSetter.addCleanup(p(e=>e,`deviceorientation`,this.onOrientation))}requestGyro(){if(this.gyroAsked||typeof DeviceOrientationEvent>`u`)return;let e=DeviceOrientationEvent;e.requestPermission&&(this.gyroAsked=!0,e.requestPermission().then(e=>{e===`granted`&&!this.destroyed&&this.listenDeviceOrientation()}).catch(()=>{}))}resetClock(){this.lastTime=null,this.gem.resetClock()}nudge(){let e=P.gemWidth*this.gem.pose.grow/2*1.1*this.gemScale,t=Math.max(0,e+14*P.width/361-P.gemCenter[0]);return this.mirrored?-t:t}frame(e){if(this.destroyed||!this.width)return;if(!x.isAvailable(`motion`)){this.frameStill(e);return}this.stillFrame=void 0;let t=Math.min(Math.max(this.lastTime===null?0:e-this.lastTime,0),1/30);if(this.lastTime=e,this.elapsed+=t,this.stepBalance(e),!this.isPanning){let e=Math.exp(-t*4);this.pan[0]*=e,this.pan[1]*=e}this.idle=$(this.elapsed);let n=this.gem.pose.yaw;if(this.lastGemYaw!==null&&t>0){let e=n-this.lastGemYaw;e=Math.atan2(Math.sin(e),Math.cos(e)),this.gemRate+=(e/t-this.gemRate)*Math.min(1,t*3)}this.lastGemYaw=n;let r=this.gemRate-he*(this.gemRate>=0?1:-1),i=I(.006*(Math.abs(this.gemRate)>he*1.5?r:0),Q*.18);this.gemRoll+=(i-this.gemRoll)*(1-Math.exp(-t*2.5));let a=Math.min(1,Math.hypot(this.pan[0]/Z,this.pan[1]/Q));this.panTilt+=(a-this.panTilt)*(1-Math.exp(-t*8));let[o,s]=this.hover,c=this.pan[0]+o,l=this.pan[1]+s,[u,d]=this.gyro,[f,p]=this.idle,m=[I(c,Z),I(l+this.gemRoll,Q)],h=[I(u+c,.23),I(d+l+this.gemRoll,.32999999999999996)],g=[I(u+c+f,.23),I(d+l+this.gemRoll+p,.32999999999999996)],_=1-Math.exp(-t*8);for(let e=0;e<2;e++)this.card[e]+=(m[e]-this.card[e])*_,this.depth[e]+=(h[e]-this.depth[e])*_,this.highlight[e]+=(g[e]-this.highlight[e])*_;this.scale+=(this.targetScale-this.scale)*(1-Math.exp(-t*12)),this.render(e)}frameStill(e){let t=[this.width,this.pixelRatio,this.collapse,this.scrollPitch,this.chip[0],this.chip[1],this.mirrored].join();t!==this.stillFrame&&(this.stillFrame=t,this.endCount(),this.lastTime=null,this.pan=[0,0],this.hover=[0,0],this.card=[0,0],this.depth=[0,0],this.idle=$(this.elapsed),this.highlight=[this.idle[0],this.idle[1]],this.scale=this.targetScale=1,this.panTilt=this.gemRoll=this.gemRate=0,this.gem.resetClock(),this.render(e))}perspective(e,t){let n=this.width/361,r=F.identity();return r[11]=-1/(650*n),r=F.translate(r,-this.card[1]*3*n,this.card[0]*2.5*n),r=F.scale(r,t,t),r=F.rotate(r,e,1,0,0),r=F.rotate(r,this.card[1],0,1,0),r=F.rotate(r,this.card[1]*.05,0,0,1),r}project(e,t,n,r=0){let i=this.width/2,a=this.height/2,o=e-i,s=t-a,c=o*n[0]+s*n[4]+r*n[8]+n[12],l=o*n[1]+s*n[5]+r*n[9]+n[13],u=o*n[3]+s*n[7]+r*n[11]+n[15];return Math.abs(u)<1e-4&&(u=1e-4),[i+c/u,a+l/u,u]}edgeShift(e,t){let n=-P.thickness*this.s*this.scale,r=F.rotate(F.identity(),e,1,0,0);return r=F.rotate(r,t,0,1,0),[n*r[8],n*r[9]]}quad(e,t){let n=Y.padding,r=this.width+n*2,i=this.height+n*2,a=(a,o)=>{let s=this.project(a,o,e),c=(s[0]+t[0]+n)/r*2-1,l=1-(s[1]+t[1]+n)/i*2;return[c*s[2],l*s[2],0,s[2]]},o=this.width,s=this.height;return[a(0,s),a(o,s),a(0,0),a(o,0)]}setScroll(e,t){this.collapse=L(e),this.scrollPitch=L(t)}setChip(e,t){this.chip=[e,t]}setGemMirror(e){this.gemMirror=e?.getContext(`2d`),e&&(e.width=this.gemCanvas.width,e.height=this.gemCanvas.height)}render(e){let t=this.collapse,n=I(this.card[0],Z),r=n,i=this.scale,a=this.card[1],o=this.perspective(r,i);this.fitScale=1;let s=this.edgeShift(r,a),c=this.width/2,l=0;for(let[e,t]of[[0,0],[this.width,0],[0,this.height],[this.width,this.height]]){let n=this.project(e,t,o)[0];l=Math.max(l,Math.abs(n-c),Math.abs(n+s[0]-c))}l>c&&(this.fitScale=c/l,o=F.concat(o,F.scaling(this.fitScale,this.fitScale,1))),this.cardMatrix=o,this.projectedBottom=Math.max(...[[0,this.height],[this.width,this.height]].map(([e,t])=>this.project(e,t,o)[1]))+Math.max(0,s[1]*this.fitScale);let u=this.panTilt;this.gemScale=1+.16*u*u*(3-2*u);let d=this.nudge();this.gemCanvas.style.transform=`translate(${d}px, 0) scale(${this.gemScale})`;let f=F.css(o);this.face.style.transform=f,this.shadow.style.transform=f;let p=Math.max(0,Math.min(1,(this.scale-1)/.02)),m=Math.sin(Math.PI*t);this.shadow.style.opacity=String(Math.max(me*A(p),ge*m*m));let h=1-Math.min(1,t*8);this.gem.style.tilt=-n*1.1*h,this.gem.style.lean=a*1.1*h;let g=this.lens(d),_=[s[0]*this.fitScale,s[1]*this.fitScale],v=.75,y=A(Math.min(1,this.scrollPitch/.64))*Z;if(this.background.render({time:this.elapsed,highlightTilt:[I(this.highlight[0]+y,.23)+this.idle[0]*v,this.highlight[1]+this.idle[1]*v],surfaceTilt:[I(this.depth[0],.23),this.depth[1]],slab:{front:this.quad(o,[0,0]),back:this.quad(o,_)},lens:g&&g.card,chip:this.chip,chipX:ae(this.mirrored)}),this.gem.setLens(g&&g.gem),this.gem.render(e),this.gemMirror){let e=this.gemMirror.canvas;(e.width!==this.gemCanvas.width||e.height!==this.gemCanvas.height)&&(e.width=this.gemCanvas.width,e.height=this.gemCanvas.height),this.gemMirror.clearRect(0,0,e.width,e.height),this.gemMirror.drawImage(this.gemCanvas,0,0)}}lens(e){let t=this.gem.pose,n=(t.grow-1)/(this.gem.style.dragGrow-1);if(n<=.002)return null;let r=ce(this.outline,t.yaw,t.pitch,P.gemWidth*t.grow/2*.96);r.length>48&&(r=r.filter((e,t)=>t%Math.ceil(r.length/48)===0));let i=this.gemScale,[a,o]=this.gemCenter(),s=[a+e,o],c=P.gemCanvas/2;return{card:{center:s,hull:r.map(e=>[s[0]+e[0]*i,s[1]+e[1]*i]),strength:n,spin:t.yaw},gem:{center:[c,c],hull:r.map(e=>[c+e[0],c+e[1]]),strength:n,spin:t.yaw,textScale:i,textShift:e}}}destroy(){this.destroyed||(this.destroyed=!0,this.listenerSetter.removeAll(),this.count=null,this.gem.destroy(),this.background.destroy())}},ve=_(`<canvas>`),ye=_(`<div hidden aria-hidden=true><div><div><div></div><span><span></span><span></span><span>GRAM</span></span></div><div dir=ltr>`),be=_(`<div role=group><div><div></div><canvas aria-hidden=true></canvas><div><div><div></div><div><span></span><span><span></span><span></span><span>GRAM</span></span></div><div><span dir=ltr></span></div><div><span dir=auto></span></div><span class=sr-only></span><div><span dir=ltr></span></div><div><canvas aria-hidden=true>`),xe=_(`<br>`);function Se(e,t,n){return T(e,t,n,e===`0`?0:void 0)}function Ce(e){let f,p,_,y,S,T,E,D,O,k,ne,A,j,ae,oe,se,F,ce,[I,le]=r(!x.isAvailable(`animations`)),L,ue=e=>e||`—`,de=()=>{let{whole:t,fraction:n}=w(e.balance());A.textContent=t,j.textContent=n,se.textContent=ue(e.fiat())},z,B,V,H,U,W,G,K,q,J,Y=(()=>{var e=ye(),t=e.firstChild,n=t.firstChild,r=n.firstChild,i=r.nextSibling,a=i.firstChild,o=a.nextSibling,s=o.nextSibling,c=n.nextSibling,f=z;typeof f==`function`?m(f,e):z=e;var p=B;typeof p==`function`?m(p,t):B=t;var g=V;typeof g==`function`?m(g,n):V=n;var _=H;typeof _==`function`?m(_,r):H=r,h(r,l(u,{get when(){return!I()},get fallback(){return l(te,{icon:`gram_filled`,get class(){return R.cardGemFallback}})},get children(){var e=ve(),t=U;return typeof t==`function`?m(t,e):U=e,d(()=>v(e,R.flightGem)),e}}));var y=W;typeof y==`function`?m(y,i):W=i;var b=G;typeof b==`function`?m(b,a):G=a;var x=K;typeof x==`function`?m(x,o):K=o;var S=q;typeof S==`function`?m(S,s):q=s;var C=J;return typeof C==`function`?m(C,c):J=c,d(a=>{var l=R.flight,u=R.flightGroup,d=R.flightPrimary,f=R.flightIcon,p=ee(R.cardAmount,R.flightText),m=R.cardFraction,h=R.cardCurrency,g=ee(R.cardFiatText,R.flightSecondary);return l!==a.e&&v(e,a.e=l),u!==a.t&&v(t,a.t=u),d!==a.a&&v(n,a.a=d),f!==a.o&&v(r,a.o=f),p!==a.i&&v(i,a.i=p),m!==a.n&&v(o,a.n=m),h!==a.s&&v(s,a.s=h),g!==a.h&&v(c,a.h=g),a},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0}),e})(),X;a(()=>{if(!I())try{L=new _e({root:f,fold:p,shadow:_,background:y,face:S,design:T,gem:D,balance:O,amount:A,fraction:j,currency:ae,fiat:se}),L.setMirrored(n.getIsRTL())}catch(e){console.warn(`wallet: flat card, no WebGL2`,e),le(!0)}o(c(n.isRTL,e=>{let t=re(()=>{L?.setMirrored(e),X?.measure(),X?.update()});i(t)},{defer:!0}));let t=e.scroller?.(),r=e.header?.(),a=e.overlay?.();if(t&&r&&a&&(a.append(Y),X=new M({scroller:t,room:e.room(),card:{root:f,fold:p,shadow:_,shading:E,design:T,balance:O,gemSlot:k,gemClip:ne,amount:A,fraction:j,currency:ae,fiat:oe,details:[F,ce],card:L},flight:{root:z,group:B,primary:V,icon:H,gem:L?U:void 0,text:W,amount:G,fraction:K,currency:q,secondary:J},header:r}),i(()=>{X.destroy(),Y.remove()})),e.onReady?.({root:f,scroll:X,gem:()=>{let e=f.offsetWidth/P.width,[t,r]=L?L.gemCenter():N(n.getIsRTL());return{x:t*e,y:r*e,width:P.gemWidth*e}}}),!L){let e=new ResizeObserver(()=>{f.clientWidth&&(T.style.transform=`scale(${f.clientWidth/P.width})`)});e.observe(f),i(()=>e.disconnect()),o(()=>{de(),X?.syncText()});return}L.setBalanceFormatter(w),o(c(e.balance,e=>L.setBalance(e))),o(()=>{let t=e.fiatPerGram(),n=e.currency();L.setFiatFormatter(e=>ue(t?Se(e,t,n):``))});let s=ie({frame:e=>{L.frame(e),X?.isFlying&&(X.syncText(),X.onCardFrame())},isVisible:e.visible,element:y,onHidden:()=>L.resetClock()});i(()=>{s(),L.destroy()})});let Z,Q=e=>{Z=[e.clientX,e.clientY]},fe=t=>{L?.pressedGem||Z&&Math.hypot(t.clientX-Z[0],t.clientY-Z[1])>6||e.onClick?.()},pe=()=>C(e.address()||``,6);return(()=>{var r=be(),i=r.firstChild,a=i.firstChild,o=a.nextSibling,c=o.nextSibling,u=c.firstChild,x=u.firstChild,C=x.nextSibling,w=C.firstChild,re=w.nextSibling,ie=re.firstChild,M=ie.nextSibling,N=M.nextSibling,P=C.nextSibling,le=P.firstChild,L=P.nextSibling,ue=L.firstChild,de=L.nextSibling,z=de.nextSibling,B=z.firstChild,V=z.nextSibling,H=V.firstChild;r.$$click=fe,r.$$pointerdown=Q;var U=f;typeof U==`function`?m(U,r):f=r;var W=p;typeof W==`function`?m(W,i):p=i;var G=_;typeof G==`function`?m(G,a):_=a;var K=y;typeof K==`function`?m(K,o):y=o;var q=S;typeof q==`function`?m(q,c):S=c;var J=T;typeof J==`function`?m(J,u):T=u;var Y=E;typeof Y==`function`?m(Y,x):E=x;var X=O;typeof X==`function`?m(X,C):O=C;var Z=k;typeof Z==`function`?m(Z,w):k=w,h(w,l(te,{icon:`gram_filled`,get class(){return R.cardGemFallback}}));var me=A;typeof me==`function`?m(me,ie):A=ie;var he=j;typeof he==`function`?m(he,M):j=M;var ge=ae;typeof ge==`function`?m(ge,N):ae=N;var $=oe;typeof $==`function`?m($,P):oe=P;var _e=se;typeof _e==`function`?m(_e,le):se=le;var ve=F;typeof ve==`function`?m(ve,L):F=L,h(ue,()=>e.name()),h(de,()=>t(`Wallet.Card.Address`));var ye=ce;typeof ye==`function`?m(ye,z):ce=z,h(B,l(s,{get each(){return pe()},children:(e,t)=>[b(()=>b(()=>t()>0)()&&xe()),e]}));var Se=ne;typeof Se==`function`?m(Se,V):ne=V;var Ce=D;return typeof Ce==`function`?m(Ce,H):D=H,d(e=>{var t=ee(R.card,I()&&R.cardFlat),s=n.format(`Wallet.Card.Name`,!0),l=R.cardFold,d=R.cardShadow,f=R.cardBackground,p=R.cardFace,m=R.cardDesign,h=R.cardShading,_=R.cardBalance,y=R.cardGemSlot,b=R.cardAmount,te=R.cardFraction,S=R.cardCurrency,T=ee(R.cardFiat,R.cardFiatText),E=R.cardName,D=R.cardAddress,O=R.cardGemClip,k=R.cardGem;return t!==e.e&&v(r,e.e=t),s!==e.t&&g(r,`aria-label`,e.t=s),l!==e.a&&v(i,e.a=l),d!==e.o&&v(a,e.o=d),f!==e.i&&v(o,e.i=f),p!==e.n&&v(c,e.n=p),m!==e.s&&v(u,e.s=m),h!==e.h&&v(x,e.h=h),_!==e.r&&v(C,e.r=_),y!==e.d&&v(w,e.d=y),b!==e.l&&v(re,e.l=b),te!==e.u&&v(M,e.u=te),S!==e.c&&v(N,e.c=S),T!==e.w&&v(P,e.w=T),E!==e.m&&v(L,e.m=E),D!==e.f&&v(z,e.f=D),O!==e.y&&v(V,e.y=O),k!==e.g&&v(H,e.g=k),e},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0}),r})()}y([`pointerdown`,`click`]);export{Se as n,Ce as t};
//# sourceMappingURL=card-CCyjWOBN.js.map