import { Ctx, Mx, MeshBuilder, pbox, cylinder, extrude, ngon, lathe, cone, domeProfile, beam, archWall, oq, ot, box } from './mesh.js';
import { rgb, RNG, clamp, TAU, mix3 } from './util.js';

const darker = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ====================== 中央尖塔 + 噴泉廣場 ======================
export function makeSpire(chunk, physics, cx, cz, y0 = 0) {
  const ctx = new Ctx(chunk.wall[2], chunk.plain, 2.6, 4.0);
  const P = chunk.plain;
  const stone = rgb(0xece5d4), stone2 = rgb(0xd9d0bb), gold = rgb(0xc9a64a), metal = rgb(0x7c838a), water = rgb(0x8fc3cf);
  ctx.push(Mx.T(cx, y0, cz));
  // 噴泉水池
  const basin = ngon(0, 0, 14.5, 28);
  extrude(ctx, basin, 0, 0.75, stone2, stone, { plain: true });
  const pool = ngon(0, 0, 13.4, 28);
  extrude(ctx, pool, 0.2, 0.62, water, water, { plain: true, noTop: false });
  // 底座：兩層八角
  extrude(ctx, ngon(0, 0, 8.6, 8, 0.39), 0, 1.0, stone2, stone, { plain: true });
  extrude(ctx, ngon(0, 0, 7.2, 8, 0.39), 1.0, 2.2, stone, stone2, { plain: true });
  // 塔身：七階退縮八角柱（玻璃窗貼圖）
  let y = 2.2;
  const tiers = [[5.6, 14], [5.0, 14], [4.4, 14], [3.8, 14], [3.3, 12], [2.8, 12], [2.3, 12]];
  tiers.forEach(([r, h], i) => {
    extrude(ctx, ngon(0, 0, r, 8, 0.39), y, y + h, i % 2 ? mix3(stone, [0.86, 0.9, 0.93], 0.5) : stone, stone2, {});
    y += h;
    extrude(ctx, ngon(0, 0, r + 0.55, 8, 0.39), y, y + 0.55, stone2, stone, { plain: true });
    y += 0.55;
  });
  const yDeck = y + 0.6;
  // 觀景盤
  lathe(P, 0, yDeck, 0, [[0, 0], [7.2, 0], [9.6, 1.0], [9.8, 1.6], [9.8, 4.2], [8.2, 5.6], [4, 6.4], [0, 6.6]], 16, stone, { shadeB: 0.8 });
  // 帶窗光環（玻璃帶）
  extrude(ctx, ngon(0, 0, 9.85, 16), yDeck + 1.7, yDeck + 4.2, rgb(0xc7d9e4), rgb(0xc7d9e4), { noTop: true });
  y = yDeck + 6.6;
  // 細桅杆 + 三環
  pbox(P, -0.9, y - 0.3, -0.9, 0.9, y + 24, 0.9, stone2, 0.9);
  const rings = [[y + 9, 4.6], [y + 15, 3.6], [y + 20, 2.6]];
  for (const [ry, rr] of rings) {
    extrude(ctx, ngon(0, 0, rr, 12), ry, ry + 0.5, metal, gold, { plain: true });
    extrude(ctx, ngon(0, 0, rr - 0.6, 12), ry - 0.15, ry, darker(metal, 0.8), darker(metal, 0.8), { plain: true, noTop: true });
  }
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4 + 0.4;
    beam(P, [Math.cos(a) * 4.4, y + 9.2, Math.sin(a) * 4.4], [Math.cos(a) * 2.4, y + 20.4, Math.sin(a) * 2.4], 0.28, metal);
  }
  pbox(P, -0.35, y + 24, -0.35, 0.35, y + 52, 0.35, gold, 0.9);
  lathe(P, 0, y + 52, 0, [[0, 0], [0.9, 0.5], [1.1, 1.4], [0.55, 2.4], [0, 3.2]], 8, gold, { shadeB: 0.85 });
  // 周圍小圓柱燈
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8 + 0.2;
    const px = Math.cos(a) * 11.2, pz = Math.sin(a) * 11.2;
    pbox(P, px - 0.25, 0.7, pz - 0.25, px + 0.25, 3.0, pz + 0.25, stone2, 0.9);
    pbox(P, px - 0.4, 3.0, pz - 0.4, px + 0.4, 3.4, pz + 0.4, gold, 1);
  }
  ctx.pop();
  physics.addBox(cx, cz, 6.1, 6.1, 0, y0, y0 + yDeck, false, 0);
  physics.addBox(cx, cz, 14.2, 14.2, 0, y0, y0 + 0.5, false, 0);
  return { top: y + 55 };
}

// ====================== 橋 ======================
function bridgeBase(T, zc, hwExtra = 8.5) {
  const q = T.river.atZ(zc);
  let ux = -q.tz, uz = q.tx;
  if (ux < 0) { ux = -ux; uz = -uz; }
  const half = q.hw + hwExtra;
  return { q, ux, uz, sx: -uz, sz: ux, half, L: half * 2, ax: q.x - ux * half, az: q.z - uz * half };
}
// 橋的保留區（避免建築擋住橋頭）：回傳矩形（中心、半長、半寬、yaw）
export function bridgeCorridor(T, zc) {
  const b = bridgeBase(T, zc);
  return { cx: b.q.x, cz: b.q.z, hl: b.half + 14, hw: 9, ux: b.ux, uz: b.uz };
}

function addParapetColliders(physics, b, hwd, yAt, step = 3) {
  const yaw = Math.atan2(-b.uz, b.ux);
  for (let s = 0; s < b.L - 0.01; s += step) {
    const s1 = Math.min(b.L, s + step), sm = (s + s1) / 2;
    const ya = Math.min(yAt(s), yAt(s1));
    for (const sg of [-1, 1]) {
      const w = sg * (hwd - 0.3);
      const px = b.ax + b.ux * sm + b.sx * w, pz = b.az + b.uz * sm + b.sz * w;
      physics.addBox(px, pz, (s1 - s) / 2 + 0.05, 0.4, yaw, ya - 0.3, Math.max(yAt(s), yAt(s1)) + 1.05, false, 0);
    }
  }
}

// 多孔石拱橋
export function archBridge(chunk, physics, T, zc, rng, info) {
  const b = bridgeBase(T, zc);
  const { q, ux, uz, sx, sz, L, ax, az } = b;
  const hwd = 4.3, Hm = 2.7;
  const yAt = (s) => Hm * 4 * (s / L) * (1 - s / L);
  const P = chunk.plain;
  const stone = jitterCol(rgb(rng.pick([0xe3d8c0, 0xd9cdb2, 0xe8dfca, 0xd3c6ab])), rng), cap = rgb(0xf3ecdb), deckC = rgb(0xcfc6b3), intr = darker(stone, 0.72);
  const pos = (s, w, y) => [ax + ux * s + sx * w, y, az + uz * s + sz * w];
  const N = Math.max(8, Math.round(L / 2));
  const inner = hwd - 0.5;
  for (let i = 0; i < N; i++) {
    const s0 = (L * i) / N, s1 = (L * (i + 1)) / N;
    const y0 = yAt(s0), y1 = yAt(s1);
    oq(P, pos(s0, -inner, y0), pos(s0, inner, y0), pos(s1, inner, y1), pos(s1, -inner, y1), deckC, [0, 1, 0]);
    for (const sg of [-1, 1]) {
      // 欄杆內側面與壓頂
      oq(P, pos(s0, sg * inner, y0), pos(s1, sg * inner, y1), pos(s1, sg * inner, y1 + 1.05), pos(s0, sg * inner, y0 + 1.05), stone, [-sg * sx, 0, -sg * sz], [0.85, 0.85, 1, 1]);
      oq(P, pos(s0, sg * inner, y0 + 1.05), pos(s1, sg * inner, y1 + 1.05), pos(s1, sg * hwd, y1 + 1.05), pos(s0, sg * hwd, y0 + 1.05), cap, [0, 1, 0]);
    }
    // 橋底（可由下方看到）
    oq(P, pos(s0, -hwd, y0 - 0.9), pos(s0, hwd, y0 - 0.9), pos(s1, hwd, y1 - 0.9), pos(s1, -hwd, y1 - 0.9), intr, [0, -1, 0], 0.8);
  }
  // 兩側外牆（含拱孔）
  const nA = Math.max(3, Math.round((q.hw * 2) / 9));
  const span = (q.hw * 2) / nA, start = L / 2 - q.hw;
  const holes = [];
  for (let k = 0; k < nA; k++) {
    const c = start + span * (k + 0.5);
    const r = span / 2 - 0.75;
    const crown = yAt(c) - 1.0;
    holes.push({ c, r, ys: crown - r });
  }
  for (const sg of [-1, 1]) {
    // U 沿橋、V 向上、法線朝外（U×V=Nn）
    const O = [ax + sx * sg * hwd, 0, az + sz * sg * hwd];
    const U = [ux, 0, uz], V = [0, 1, 0];
    let Nn = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]]; // U×V
    const want = [sx * sg, 0, sz * sg];
    let Uu = U;
    if (Nn[0] * want[0] + Nn[2] * want[2] < 0) {
      // 反向：從終點往回
      Uu = [-ux, 0, -uz];
      const O2 = [ax + ux * L + sx * sg * hwd, 0, az + uz * L + sz * sg * hwd];
      archWall(P, O2, Uu, V, [Uu[1] * V[2] - Uu[2] * V[1], Uu[2] * V[0] - Uu[0] * V[2], Uu[0] * V[1] - Uu[1] * V[0]], {
        x0: 0, x1: L, yb: -3.6, col: stone, colIn: intr, depth: hwd, through: true,
        top: (x) => yAt(L - x) + 1.05,
        holes: holes.map((h) => ({ c: L - h.c, r: h.r, ys: h.ys })),
      });
    } else {
      archWall(P, O, U, V, Nn, { x0: 0, x1: L, yb: -3.6, col: stone, colIn: intr, depth: hwd, through: true, top: (x) => yAt(x) + 1.05, holes });
    }
  }
  const ys = [];
  for (let s = 0; s <= L + 1e-6; s += 1) ys.push(yAt(s));
  physics.addDeck(ax, az, ux, uz, L, inner, ys, 1);
  addParapetColliders(physics, b, hwd, yAt);
  info && info.push({ label: `石拱橋 · 長 ${L.toFixed(0)} m · ${nA} 孔`, kind: 'bridge', h: Hm });
  // 橋頭燈柱位置
  return { lampSpots: [[pos(1.5, inner - 0.2, yAt(1.5))], [pos(L - 1.5, -inner + 0.2, yAt(L - 1.5))]].map((a) => a[0]), center: [q.x, q.z], L };
}

function jitterCol(c, rng) {
  const k = 1 + (rng.f() - 0.5) * 0.08;
  return [clamp(c[0] * k, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k, 0, 1)];
}

// 系桿拱橋（白色鋼拱）
export function tiedArchBridge(chunk, physics, T, zc, rng, info) {
  const b = bridgeBase(T, zc, 9.5);
  const { q, ux, uz, sx, sz, L, ax, az } = b;
  const hwd = 4.6, Hd = 1.1;
  const ramp = 7;
  const yAt = (s) => (s < ramp ? (Hd * s) / ramp : s > L - ramp ? (Hd * (L - s)) / ramp : Hd);
  const P = chunk.plain;
  const steel = rgb(0xf1efe8), deckC = rgb(0xb9b4a8), dark = rgb(0x5d636a), glass = rgb(0xa5c4d3);
  const pos = (s, w, y) => [ax + ux * s + sx * w, y, az + uz * s + sz * w];
  const N = Math.round(L / 2);
  for (let i = 0; i < N; i++) {
    const s0 = (L * i) / N, s1 = (L * (i + 1)) / N;
    const y0 = yAt(s0), y1 = yAt(s1);
    oq(P, pos(s0, -hwd, y0), pos(s0, hwd, y0), pos(s1, hwd, y1), pos(s1, -hwd, y1), deckC, [0, 1, 0]);
    oq(P, pos(s0, -hwd, y0 - 1.1), pos(s0, hwd, y0 - 1.1), pos(s1, hwd, y1 - 1.1), pos(s1, -hwd, y1 - 1.1), dark, [0, -1, 0], 0.8);
    for (const sg of [-1, 1]) {
      oq(P, pos(s0, sg * hwd, y0 - 1.1), pos(s1, sg * hwd, y1 - 1.1), pos(s1, sg * hwd, y1 + 0.2), pos(s0, sg * hwd, y0 + 0.2), steel, [sg * sx, 0, sg * sz], [0.85, 0.85, 1, 1]);
      oq(P, pos(s0, sg * (hwd - 0.5), y0), pos(s1, sg * (hwd - 0.5), y1), pos(s1, sg * (hwd - 0.5), y1 + 1.05), pos(s0, sg * (hwd - 0.5), y0 + 1.05), glass, [-sg * sx, 0, -sg * sz], 0.95);
      oq(P, pos(s0, sg * (hwd - 0.5), y0 + 1.05), pos(s1, sg * (hwd - 0.5), y1 + 1.05), pos(s1, sg * hwd, y1 + 1.05), pos(s0, sg * hwd, y0 + 1.05), steel, [0, 1, 0]);
    }
  }
  // 鋼拱
  const archL0 = ramp + 4, archL1 = L - ramp - 4, H = 10.5;
  const M = 22;
  const archP = (k, sg) => {
    const t = k / M;
    const s = archL0 + (archL1 - archL0) * t;
    return pos(s, sg * (hwd - 0.2), Hd + H * 4 * t * (1 - t));
  };
  for (const sg of [-1, 1]) {
    for (let k = 0; k < M; k++) beam(P, archP(k, sg), archP(k + 1, sg), 0.65, steel);
    for (let k = 1; k < M; k += 1) {
      const a = archP(k, sg);
      beam(P, [a[0], Hd + 0.3, a[2]], a, 0.14, dark);
    }
  }
  // 拱間橫撐（上方）
  for (let k = 5; k <= M - 5; k += 4) beam(P, archP(k, -1), archP(k, 1), 0.3, steel);
  const ys = [];
  for (let s = 0; s <= L + 1e-6; s += 1) ys.push(yAt(s));
  physics.addDeck(ax, az, ux, uz, L, hwd - 0.5, ys, 1);
  addParapetColliders(physics, b, hwd, yAt);
  info && info.push({ label: `系桿拱橋 · 長 ${L.toFixed(0)} m`, kind: 'bridge', h: H });
  return { lampSpots: [], center: [q.x, q.z], L };
}
