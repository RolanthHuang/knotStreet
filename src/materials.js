import * as THREE from 'three';
import { RNG } from './util.js';

// ---------- 共享 uniforms（顏色一律用 Vector3 傳 sRGB 數值，shader 不做色彩空間轉換） ----------
export const SUN_DIR = new THREE.Vector3(-0.52, 0.72, 0.46).normalize();
export const FOG_COL = [0.957, 0.945, 0.918];
export const U = {
  sunDir: { value: SUN_DIR.clone() },
  sunCol: { value: new THREE.Vector3(0.56, 0.5, 0.4) },
  skyCol: { value: new THREE.Vector3(0.6, 0.66, 0.74) },
  gndCol: { value: new THREE.Vector3(0.5, 0.46, 0.42) },
  fogCol: { value: new THREE.Vector3(FOG_COL[0], FOG_COL[1], FOG_COL[2]) },
  fogDen: { value: 0.00068 },
  uTime: { value: 0 },
  dbgBack: { value: 0 },
  belowFade: { value: 1 },
  localLight: { value: 0 },
};

// ---------- 世界通用 shader：頂點色 × 貼圖 × 半球 + 太陽光 + 指數霧（支援 Instancing） ----------
const WORLD_VS = /* glsl */ `
attribute vec3 color;
attribute vec3 nstrip;
uniform mat3 uFrameInv;
varying vec3 vNs;
varying vec3 vCol;
varying vec2 vUv;
varying vec3 vN;
varying float vDist;
varying float vY;
void main(){
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    mat4 im = instanceMatrix;
    vec4 wp = modelMatrix * im * vec4(position, 1.0);
    nrm = mat3(im) * nrm;
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
  #endif
  vN = normalize(mat3(modelMatrix) * nrm);
  #ifdef AVATAR
    vNs = uFrameInv * vN;
  #else
    vNs = nstrip;
  #endif
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vCol = color;
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
  #endif
  vUv = uv;
  vDist = length(mv.xyz);
  vY = wp.y;
}`;
const WORLD_FS = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform float useMap;
uniform vec3 sunDir, sunCol, skyCol, gndCol, fogCol;
uniform float fogDen;
uniform float dbgBack;
uniform float belowFade;
uniform float localLight;
varying vec3 vNs;
varying vec3 vCol;
varying vec2 vUv;
varying vec3 vN;
varying float vDist;
varying float vY;
void main(){
  if (dbgBack > 0.5 && !gl_FrontFacing) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
  vec3 n = normalize(mix(vN, vNs, localLight));
  float hemi = n.y * 0.5 + 0.5;
  vec3 amb = mix(gndCol, skyCol, hemi);
  float dif = max(dot(n, sunDir), 0.0);
  vec3 base = vCol;
  if (useMap > 0.5) base *= texture2D(map, vUv).rgb;
  vec3 c = base * (amb + sunCol * dif);
  float f = 1.0 - exp(-(fogDen * vDist) * (fogDen * vDist));
  float below = smoothstep(-6.0, -150.0, vY) * belowFade;
  f = clamp(max(f, below * 0.9), 0.0, 1.0);
  c = mix(c, fogCol, f);
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeWorldMaterial(map, defines) {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VS,
    fragmentShader: WORLD_FS,
    defines: defines || {},
    uniforms: { ...U, map: { value: map || null }, useMap: { value: map ? 1 : 0 }, uFrameInv: { value: new THREE.Matrix3() } },
  });
}

// ---------- 窗戶貼圖（每張代表 1 開間 × 1 樓層；與頂點色相乘） ----------
function canvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}
function stucco(g, S, rng, amount = 0.05) {
  for (let i = 0; i < S * 5; i++) {
    const a = rng.f() * amount;
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(rng.f() * S, rng.f() * S, 1 + rng.f() * 2.5, 1 + rng.f() * 2.5);
  }
}
export function makeWindowTextures(maxAniso = 8) {
  const S = 256;
  const rng = new RNG(1234);
  const texs = [];
  const mk = (draw) => {
    const c = canvas(S);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, S, S);
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    texs.push(t);
  };
  // 0：打孔窗（舊城）
  mk((g) => {
    stucco(g, S, rng);
    const wx = S * 0.3, ww = S * 0.4, wy = S * 0.17, wh = S * 0.58;
    g.fillStyle = '#d2d2d2';
    g.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
    g.fillStyle = '#34424f';
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.moveTo(wx, wy + wh * 0.55);
    g.lineTo(wx + ww * 0.6, wy);
    g.lineTo(wx + ww, wy);
    g.lineTo(wx, wy + wh * 0.9);
    g.closePath();
    g.fill();
    g.fillStyle = '#d2d2d2';
    g.fillRect(wx + ww / 2 - 3, wy, 6, wh);
    g.fillRect(wx, wy + wh * 0.42, ww, 6);
    g.fillStyle = '#b9b9b9';
    g.fillRect(wx - 12, wy + wh + 7, ww + 24, 9);
  });
  // 1：帶狀窗（中層現代）
  mk((g) => {
    stucco(g, S, rng, 0.03);
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, S * 0.66, S, S * 0.34);
    g.fillStyle = '#3d5265';
    g.fillRect(0, S * 0.26, S, S * 0.4);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, S * 0.26, S, S * 0.09);
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, S * 0.26, S, 5);
    g.fillRect(0, S * 0.66 - 5, S, 5);
    g.fillRect(0, S * 0.26, 5, S * 0.4);
    g.fillRect(S / 2 - 2, S * 0.26, 4, S * 0.4);
  });
  // 2：玻璃帷幕（高樓）
  mk((g) => {
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#a9c0d1');
    gr.addColorStop(1, '#86a0b4');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#6f879b';
    g.fillRect(0, S * 0.78, S, S * 0.22);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.moveTo(0, S * 0.78);
    g.lineTo(S * 0.55, 0);
    g.lineTo(S * 0.8, 0);
    g.lineTo(S * 0.25, S * 0.78);
    g.closePath();
    g.fill();
    g.fillStyle = '#eef2f5';
    g.fillRect(0, 0, 5, S);
    g.fillRect(0, 0, S, 5);
    g.fillRect(S * 0.5 - 1.5, 0, 3, S * 0.78);
  });
  // 3：拱窗 + 百葉窗（老城/教堂）
  mk((g) => {
    stucco(g, S, rng);
    const cx = S / 2, w = S * 0.26, top = S * 0.16, bot = S * 0.76;
    g.fillStyle = '#c4c4c4';
    g.fillRect(cx - w / 2 - 6, top + w / 2, w + 12, bot - top - w / 2 + 6);
    g.beginPath();
    g.arc(cx, top + w / 2, w / 2 + 6, Math.PI, 0);
    g.fill();
    g.fillStyle = '#35444f';
    g.beginPath();
    g.moveTo(cx - w / 2, bot);
    g.lineTo(cx - w / 2, top + w / 2);
    g.arc(cx, top + w / 2, w / 2, Math.PI, 0);
    g.lineTo(cx + w / 2, bot);
    g.closePath();
    g.fill();
    g.fillStyle = '#b4bda6';
    g.fillRect(cx - w / 2 - 30, top + w / 2, 22, bot - top - w / 2);
    g.fillRect(cx + w / 2 + 8, top + w / 2, 22, bot - top - w / 2);
    g.fillStyle = '#b3b3b3';
    g.fillRect(cx - w / 2 - 12, bot + 6, w + 24, 9);
    g.fillStyle = '#c4c4c4';
    g.fillRect(cx - 2.5, top + w / 2, 5, bot - top - w / 2);
  });
  return texs;
}

// ---------- 水面 ----------
export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...U, deep: { value: new THREE.Vector3(0.36, 0.64, 0.74) }, shallow: { value: new THREE.Vector3(0.66, 0.84, 0.86) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW; varying float vDist;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        vUv = uv; vW = wp.xyz; vDist = length(mv.xyz);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 deep, shallow, fogCol, sunDir; uniform float fogDen, uTime;
      varying vec2 vUv; varying vec3 vW; varying float vDist;
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float w1 = sin(p.x*0.21 + t*0.9 + sin(p.y*0.13 + t*0.4)*2.0);
        float w2 = sin(p.y*0.27 - t*0.7 + sin(p.x*0.19 - t*0.3)*2.0);
        float w3 = sin((p.x+p.y)*0.45 + t*1.3);
        float rip = (w1 + w2) * 0.25 + 0.5;
        float edge = smoothstep(0.62, 1.0, abs(vUv.x));
        vec3 col = mix(deep, shallow, clamp(rip*0.4 + edge*0.55, 0.0, 1.0));
        float streak = smoothstep(0.93, 1.0, rip*0.8 + w3*0.1 + 0.2) * 0.22;
        col += streak;
        col = mix(col, vec3(1.0), edge * 0.18 * (0.5 + 0.5*w3));
        float f = 1.0 - exp(-(fogDen*vDist)*(fogDen*vDist));
        col = mix(col, fogCol, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 0.9);
      }`,
  });
}

// ---------- 天空 ----------
export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      horizon: { value: new THREE.Vector3(FOG_COL[0], FOG_COL[1], FOG_COL[2]) },
      zenith: { value: new THREE.Vector3(0.82, 0.89, 0.94) },
      sunV: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 horizon, zenith, sunV; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.5));
        col = mix(col, horizon, smoothstep(0.0, -0.12, h));
        float s = max(dot(d, sunV), 0.0);
        col += vec3(1.0, 0.93, 0.8) * (pow(s, 40.0) * 0.45 + pow(s, 5.0) * 0.1);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------- 下方的等高線紙地圖（呼應原圖背景） ----------
export function makeContourMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, paper: { value: new THREE.Vector3(0.968, 0.957, 0.929) }, ink: { value: new THREE.Vector3(0.62, 0.6, 0.58) }, uOff: { value: new THREE.Vector2(0, 0) } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying float vDist; uniform vec2 uOff;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vec4 mv = viewMatrix*wp; gl_Position = projectionMatrix*mv; vW = vec3(position.x + uOff.x, 0.0, position.z + uOff.y); vDist = length(mv.xyz); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 paper, ink, fogCol; uniform float fogDen;
      varying vec3 vW; varying float vDist;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
      void main(){
        vec2 p = vW.xz * 0.0011;
        float h = fbm(p + vec2(3.7, 1.3));
        float lv = h * 22.0;
        float w = fwidth(lv);
        float d = abs(fract(lv + 0.5) - 0.5);
        float line = 1.0 - smoothstep(0.0, 1.3 * w + 0.004, d);
        float d5 = abs(fract(lv / 5.0 + 0.5) - 0.5) * 5.0;
        float line5 = 1.0 - smoothstep(0.0, 2.2 * w + 0.004, d5);
        float k = clamp(line * 0.32 + line5 * 0.3, 0.0, 0.6);
        vec3 col = mix(paper, ink, k);
        float f = 1.0 - exp(-(fogDen*0.8*vDist)*(fogDen*0.8*vDist));
        col = mix(col, fogCol, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------- 瀑布 ----------
export function makeWaterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vDist;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vec4 mv = viewMatrix*wp; gl_Position = projectionMatrix*mv; vUv = uv; vDist = length(mv.xyz); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 fogCol; uniform float fogDen, uTime;
      varying vec2 vUv; varying float vDist;
      void main(){
        float s = sin(vUv.x * 60.0 + sin(vUv.y * 9.0 - uTime * 3.0) * 1.5) * 0.5 + 0.5;
        float s2 = sin(vUv.x * 23.0 - vUv.y * 40.0 + uTime * 6.0) * 0.5 + 0.5;
        float a = (0.55 + 0.35 * s * s2) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(0.72, 0.86, 0.92), vec3(1.0), s * 0.6);
        float f = 1.0 - exp(-(fogDen*vDist)*(fogDen*vDist));
        col = mix(col, fogCol, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, a * edge);
      }`,
  });
}

// ---------- 傳送門 ----------
export function makePortalMaterial(tint = [0.7, 0.86, 1.0]) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...U, tint: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vDist;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vec4 mv = viewMatrix*wp; gl_Position = projectionMatrix*mv; vUv = uv; vDist = length(mv.xyz); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 tint, fogCol; uniform float fogDen, uTime;
      varying vec2 vUv; varying float vDist;
      void main(){
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        float a = atan(q.y, q.x);
        float sw = 0.5 + 0.5 * sin(r * 14.0 - uTime * 2.4 + a * 3.0);
        vec3 col = mix(tint, vec3(1.0, 0.92, 0.96), sw * 0.6);
        float alpha = (1.0 - smoothstep(0.82, 1.0, r)) * (0.5 + 0.4 * sw);
        float f = 1.0 - exp(-(fogDen*vDist)*(fogDen*vDist));
        col = mix(col, fogCol, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}
