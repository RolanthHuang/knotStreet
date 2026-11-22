import * as THREE from 'three';
import { MeshBuilder, Mx } from './mesh.js';
import { BuildingFactory, SPECIALS, PAL } from './buildings.js';
import { makeWorldMaterial, makeWindowTextures, makeSkyMaterial, U } from './materials.js';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
document.body.style.margin = '0';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xf4f1ea);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 5000);
const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 16, 8), makeSkyMaterial());
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const q = new URLSearchParams(location.search);
if (q.has('back')) U.dbgBack.value = 1;

const texs = makeWindowTextures(4);
const mats = texs.map((t) => makeWorldMaterial(t));
const plain = makeWorldMaterial(null);
const side = q.has('back') ? THREE.DoubleSide : THREE.FrontSide;
for (const m of [...mats, plain]) m.side = side;
const items = [];
const crowns = ['stepped', 'twist', 'cyl', 'slant', 'twin', 'prism', 'diagrid', 'cantilever'];
for (let i = 0; i < 12; i++) items.push({ zone: 'old', W: 18 + (i % 4) * 3, D: 16 + (i % 3) * 3, o: { maxF: 5, pal: i % 5 === 4 ? PAL.res : PAL.old } });
for (let i = 0; i < 6; i++) items.push({ zone: 'mid', W: 26, D: 22, o: { maxF: 11 } });
crowns.forEach((c) => items.push({ zone: 'core', W: 44, D: 44, o: { crown: c, maxF: 26 } }));
for (let i = 0; i < 8; i++) items.push({ zone: 'res', W: 13, D: 12, o: {} });
for (let i = 0; i < 8; i++) items.push({ zone: 'harbor', W: 40, D: 28, o: {} });
SPECIALS.forEach((s) => items.push({ zone: 'special', W: 30, D: 26, o: { special: s } }));
const cols = 8, sp = 62;
let infos = [];
let stats = null;
let meshes = [];
function buildSet(solo) {
  for (const m of meshes) { scene.remove(m); m.geometry.dispose(); }
  meshes = [];
  infos = [];
  const chunk = { wall: [0, 1, 2, 3].map(() => new MeshBuilder()), plain: new MeshBuilder() };
  const f = new BuildingFactory();
  items.forEach((it, i) => {
    if (solo !== null && solo !== i) return;
    const x = solo !== null ? 0 : (i % cols) * sp - (cols * sp) / 2, z = solo !== null ? 0 : Math.floor(i / cols) * sp - 100;
    const M = Mx.place(x, 0, z, 0);
    const res = f.make(chunk, M, 9000 + i * 31, it.W, it.D, it.zone, it.o);
    infos.push({ i, x, z, label: res.label, sig: res.sig, h: res.h, W: it.W, D: it.D, zone: it.zone });
  });
  stats = f.stats;
  const add = (b, m) => { if (!b.isEmpty()) { const me = new THREE.Mesh(b.toGeometry(), m); scene.add(me); meshes.push(me); } };
  chunk.wall.forEach((w, i) => add(w, mats[i]));
  add(chunk.plain, plain);
  window.__g.infos = infos; window.__g.stats = stats;
}
const gb = new MeshBuilder();
gb.quad([-600, 0, -300], [-600, 0, 600], [600, 0, 600], [600, 0, -300], [0.82, 0.8, 0.74]);
const gm = makeWorldMaterial(null);
scene.add(new THREE.Mesh(gb.toGeometry(), gm));
window.__g = {
  infos, stats, buildSet,
  pose(x, y, z, tx, ty, tz, fov) {
    camera.position.set(x, y, z); camera.lookAt(tx, ty, tz);
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  },
};
const gl = renderer.getContext();
window.__g.mag = function () {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let count = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    if (buf[k] > 235 && buf[k + 1] < 25 && buf[k + 2] > 235) { count++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  return { count, minx, maxx, miny, maxy, w, h };
};
window.__g.probe = function (i, az, el, dist, fov) {
  const it = infos.find((q) => q.i === i);
  const ty = Math.min(it.h * 0.5, 40);
  const ex = it.x + Math.sin(az) * Math.cos(el) * dist, ez = it.z + Math.cos(az) * Math.cos(el) * dist, ey = ty + Math.sin(el) * dist;
  window.__g.pose(ex, ey, ez, it.x, ty, it.z, fov || 50);
  return window.__g.mag();
};
buildSet(q.has('solo') ? +q.get('solo') : null);
window.__g.ready = true;
