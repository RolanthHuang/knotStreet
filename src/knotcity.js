import * as THREE from 'three';
import { MeshBuilder, Mx, pbox, archWall, lathe, cone } from './mesh.js';
import { BuildingFactory, PAL, SPECIALS } from './buildings.js';
import { makeWindowTextures, makeWorldMaterial } from './materials.js';
import { Physics } from './physics.js';
import { KnotCurve, bendBuilder } from './knot.js';
import { RNG, rgb, mix3, vnoise } from './util.js';

export const DECK = { HW: 18, TH: 11, CL: 96 };
const tick = () => new Promise((r) => setTimeout(r, 0));

const STONE = rgb(0xd2c6a8), STONE_D = rgb(0xb7aa8c), STONE_IN = rgb(0xa89a7c), BACK = rgb(0x2f5566);
const GREENS = [rgb(0x6f9a54), rgb(0x7fa860), rgb(0x5f8a4c), rgb(0x86ad5e), rgb(0x4f7d49)];
const CYPRESS = [rgb(0x4d7a4a), rgb(0x3f6b43), rgb(0x587f4a)];
const BLOSSOM = rgb(0xe7a3b0);
const TRUNK = rgb(0x6b4f3a);

function tree(B, x, z, s, rng) {
  const k = rng.f();
  if (k < 0.22) {
    pbox(B, x - 0.12 * s, 0, z - 0.12 * s, x + 0.12 * s, 0.8 * s, z + 0.12 * s, TRUNK, 0.8);
    cone(B, x, 0.5 * s, z, 1.0 * s, 4.4 * s, 6, rng.pick(CYPRESS), { a0: rng.f() * 6 });
  } else {
    pbox(B, x - 0.14 * s, 0, z - 0.14 * s, x + 0.14 * s, 1.6 * s, z + 0.14 * s, TRUNK, 0.8);
    const col = k > 0.9 ? BLOSSOM : rng.pick(GREENS);
    lathe(B, x, 1.2 * s, z, [[0, 0], [1.1 * s, 0.5 * s], [1.5 * s, 1.5 * s], [1.0 * s, 2.5 * s], [0, 3.0 * s]], 6, col, { a0: rng.f() * 6 });
  }
}
function lamp(B, x, z) {
  const iron = rgb(0x3b3a38);
  pbox(B, x - 0.07, 0, z - 0.07, x + 0.07, 3.4, z + 0.07, iron, 0.8);
  pbox(B, x - 0.22, 3.4, z - 0.22, x + 0.22, 3.95, z + 0.22, rgb(0xfff0b8), 1);
  pbox(B, x - 0.3, 3.95, z - 0.3, x + 0.3, 4.1, z + 0.3, iron, 1);
}
function fountain(B, x, z) {
  const st = rgb(0xdcd2b8);
  lathe(B, x, 0, z, [[3.4, 0], [3.4, 0.85], [2.8, 0.85], [2.8, 0.55]], 10, st);
  lathe(B, x, 0, z, [[2.8, 0.62], [0, 0.62]], 10, rgb(0x8fc3cf));
  pbox(B, x - 0.3, 0, z - 0.3, x + 0.3, 2.1, z + 0.3, st, 0.85);
  lathe(B, x, 2.1, z, [[0, 0], [1.2, 0.0], [1.2, 0.25], [0.2, 0.4]], 8, st);
}
function bench(B, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const px = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  // 以兩個軸對齊小盒近似（只用 0/90 度）
  const ax = Math.abs(c) > 0.7;
  const hx = ax ? 0.95 : 0.28, hz = ax ? 0.28 : 0.95;
  pbox(B, x - hx, 0.35, z - hz, x + hx, 0.5, z + hz, rgb(0x8a6a4a), 0.85);
  pbox(B, x - hx, 0, z - hz, x - hx + 0.12, 0.35, z + hz, rgb(0x55514b), 0.8);
  pbox(B, x + hx - 0.12, 0, z - hz, x + hx, 0.35, z + hz, rgb(0x55514b), 0.8);
  return px;
}

export async function buildKnot({ maxAniso = 8, onProgress = () => {}, seed = 20261122 } = {}) {
  const t0 = performance.now();
  const { HW, TH, CL } = DECK;
  const curve = new KnotCurve();
  const L = curve.L;
  const nCh = Math.ceil(L / CL);
  const chunks = Array.from({ length: nCh }, () => ({ wall: [0, 1, 2, 3].map(() => new MeshBuilder()), plain: new MeshBuilder() }));
  const chunkAt = (s) => chunks[Math.min(nCh - 1, Math.max(0, Math.floor(s / CL)))];
  const rng = new RNG(seed);
  const physics = new Physics(32);
  physics.terrainH = (x, z) => (Math.abs(z) <= HW + 0.6 ? 0 : -60);
  const info = [];
  const factory = new BuildingFactory();
  onProgress(0.02, '紐結曲線');

  // ---------- 廣場配置 ----------
  const plazas = [{ s0: L - 36, s1: L + 36, c: 0, seam: true, special: null }];
  const NP = 14;
  const specialAt = new Set([1, 3, 5, 7, 9, 11]);
  for (let i = 0; i < NP; i++) {
    const c = ((i + 0.5) / NP) * L + rng.range(-26, 26);
    const len = rng.range(42, 58);
    plazas.push({ s0: c - len / 2, s1: c + len / 2, c, seam: false, special: specialAt.has(i) ? SPECIALS[(i >> 1) % SPECIALS.length] : null });
  }
  plazas.sort((a, b) => a.c - b.c);
  const plazaAt = (s) => plazas.find((p) => (s >= p.s0 && s < p.s1) || (p.seam && s + L >= p.s0 && s + L < p.s1) || (p.seam && s - L >= p.s0 && s - L < p.s1));
  const nextPlazaStart = (s) => {
    let best = L + 1;
    for (const p of plazas) {
      for (const off of [0, L]) {
        const a = p.s0 + off - (p.seam ? L : 0);
        if (a > s && a < best) best = a;
      }
    }
    return best;
  };

  // ---------- 甲板 / 底面 / 欄杆 / 檐口 / 拱廊 ----------
  const cols = [-HW, -HW * 0.6, -HW * 0.2, HW * 0.2, HW * 0.6, HW];
  const deckBase = rgb(0xc4b9a0), deckAlt = rgb(0xb2a78f), plazaCol = rgb(0xe0d8c3);
  const botCol = rgb(0x9d917a);
  const mkHoles = (r) => {
    const out = Array.from({ length: nCh }, () => []);
    let s = r.range(0, 3);
    while (s < L - 3) {
      const nb = (Math.floor(s / CL) + 1) * CL;
      const t = r.f();
      if (t >= 0.82 && t < 0.9) { s += r.range(3.5, 6.5); continue; }
      let rad;
      if (t < 0.7) rad = r.range(1.8, 2.5);
      else if (t < 0.82) rad = r.range(2.8, 3.5);
      else rad = r.range(1.2, 1.5);
      const pier = r.range(1.3, 2.3);
      const c = s + pier + rad;
      if (c + rad + 0.6 > nb) { s = nb; continue; }
      out[Math.floor(c / CL)].push({ c, r: rad, ys: -2.2 - rad });
      s = c + rad;
      if (t >= 0.9) {
        const c2 = s + 1.0 + rad;
        if (c2 + rad + 0.6 <= nb) { out[Math.floor(c2 / CL)].push({ c: c2, r: rad, ys: -2.2 - rad }); s = c2 + rad; }
      }
    }
    return out;
  };
  const holesP = mkHoles(new RNG(seed + 11)), holesM = mkHoles(new RNG(seed + 23));
  for (let ci = 0; ci < nCh; ci++) {
    const P = chunks[ci].plain, s0 = ci * CL, s1 = Math.min(L, (ci + 1) * CL);
    // 甲板
    for (let s = s0; s < s1 - 1e-6; s += 3) {
      const sb = Math.min(s1, s + 3);
      const pl = plazaAt((s + sb) / 2);
      for (let k = 0; k < 5; k++) {
        const u0 = cols[k], u1 = cols[k + 1];
        const n = vnoise(s * 0.27, k * 3.1, 5);
        let c = mix3(deckBase, deckAlt, n);
        if (pl) c = mix3(c, plazaCol, 0.7);
        P.quad([s, 0, u0], [s, 0, u1], [sb, 0, u1], [sb, 0, u0], c);
      }
      const nb = vnoise(s * 0.2, 9, 2);
      P.quad([s, -TH, -HW], [sb, -TH, -HW], [sb, -TH, HW], [s, -TH, HW], mix3(botCol, STONE_D, nb));
    }
    // 底面肋
    for (let s = Math.ceil(s0 / 12) * 12; s < s1; s += 12) pbox(P, s, -TH - 0.7, -HW, s + 0.8, -TH, HW, STONE_D, 0.75, false);
    // 兩側：拱廊牆 + 基座 + 檐口 + 欄杆
    for (const sd of [1, -1]) {
      const holes = (sd > 0 ? holesP : holesM)[ci];
      const spec = { top: 0, yb: -TH, col: STONE, colIn: STONE_IN, colBack: BACK, depth: 1.4, seg: 6, shadeB: 0.86 };
      if (sd > 0) archWall(P, [0, 0, HW], [1, 0, 0], [0, 1, 0], [0, 0, 1], { ...spec, x0: s0, x1: s1, holes });
      else archWall(P, [0, 0, -HW], [-1, 0, 0], [0, 1, 0], [0, 0, -1], { ...spec, x0: -s1, x1: -s0, holes: holes.map((h) => ({ ...h, c: -h.c })).reverse() });
      const zo = sd * HW, zi = sd * (HW + 0.3);
      pbox(P, s0, -TH, Math.min(zo, zi), s1, -TH + 1.5, Math.max(zo, zi), STONE_D, 0.8, false);
      const cz0 = sd > 0 ? HW : -HW - 0.55, cz1 = sd > 0 ? HW + 0.55 : -HW;
      pbox(P, s0, -0.95, cz0, s1, 0, cz1, rgb(0xe6dcc3), 0.88, false);
      // 欄杆：矮牆 + 壓頂 + 立柱
      const pz0 = sd > 0 ? HW - 0.55 : -HW + 0.05, pz1 = sd > 0 ? HW - 0.05 : -HW + 0.55;
      pbox(P, s0, 0, pz0, s1, 0.95, pz1, rgb(0xcdbf9f), 0.85);
      pbox(P, s0, 0.95, pz0 - 0.1, s1, 1.15, pz1 + 0.1, rgb(0xe9dfc6), 0.95);
      for (let s = Math.ceil(s0 / 3.2) * 3.2; s < s1; s += 3.2) pbox(P, s - 0.25, 0, pz0 - 0.1, s + 0.25, 1.4, pz1 + 0.1, rgb(0xdccfae), 0.85);
    }
  }
  onProgress(0.14, '拱廊與甲板');
  await tick();

  // 碰撞：兩側隱形高牆（防止跳出）
  for (const sd of [1, -1]) physics.addBox(L / 2, sd * (HW - 0.3), L / 2 + 60, 0.35, 0, -3, 7, false, 0);

  // ---------- 廣場內容 ----------
  const specialInfos = [];
  for (const p of plazas) {
    const P = chunkAt(((p.c % L) + L) % L).plain;
    const sc = ((p.c % L) + L) % L;
    if (p.special) {
      const M = Mx.place(sc, 0, 0, 0);
      const r2 = new RNG(Math.floor(sc * 10) + 77);
      const ch = chunkAt(sc);
      const res = factory.make(ch, M, Math.floor(sc * 13) + 5, 26, 20, 'special', { special: p.special });
      const idx = info.length;
      info.push({ label: res.label, kind: res.kind, h: res.h, x: sc, z: 0 });
      for (const b of res.boxes) physics.addLocal(M, b.x0, b.z0, b.x1, b.z1, b.y0, b.y1, b.stand, idx + 1);
      for (const t of res.trees) tree(ch.plain, M[0] * t[0] + M[6] * t[1] + M[9], M[2] * t[0] + M[8] * t[1] + M[11], r2.range(0.8, 1.2), r2);
      p.sp = { s: sc, label: res.label };
      specialInfos.push(p.sp);
    } else {
      fountain(P, sc, 0);
      physics.addBox(sc, 0, 3.4, 3.4, 0, 0, 2.1, true, 0);
    }
    const r3 = new RNG(Math.floor(sc * 7) + 3);
    const nTree = 6 + r3.int(0, 4);
    for (let i = 0; i < nTree; i++) {
      const ss = sc + r3.range(-(p.s1 - p.s0) / 2 + 3, (p.s1 - p.s0) / 2 - 3);
      const uu = (r3.chance(0.5) ? 1 : -1) * r3.range(HW - 5.5, HW - 1.8);
      if (p.special && Math.abs(ss - sc) < 17) continue;
      if (!p.special && Math.abs(ss - sc) < 5.5 && Math.abs(uu) < 5.5) continue;
      const wss = ((ss % L) + L) % L;
      tree(chunkAt(wss).plain, wss, uu, r3.range(0.85, 1.35), r3);
    }
    for (const sd of [1, -1]) {
      const wss = ((sc + (p.special ? 17 : 8) * (rng.chance(0.5) ? 1 : -1)) % L + L) % L;
      bench(chunkAt(wss).plain, wss, sd * (HW - 2.2), 0);
    }
  }
  onProgress(0.2, '廣場與地標');
  await tick();

  // ---------- 兩側住宅列 ----------
  let nb = 0;
  let zoneCount = { old: 0, res: 0, mid: 0 };
  for (const sd of [1, -1]) {
    const rr = new RNG(seed + 100 + sd);
    let s = rr.range(2, 5) + (sd > 0 ? 0 : 5);
    while (s < L - 4) {
      const pl = plazaAt(s);
      if (pl) { s = (pl.seam && s < L / 2 ? pl.s1 - L : pl.s1) + rr.range(0.5, 2); continue; }
      let w = rr.range(9.5, 17.5);
      const d = rr.range(8.5, 12);
      const lim = nextPlazaStart(s) - 1.0;
      if (s + w > lim) {
        if (lim - s < 8.5) { s = lim + 1.5; continue; }
        w = lim - s;
      }
      if (s + w > L - 3) break;
      const sc = s + w / 2, uc = sd * (HW - 1.3 - d / 2);
      const seedB = Math.floor(sc * 100) * 31 + (sd > 0 ? 1 : 2);
      const r = new RNG(seedB);
      let zone = r.weighted([['old', 62], ['res', 24], ['mid', 14]]);
      if (zone === 'mid' && (w < 11 || d < 10)) zone = 'old';
      let o = {};
      if (zone === 'old') o = { maxF: r.int(3, 6), pal: r.chance(0.18) ? PAL.res : PAL.old };
      else if (zone === 'mid') o = { maxF: r.int(5, 7) };
      const ch = chunkAt(sc);
      const M = Mx.place(sc, 0, uc, sd > 0 ? Math.PI : 0);
      const res = factory.make(ch, M, seedB, w, d, zone, o);
      zoneCount[zone]++;
      const idx = info.length;
      info.push({ label: res.label, kind: res.kind, h: res.h, x: sc, z: uc });
      for (const b of res.boxes) physics.addLocal(M, b.x0, b.z0, b.x1, b.z1, b.y0, b.y1, b.stand, idx + 1);
      for (const t of res.trees) tree(ch.plain, M[0] * t[0] + M[6] * t[1] + M[9], M[2] * t[0] + M[8] * t[1] + M[11], r.range(0.7, 1.1), r);
      nb++;
      const gt = rr.f();
      s += w + (gt < 0.08 ? rr.range(4, 7.5) : gt < 0.5 ? rr.range(0.6, 1.4) : rr.range(1.4, 2.8));
      if (nb % 40 === 0) { onProgress(0.2 + 0.45 * Math.min(1, s / L / 2 + (sd < 0 ? 0.5 : 0)), '建築'); await tick(); }
    }
  }
  onProgress(0.68, '街燈與樹');

  // ---------- 街燈（中央道）、街道樹 ----------
  const rl = new RNG(seed + 555);
  for (let s = 10; s < L - 10; s += rl.range(15, 24)) {
    if (plazaAt(s)) continue;
    lamp(chunkAt(s).plain, s, 0);
    physics.addBox(s, 0, 0.15, 0.15, 0, 0, 4, false, 0);
  }

  // ---------- 網格：彎曲到紐結 ----------
  const texs = makeWindowTextures(maxAniso);
  const matWall = texs.map((t) => makeWorldMaterial(t));
  const matPlain = makeWorldMaterial(null);
  const group = new THREE.Group();
  let tris = 0, draws = 0;
  for (let ci = 0; ci < nCh; ci++) {
    const ch = chunks[ci];
    const add = (b, m) => {
      if (b.isEmpty()) return;
      const g = bendBuilder(b, curve, 6);
      const me = new THREE.Mesh(g, m);
      group.add(me);
      tris += g.attributes.position.count / 3;
      draws++;
    };
    ch.wall.forEach((w, i) => add(w, matWall[i]));
    add(ch.plain, matPlain);
    if (ci % 4 === 0) { onProgress(0.7 + 0.28 * (ci / nCh), '彎曲網格'); await tick(); }
  }
  onProgress(1, '完成');

  const dests = [];
  const sorted = specialInfos.slice().sort((a, b) => a.s - b.s);
  sorted.forEach((sp, i) => dests.push({ name: `${sp.label} · 第 ${i + 1} 段廣場`, s: sp.s - 20, u: 0, yaw: -Math.PI / 2, pitch: 0.12 }));
  dests.push({ name: '接縫廣場 · 起點', s: 14, u: 0, yaw: -Math.PI / 2, pitch: 0.1 });
  dests.forEach((d) => { const p = curve.point(d.s, 0, d.u); d.x = p.x; d.z = p.z; d.y = p.y; });

  const stats = { buildings: nb, zone: zoneCount, tris, draws, chunks: nCh, L: Math.round(L), boxes: physics.boxes.length, sig: factory.stats, ms: Math.round(performance.now() - t0) };
  return { group, curve, physics, info, stats, dests, plazas: plazas.map((p) => ({ c: ((p.c % L) + L) % L, special: !!p.special })), L, HW, materials: { matWall, matPlain }, spawn: { s: 14, u: 0, yaw: -Math.PI / 2 } };
}
