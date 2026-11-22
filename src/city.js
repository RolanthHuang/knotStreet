import * as THREE from 'three';
import { Terrain, RIVER_Y, POND, ISL } from './world.js';
import { generateLayout, CENTER } from './layout.js';
import { Physics } from './physics.js';
import { MeshBuilder, Mx } from './mesh.js';
import { BuildingFactory, SPECIALS, PAL } from './buildings.js';
import { paintGround, GROUND } from './ground.js';
import { buildTerrain, buildSkirt, buildWater, buildWaterfall } from './terrainmesh.js';
import { makeWorldMaterial, makeWindowTextures, makeWaterMaterial, makeContourMaterial, makeWaterfallMaterial } from './materials.js';
import { Props } from './props.js';
import { makeSpire, archBridge, tiedArchBridge, bridgeCorridor } from './landmarks.js';
import { RNG, hashInt, pointInConvex, polyArea, clamp } from './util.js';

const CH = 128;
const tick = () => new Promise((r) => setTimeout(r, 0));

class Chunks {
  constructor() {
    this.map = new Map();
  }
  get(x, z) {
    const ix = Math.floor(x / CH), iz = Math.floor(z / CH);
    const k = ix + ',' + iz;
    let c = this.map.get(k);
    if (!c) {
      c = { ix, iz, wall: [0, 1, 2, 3].map(() => new MeshBuilder()), plain: new MeshBuilder(), terrain: new MeshBuilder() };
      this.map.set(k, c);
    }
    return c;
  }
}

export const BRIDGES = [
  { z: -212, type: 'arch' },
  { z: -128, type: 'tied' },
  { z: -44, type: 'arch' },
  { z: 42, type: 'arch' },
  { z: 128, type: 'tied' },
  { z: 214, type: 'arch' },
];

export async function buildCity({ maxAniso = 8, groundSize = 4096, onProgress = () => {}, seed = 20260101 } = {}) {
  const t0 = performance.now();
  const lap = {};
  const mark = (n) => { lap[n] = Math.round(performance.now() - t0); };
  const T = new Terrain();
  mark('terrain');
  onProgress(0.04, '地形');
  await tick();
  const L = generateLayout(T, seed);
  mark('layout');
  onProgress(0.12, '街區');
  await tick();

  const physics = new Physics(32);
  physics.terrainH = (x, z) => (T.islandSdf(x, z) > 1.2 ? -60 : T.heightAt(x, z));
  physics.waterY = (x, z) => T.waterAt(x, z);
  const chunks = new Chunks();
  const factory = new BuildingFactory();
  const info = [];
  const shadows = [];
  const treeDots = [];
  const props = new Props();
  const rngT = new RNG(seed ^ 0x5eed);

  // 橋的保留區
  const corridors = BRIDGES.map((b) => bridgeCorridor(T, b.z));
  const inCor = (x, z) => {
    for (const c of corridors) {
      const dx = x - c.cx, dz = z - c.cz;
      const along = dx * c.ux + dz * c.uz, across = -dx * c.uz + dz * c.ux;
      if (Math.abs(along) <= c.hl && Math.abs(across) <= c.hw) return true;
    }
    return false;
  };

  // ---- 地塊 → 建築 ----
  const lots = L.lots.slice();
  const usable = [];
  for (const lot of lots) {
    const c = Math.cos(lot.yaw), s = Math.sin(lot.yaw);
    const pts = [[0, 0], [-lot.W / 2, -lot.D / 2], [lot.W / 2, -lot.D / 2], [lot.W / 2, lot.D / 2], [-lot.W / 2, lot.D / 2]].map(([x, z]) => [lot.cx + x * c + z * s, lot.cz - x * s + z * c]);
    let ok = true;
    let hmin = 1e9, hmax = -1e9;
    for (const p of pts) {
      if (inCor(p[0], p[1])) { ok = false; break; }
      if (T.riverSdf(p[0], p[1]) < 6) { ok = false; break; }
      if (T.islandSdf(p[0], p[1]) > -13) { ok = false; break; }
      const h = T.heightAt(p[0], p[1]);
      hmin = Math.min(hmin, h);
      hmax = Math.max(hmax, h);
    }
    if (!ok || hmax - hmin > 0.8 || Math.abs(hmin) > 1.5) continue;
    lot.y = (hmin + hmax) / 2;
    usable.push(lot);
  }
  // 特殊市政建築：挑選大地塊，彼此拉開距離
  const specialSet = new Map();
  {
    const cand = usable.filter((l) => (l.zone === 'mid' || l.zone === 'old') && l.W >= 20 && l.D >= 18).sort((a, b) => b.W * b.D - a.W * a.D);
    const chosen = [];
    for (const l of cand) {
      if (chosen.length >= 5) break;
      if (chosen.every((o) => Math.hypot(o.cx - l.cx, o.cz - l.cz) > 85)) chosen.push(l);
    }
    chosen.forEach((l, i) => specialSet.set(l, SPECIALS[i % SPECIALS.length]));
  }
  const crowns = ['stepped', 'twist', 'cyl', 'slant', 'twin', 'prism', 'diagrid', 'cantilever'];
  let ci = 0;
  let nb = 0;
  let done = 0;
  for (const lot of usable) {
    const r = Math.hypot(lot.cx - CENTER.x, lot.cz - CENTER.z);
    const seedB = hashInt(Math.floor(lot.cx * 10), Math.floor(lot.cz * 10), 777);
    const rng = new RNG(seedB);
    let zone = lot.zone;
    if (zone === 'mid' && rng.chance(0.3)) zone = 'old';
    if (zone === 'core' && (lot.W < 15 || lot.D < 15)) zone = 'mid';
    if (zone === 'mid' && (lot.W < 11 || lot.D < 11)) zone = 'old';
    if (lot.W < 6 || lot.D < 6) continue;
    const chunk = chunks.get(lot.cx, lot.cz);
    const M = Mx.place(lot.cx, lot.y, lot.cz, lot.yaw);
    let fac = zone, o = {};
    const sp = specialSet.get(lot);
    if (sp) { fac = 'special'; o = { special: sp }; }
    else if (zone === 'core') o = { crown: crowns[ci++ % crowns.length], maxF: Math.round(18 + 18 * (1 - clamp(r / 95, 0, 1))) };
    else if (zone === 'mid') o = { maxF: 8 + Math.round(4 * (1 - clamp((r - 95) / 75, 0, 1))) };
    else if (zone === 'old') o = { maxF: 3 + Math.round(3 * (1 - clamp(r / 262, 0, 1))), pal: rng.chance(0.18) ? PAL.res : PAL.old };
    const res = factory.make(chunk, M, seedB, lot.W, lot.D, fac, o);
    const idx = info.length;
    info.push({ label: res.label, kind: res.kind, h: res.h, x: lot.cx, z: lot.cz });
    for (const b of res.boxes) physics.addLocal(M, b.x0, b.z0, b.x1, b.z1, b.y0, b.y1, b.stand, idx + 1);
    for (const t of res.trees) {
      const wx = M[0] * t[0] + M[6] * t[1] + M[9], wz = M[2] * t[0] + M[8] * t[1] + M[11];
      addTree(wx, wz, rngT, 0.55);
    }
    shadows.push({ cx: lot.cx, cz: lot.cz, yaw: lot.yaw, W: lot.W, D: lot.D, h: res.h });
    nb++;
    if (++done % 40 === 0) {
      onProgress(0.12 + 0.4 * (done / usable.length), '建築');
      await tick();
    }
  }
  mark('buildings');

  function addTree(x, z, rng, pBlossom = 0.1) {
    const y = T.heightAt(x, z);
    const kind = rng.chance(pBlossom * 0.3) ? 2 : rng.chance(0.3) ? 1 : 0;
    const s = rng.range(0.85, 1.5);
    props.tree(kind, x, y - 0.05, z, s, rng.f() * 6.28, rng);
    physics.addBox(x, z, 0.3, 0.3, 0, y, y + 3.2, false, 0);
    treeDots.push([x, z, 1.9 * s]);
  }

  // ---- 公園 / 廣場樹 ----
  for (const c of L.cells) {
    if (!c.block) continue;
    if (c.kind === 'park') {
      const B = c.block;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of B) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      const n = clamp(Math.abs(polyArea(B)) / 170, 6, 46);
      let placed = 0;
      for (let k = 0; k < n * 6 && placed < n; k++) {
        const x = rngT.range(x0, x1), z = rngT.range(z0, z1);
        if (!pointInConvex(B, x, z, 6)) continue;
        if (T.riverSdf(x, z) < 8) continue;
        addTree(x, z, rngT, 0.5);
        placed++;
      }
    } else if (c.kind === 'plaza2') {
      const B = c.block;
      for (let i = 0; i < B.length; i++) {
        const a = B[i], b = B[(i + 1) % B.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const m = Math.floor(l / 11);
        for (let k = 1; k < m; k++) {
          const t = k / m;
          const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          const cx = c.centroid[0], cz = c.centroid[1];
          const dx = cx - px, dz = cz - pz, dl = Math.hypot(dx, dz) || 1;
          addTree(px + (dx / dl) * 2.2, pz + (dz / dl) * 2.2, rngT, 0.7);
        }
      }
    }
  }
  // 島緣綠帶
  for (let i = 0; i < T.poly.length; i += 2) {
    const p = T.poly[i];
    const a = T.poly[(i + T.poly.length - 1) % T.poly.length], b = T.poly[(i + 1) % T.poly.length];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const nx = tz / l, nz = -tx / l;
    const k = rngT.chance(0.75) ? 1 : 0;
    for (let j = 0; j < k + 1; j++) {
      const off = rngT.range(3.5, 12);
      const x = p[0] - nx * off, z = p[1] - nz * off;
      if (T.riverSdf(x, z) < 10 || T.islandSdf(x, z) > -3) continue;
      addTree(x, z, rngT, 0.1);
    }
  }
  // 河岸行道樹
  for (let i = 2; i < T.river.pts.length - 6; i += 2) {
    const q = T.river.pts[i], a = T.river.pts[i - 1], b = T.river.pts[i + 1];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    for (const sg of [-1, 1]) {
      if (!rngT.chance(0.8)) continue;
      const x = q.x + (-tz / l) * sg * (q.hw + 4.6), z = q.z + (tx / l) * sg * (q.hw + 4.6);
      if (inCor(x, z) || T.islandSdf(x, z) > -8) continue;
      addTree(x, z, rngT, 0.6);
    }
  }
  // 街角路燈
  for (const c of L.cells) {
    if (!c.block || (c.zone !== 'core' && c.zone !== 'mid' && c.zone !== 'old') || c.kind === 'park') continue;
    for (const p of c.block) {
      if (inCor(p[0], p[1]) || T.riverSdf(p[0], p[1]) < 7) continue;
      const dx = c.centroid[0] - p[0], dz = c.centroid[1] - p[1], dl = Math.hypot(dx, dz) || 1;
      props.lamp(p[0] + (dx / dl) * 0.5, 0, p[1] + (dz / dl) * 0.5, Math.atan2(dx, dz) - Math.PI / 2);
    }
  }
  mark('props');
  onProgress(0.56, '地標');
  await tick();

  // ---- 地標 ----
  const plaza = L.plaza;
  const spire = makeSpire(chunks.get(plaza.centroid[0], plaza.centroid[1]), physics, plaza.centroid[0], plaza.centroid[1], 0);
  info.push({ label: '中央尖塔', kind: 'landmark', h: spire.top, x: plaza.centroid[0], z: plaza.centroid[1] });
  physics.boxes[physics.boxes.length - 2].tag = info.length;
  const bridgeCenters = [];
  for (const b of BRIDGES) {
    const rr = new RNG(hashInt(b.z, 5, 5));
    const ch = chunks.get(T.river.atZ(b.z).x, b.z);
    const r = b.type === 'arch' ? archBridge(ch, physics, T, b.z, rr, info) : tiedArchBridge(ch, physics, T, b.z, rr, info);
    bridgeCenters.push({ x: r.center[0], z: r.center[1], type: b.type });
    for (const s of r.lampSpots) props.lamp(s[0], s[1], s[2], 0);
  }
  mark('landmarks');

  // ---- 地面貼圖 / 地形 / 水 ----
  onProgress(0.62, '地面貼圖');
  await tick();
  const groundTex = paintGround(T, L, shadows, treeDots, groundSize);
  mark('ground');
  onProgress(0.76, '地形網格');
  await tick();
  const terrainTris = buildTerrain(T, chunks, 4);
  mark('terrainMesh');
  const skirt = buildSkirt(T);
  const water = buildWater(T);
  const fall = buildWaterfall(T);

  // ---- 材質與場景物件 ----
  onProgress(0.86, '組裝');
  await tick();
  const texs = makeWindowTextures(maxAniso);
  const matWall = texs.map((t) => makeWorldMaterial(t));
  const matPlain = makeWorldMaterial(null);
  const matGround = makeWorldMaterial(groundTex);
  const matWater = makeWaterMaterial();
  const matFall = makeWaterfallMaterial();
  const matContour = makeContourMaterial();
  const group = new THREE.Group();
  let tris = terrainTris, draws = 0;
  const addB = (b, mat, ro = 0) => {
    if (b.isEmpty()) return null;
    const m = new THREE.Mesh(b.toGeometry(), mat);
    m.matrixAutoUpdate = false;
    m.renderOrder = ro;
    group.add(m);
    tris += b.tris;
    draws++;
    return m;
  };
  for (const c of chunks.map.values()) {
    addB(c.terrain, matGround);
    c.wall.forEach((w, i) => addB(w, matWall[i]));
    addB(c.plain, matPlain);
  }
  addB(skirt, matPlain);
  const waterMesh = addB(water, matWater, 2);
  if (fall) {
    const m = new THREE.Mesh(fall.geo, matFall);
    m.renderOrder = 3;
    group.add(m);
  }
  const treeMeshes = props.build(group, matPlain);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), matContour);
  paper.rotation.x = -Math.PI / 2;
  paper.position.set(ISL.cx, -276, ISL.cz);
  paper.renderOrder = -2;
  paper.frustumCulled = false;
  group.add(paper);
  mark('assemble');
  onProgress(1, '完成');

  const stats = {
    buildings: nb,
    tris: Math.round(tris),
    draws,
    chunks: chunks.map.size,
    trees: props.treeCount,
    lamps: props.lamps.length,
    sigDup: factory.stats.dup,
    rerolls: factory.stats.rerolls,
    boxes: physics.boxes.length,
    lap,
    ms: Math.round(performance.now() - t0),
  };
  const spawn = { x: plaza.centroid[0] + 1, z: plaza.centroid[1] + 24 };
  return { group, T, L, physics, info, stats, spawn, bridgeCenters, groundTex, plaza: { x: plaza.centroid[0], z: plaza.centroid[1] }, shadows, materials: { matWall, matPlain, matGround, matWater, matFall, matContour } };
}
