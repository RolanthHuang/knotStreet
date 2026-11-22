import { RNG, rgb, jitter, mix3, scale3, clamp, TAU } from './util.js';
import { Ctx, Mx, box, pbox, rbox, gable, hip, pyramid, shed, frustumRect, extrude, cylinder, ngon, lathe, cone, domeProfile, beam, oq, ot } from './mesh.js';

// ============ 調色盤（sRGB） ============
export const PAL = {
  old: {
    walls: [0xeadfc8, 0xe4d4b6, 0xf1e6d1, 0xdcc9a6, 0xd9c3a0, 0xe9d0a9, 0xd9b98f, 0xf3e9d8, 0xcdbd9d, 0xe7d8c2, 0xcfa98b, 0xd7d1c2, 0xe2c6a8, 0xbfc9ab, 0xdcbcaa, 0xe6dcb8],
    roofs: [0xb5482f, 0xc0553a, 0xa8452e, 0xcf6a4a, 0x9c3f2b, 0xbd5a3c, 0xd0724f, 0xa04a36, 0xc86a48, 0x8f3d2c, 0x5f6772, 0x6e5b52],
    trim: [0xf6efe0, 0xe6dcc6, 0xd5c9ad],
  },
  res: {
    walls: [0xf0e6d0, 0xe9d6b8, 0xd8e0c8, 0xe8c9b0, 0xdfd7c3, 0xf2dfc2, 0xcfd9d6, 0xe6cfd0, 0xeee3b8, 0xd9c8b4],
    roofs: [0xb5482f, 0xc0553a, 0x8f3d2c, 0x6a4b45, 0x58626c, 0xcf6a4a, 0xa8452e, 0x4f6a5a],
    trim: [0xfaf5ea, 0xe8e0cc],
  },
  mid: {
    walls: [0xdad5c8, 0xcfcbbf, 0xe6e1d4, 0xc3beb0, 0xd0d6d9, 0xbfc8cc, 0xd9cdb7, 0xcbc2b2],
    roofs: [0x8d8f8e, 0x9a9a95, 0x7b7f82, 0xa7a59d],
    trim: [0xf2efe6, 0xe0dccf],
  },
  tower: {
    glass: [0xdfeaf2, 0xcfdee9, 0xc4d6e3, 0xd8e4ea, 0xe6e9e6, 0xe8e2d2, 0xc6dccf, 0xb9cde0],
    frame: [0xe9e6dc, 0xd6d3c8, 0xc9c6bb],
    roofs: [0x8d8f8e, 0x7b7f82],
  },
  harbor: {
    walls: [0xb5694d, 0xa8573f, 0xc98f6a, 0x9b8b74, 0x7f95a3, 0xd9d3c4, 0xc7b79a, 0xb07a5c],
    roofs: [0x5d6670, 0x7a5c4e, 0x4d5a63, 0x8a8e8f, 0x9a6a52],
    trim: [0xeee6d2, 0xd5ccb6],
  },
};
const CONTAINER = [0xb5482f, 0x3f6f8f, 0xd9a441, 0x5a8f6a, 0xe8e2d2, 0x8a4f7d, 0x4a5568, 0xc9663d];
const AWNING = [0xb5482f, 0x3f6f8f, 0x5a8f6a, 0xd9a441, 0x8a4f7d];

const col = (rng, list, j = 0.045) => jitter(rgb(rng.pick(list)), rng, j);
const darker = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// 可回復的 builder 標記（用於簽名重複時重新生成）
function mark(b) {
  return { p: b.p.length, n: b.n.length, c: b.c.length, u: b.u.length, i: b.i.length, nv: b.nv };
}
function rollback(b, m) {
  b.p.length = m.p; b.n.length = m.n; b.c.length = m.c; b.u.length = m.u; b.i.length = m.i; b.nv = m.nv;
}

class Res {
  constructor() {
    this.boxes = [];
    this.rects = [];
    this.trees = [];
    this.parts = [];
    this.h = 0;
    this.label = '';
    this.kind = '';
  }
  add(x0, z0, x1, z1, y0, y1, stand = true) {
    this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, stand });
    this.h = Math.max(this.h, y1);
  }
  rect(x0, z0, x1, z1, h) {
    this.rects.push({ x0, z0, x1, z1, h });
  }
}

// ============ 平面形狀 → 翼樓 ============
function shapeWings(shape, W, D, rng) {
  const m = 0.3;
  const x0 = -W / 2 + m, x1 = W / 2 - m, z0 = -D / 2 + m, z1 = D / 2 - m;
  const w = x1 - x0, d = z1 - z0;
  const mir = rng.sign();
  let ws;
  switch (shape) {
    case 'L': {
      const bd = d * rng.range(0.42, 0.6), sw = w * rng.range(0.38, 0.55);
      ws = [{ x0, z0: z1 - bd, x1, z1, main: true }];
      ws.push(mir > 0 ? { x0: x1 - sw, z0, x1, z1: z1 - bd + 0.5 } : { x0, z0, x1: x0 + sw, z1: z1 - bd + 0.5 });
      break;
    }
    case 'U': {
      const bd = d * rng.range(0.34, 0.45), sw = w * rng.range(0.26, 0.36);
      ws = [{ x0, z0, x1, z1: z0 + bd, main: true }, { x0, z0, x1: x0 + sw, z1 }, { x0: x1 - sw, z0, x1, z1 }];
      break;
    }
    case 'O': {
      const t = Math.max(6, Math.min(w, d) * rng.range(0.27, 0.34));
      ws = [
        { x0, z0, x1, z1: z0 + t, main: true },
        { x0, z0: z1 - t, x1, z1 },
        { x0, z0: z0 + t - 0.5, x1: x0 + t, z1: z1 - t + 0.5 },
        { x0: x1 - t, z0: z0 + t - 0.5, x1, z1: z1 - t + 0.5 },
      ];
      break;
    }
    case 'T': {
      const bd = d * rng.range(0.38, 0.5), sw = w * rng.range(0.34, 0.5), sh = rng.range(-0.15, 0.15) * w;
      ws = [{ x0, z0: z1 - bd, x1, z1, main: true }, { x0: -sw / 2 + sh, z0, x1: sw / 2 + sh, z1: z1 - bd + 0.5 }];
      break;
    }
    case 'Z': {
      const a = w * rng.range(0.58, 0.68), b = d * rng.range(0.55, 0.65);
      ws = mir > 0
        ? [{ x0, z0, x1: x0 + a, z1: z0 + b, main: true }, { x0: x1 - a, z0: z1 - b, x1, z1 }]
        : [{ x0: x1 - a, z0, x1, z1: z0 + b, main: true }, { x0, z0: z1 - b, x1: x0 + a, z1 }];
      break;
    }
    case 'H': {
      const sw = w * rng.range(0.28, 0.34), zc = (z0 + z1) / 2, hb = d * rng.range(0.14, 0.2);
      ws = [{ x0, z0, x1: x0 + sw, z1, main: true }, { x0: x1 - sw, z0, x1, z1 }, { x0: x0 + sw - 0.5, z0: zc - hb, x1: x1 - sw + 0.5, z1: zc + hb }];
      break;
    }
    default:
      ws = [{ x0, z0, x1, z1, main: true }];
  }
  // 避免共面（z-fighting）：後面的翼樓若與前面翼樓某邊重合，則向內縮 0.22
  for (let j = 1; j < ws.length; j++)
    for (let i = 0; i < j; i++) {
      const a = ws[i], b = ws[j];
      if (Math.abs(a.x0 - b.x0) < 0.08) b.x0 += 0.22;
      if (Math.abs(a.x1 - b.x1) < 0.08) b.x1 -= 0.22;
      if (Math.abs(a.z0 - b.z0) < 0.08) b.z0 += 0.22;
      if (Math.abs(a.z1 - b.z1) < 0.08) b.z1 -= 0.22;
    }
  return ws;
}

// ============ 細部元件 ============
function parapet(P, x0, z0, x1, z1, y, h, t, c) {
  pbox(P, x0, y, z0, x1, y + h, z0 + t, c, 1);
  pbox(P, x0, y, z1 - t, x1, y + h, z1, c, 1);
  pbox(P, x0, y, z0 + t, x0 + t, y + h, z1 - t, c, 1);
  pbox(P, x1 - t, y, z0 + t, x1, y + h, z1 - t, c, 1);
}
function chimney(P, x, y, z, rng, c) {
  const s = rng.range(0.7, 1.05), h = rng.range(1.6, 3.0);
  pbox(P, x - s / 2, y - 0.6, z - s / 2, x + s / 2, y + h, z + s / 2, c, 0.9);
  pbox(P, x - s / 2 - 0.1, y + h, z - s / 2 - 0.1, x + s / 2 + 0.1, y + h + 0.18, z + s / 2 + 0.1, darker(c, 0.85), 1);
}
function dormer(P, xc, yRoof, zf, dd, wall, roofC, winC) {
  const dw = 1.4, dh = 1.3;
  pbox(P, xc - dw / 2, yRoof - 0.3, zf - dd, xc + dw / 2, yRoof + dh, zf, wall, 0.95);
  P.quad([xc - 0.45, yRoof + 0.2, zf + 0.02], [xc + 0.45, yRoof + 0.2, zf + 0.02], [xc + 0.45, yRoof + 1.05, zf + 0.02], [xc - 0.45, yRoof + 1.05, zf + 0.02], winC);
  const yr = yRoof + dh + 0.65;
  P.tri([xc - dw / 2 - 0.1, yRoof + dh, zf + 0.12], [xc + dw / 2 + 0.1, yRoof + dh, zf + 0.12], [xc, yr, zf + 0.12], wall, 0.95);
  P.quad([xc + dw / 2 + 0.12, yRoof + dh, zf + 0.12], [xc, yr, zf + 0.12], [xc, yr, zf - dd], [xc + dw / 2 + 0.12, yRoof + dh, zf - dd], roofC, [0.9, 1, 1, 0.9]);
  P.quad([xc, yr, zf + 0.12], [xc - dw / 2 - 0.12, yRoof + dh, zf + 0.12], [xc - dw / 2 - 0.12, yRoof + dh, zf - dd], [xc, yr, zf - dd], roofC, [1, 0.9, 0.9, 1]);
}
function turret(ctx, cx, cz, y0, y1, r, rng, wall, roofC, res) {
  cylinder(ctx, cx, cz, y0, y1, r, 8, wall, wall, { noTop: true });
  const rise = r * rng.range(2.2, 3.4);
  cone(ctx.P, cx, y1, cz, r + 0.35, rise, 8, roofC);
  ctx.P.quad([cx - r - 0.1, y1 - 0.15, cz - r - 0.1], [cx - r - 0.1, y1 - 0.15, cz + r + 0.1], [cx + r + 0.1, y1 - 0.15, cz + r + 0.1], [cx + r + 0.1, y1 - 0.15, cz - r - 0.1], darker(wall, 0.9));
  res.add(cx - r, cz - r, cx + r, cz + r, 0, y1 + rise * 0.6, false);
  return rise;
}
function balconies(ctx, w, floors, fh, rng, wall) {
  const P = ctx.P;
  const bw = ctx.bw;
  const nb = Math.max(1, Math.round((w.x1 - w.x0) / bw));
  const pitch = (w.x1 - w.x0) / nb;
  const dark = darker(wall, 0.72);
  const every = rng.chance(0.5) ? 1 : 2;
  const start = rng.chance(0.5) ? 1 : 2;
  for (let f = start; f < floors; f += every) {
    const y = f * fh + 0.05;
    for (let i = 0; i < nb; i++) {
      if (rng.chance(0.12)) continue;
      const cx = w.x0 + (i + 0.5) * pitch;
      pbox(P, cx - pitch * 0.34, y, w.z1, cx + pitch * 0.34, y + 0.13, w.z1 + 0.75, dark, 1);
      pbox(P, cx - pitch * 0.34, y + 0.13, w.z1 + 0.68, cx + pitch * 0.34, y + 0.95, w.z1 + 0.75, dark, 0.95);
    }
  }
}
function awnings(ctx, w, rng) {
  const P = ctx.P;
  const bw = ctx.bw;
  const nb = Math.max(1, Math.round((w.x1 - w.x0) / bw));
  const pitch = (w.x1 - w.x0) / nb;
  const c0 = rgb(rng.pick(AWNING)), c1 = rgb(0xf0ebe0);
  for (let i = 0; i < nb; i++) {
    if (rng.chance(0.25)) continue;
    const cx = w.x0 + (i + 0.5) * pitch, hw = pitch * 0.38;
    const c = i % 2 ? c0 : mix3(c0, c1, 0.15);
    P.quad([cx - hw, 2.55, w.z1 + 1.15], [cx + hw, 2.55, w.z1 + 1.15], [cx + hw, 3.05, w.z1], [cx - hw, 3.05, w.z1], c, [1, 1, 0.9, 0.9]);
    P.tri([cx + hw, 2.55, w.z1 + 1.15], [cx + hw, 3.05, w.z1], [cx + hw, 2.55, w.z1], darker(c, 0.8), 0.9);
    P.tri([cx - hw, 3.05, w.z1], [cx - hw, 2.55, w.z1 + 1.15], [cx - hw, 2.55, w.z1], darker(c, 0.8), 0.9);
  }
}
function arcade(ctx, w, trim) {
  const P = ctx.P;
  const n = Math.max(2, Math.floor((w.x1 - w.x0) / 2.9));
  const pitch = (w.x1 - w.x0) / n;
  const zf = w.z1 + 1.7;
  for (let i = 0; i <= n; i++) {
    const x = w.x0 + i * pitch;
    pbox(P, x - 0.25, 0, zf - 0.25, x + 0.25, 3.3, zf + 0.25, trim, 0.9);
  }
  pbox(P, w.x0 - 0.1, 3.3, w.z1, w.x1 + 0.1, 3.75, zf + 0.35, darker(trim, 0.92), 0.95);
}
function quoins(P, w, h, c) {
  for (const [x, z] of [[w.x0, w.z0], [w.x1, w.z0], [w.x0, w.z1], [w.x1, w.z1]]) {
    const sx = x < (w.x0 + w.x1) / 2 ? -1 : 1, sz = z < (w.z0 + w.z1) / 2 ? -1 : 1;
    pbox(P, Math.min(x, x + sx * 0.5) - (sx < 0 ? 0.08 : 0), 0, Math.min(z, z + sz * 0.5) - (sz < 0 ? 0.08 : 0), Math.max(x, x + sx * 0.5) + (sx > 0 ? 0.08 : 0), h, Math.max(z, z + sz * 0.5) + (sz > 0 ? 0.08 : 0), c, 0.9);
  }
}
function barrel(ctx, x0, z0, x1, z1, y0, rise, c, wallC, n = 8) {
  const P = ctx.P, zc = (z0 + z1) / 2, hs = (z1 - z0) / 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const phi = Math.PI - (Math.PI * i) / n;
    pts.push([zc + Math.cos(phi) * hs, y0 + Math.sin(phi) * rise]);
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1];
    oq(P, [x1, a[1], a[0]], [x0, a[1], a[0]], [x0, b[1], b[0]], [x1, b[1], b[0]], c, [0, 1, 0], [0.9, 0.9, 1, 1]);
  }
  for (let i = 1; i < n; i++) {
    ot(P, [x1, pts[0][1], pts[0][0]], [x1, pts[i][1], pts[i][0]], [x1, pts[i + 1][1], pts[i + 1][0]], wallC, [1, 0, 0], 0.92);
    ot(P, [x0, pts[0][1], pts[0][0]], [x0, pts[i][1], pts[i][0]], [x0, pts[i + 1][1], pts[i + 1][0]], wallC, [-1, 0, 0], 0.92);
  }
}
function sawtooth(ctx, x0, z0, x1, z1, y0, teeth, rise, c, glassC) {
  const P = ctx.P;
  const step = (z1 - z0) / teeth;
  for (let i = 0; i < teeth; i++) {
    const za = z0 + i * step, zb = za + step;
    oq(P, [x1, y0, za], [x0, y0, za], [x0, y0 + rise, zb], [x1, y0 + rise, zb], c, [0, 1, -0.5], [0.92, 0.92, 1, 1]);
    oq(P, [x0, y0 + rise, zb], [x1, y0 + rise, zb], [x1, y0, zb], [x0, y0, zb], glassC, [0, 0, 1], [1, 1, 0.85, 0.85]);
    ot(P, [x1, y0, za], [x1, y0 + rise, zb], [x1, y0, zb], c, [1, 0, 0], 0.9);
    ot(P, [x0, y0, zb], [x0, y0 + rise, zb], [x0, y0, za], c, [-1, 0, 0], 0.9);
  }
}
function rooftop(ctx, rect, y, rng, pal, wallC) {
  const P = ctx.P;
  const trim = col(rng, pal.trim || [0xeeeeee], 0.02);
  const k = rng.int(0, 3);
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  if (w < 5 || d < 5) return 'rt0';
  const rx = (a, b) => rect.x0 + 1.4 + (w - 2.8 - b) * rng.f() + a, rz = (a, b) => rect.z0 + 1.4 + (d - 2.8 - b) * rng.f() + a;
  const dk = [0.5, 0.52, 0.55];
  if (k >= 1) {
    const sx = rx(0, 2.6), sz = rz(0, 2.6);
    pbox(P, sx, y, sz, sx + 2.6, y + 2.5, sz + 2.6, wallC, 0.9);
  }
  if (k >= 2) {
    const tx = rx(0, 2.4), tz = rz(0, 2.4);
    lathe(P, tx + 1.2, y + 0.9, tz + 1.2, [[1.1, 0], [1.1, 1.9], [0.6, 2.4], [0, 2.7]], 8, [0.55, 0.6, 0.62]);
    pbox(P, tx + 0.2, y, tz + 0.2, tx + 0.4, y + 0.9, tz + 0.4, dk, 1);
    pbox(P, tx + 2.0, y, tz + 2.0, tx + 2.2, y + 0.9, tz + 2.2, dk, 1);
  }
  if (k === 3 || rng.chance(0.3)) {
    const px = rx(0, 5), pz = rz(0, 2.2);
    for (let i = 0; i < 4; i++) {
      const x = px + i * 1.25;
      oq(P, [x, y + 0.2, pz], [x + 1.1, y + 0.2, pz], [x + 1.1, y + 0.75, pz + 2.0], [x, y + 0.75, pz + 2.0], [0.2, 0.26, 0.36], [0, 1, -0.3], 1);
    }
  }
  if (rng.chance(0.4)) {
    const ax = rx(0, 0.3), az = rz(0, 0.3);
    pbox(P, ax, y, az, ax + 0.18, y + rng.range(3.5, 7), az + 0.18, dk, 1);
  }
  return 'rt' + k;
}

// ============ 舊城建築 ============
function genOldTown(chunk, M, rng, W, D, o) {
  const pal = o.pal || PAL.old;
  const style = rng.chance(0.62) ? 0 : 3;
  const fh = rng.range(3.0, 3.7), bw = rng.range(2.7, 3.7);
  const ctx = new Ctx(chunk.wall[style], chunk.plain, bw, fh);
  const res = new Res();
  const maxF = o.maxF || 6;
  const shape = rng.weighted([['rect', 3], ['L', 3.2], ['U', 1.5], ['O', 1.5], ['T', 1.7], ['Z', 1.3], ['H', 0.9]]);
  const wings = shapeWings(shape, W, D, rng);
  const base = rng.int(2, maxF);
  const wallC = col(rng, pal.walls);
  const trimC = col(rng, pal.trim, 0.02);
  const roofBase = col(rng, pal.roofs, 0.03);
  const family = rng.weighted([['gable', 4], ['hip', 2.4], ['mansard', 1], ['flat', 1.2], ['mixed', 3]]);
  const frontZ = Math.max(...wings.map((w) => w.z1));
  ctx.push(M);
  const sig = [shape];
  let tallest = 0;
  wings.forEach((w, idx) => {
    let fl = w.main ? base : clamp(base + rng.pick([-1, 0, 0, 1, 1, -2]), 1, maxF);
    if (idx > 0 && rng.chance(0.18)) fl = clamp(base + 2, 1, maxF + 1);
    w.floors = fl;
    const ww = w.x1 - w.x0, dd = w.z1 - w.z0;
    let rt = family === 'mixed' ? rng.pick(['gable', 'gable', 'hip', 'flat', 'pyramid', 'shed']) : family;
    if (rt === 'pyramid' && Math.abs(ww - dd) > Math.min(ww, dd) * 0.35) rt = 'hip';
    if (rt === 'shed' && fl < 2) rt = 'gable';
    const wc = mix3(wallC, rgb(rng.pick(pal.walls)), idx > 0 && rng.chance(0.25) ? 0.35 : 0);
    const rc = jitter(roofBase, rng, 0.04);
    w.roof = rt;
    const h = fl * fh;
    const pitched = rt !== 'flat';
    box(ctx, w.x0, 0, w.z0, w.x1, h, w.z1, wc, rt === 'flat' ? darker(rc, 0.75) : rc, { noTop: pitched });
    if (rng.chance(0.85)) pbox(ctx.P, w.x0 - 0.18, h - 0.28, w.z0 - 0.18, w.x1 + 0.18, h + 0.05, w.z1 + 0.18, trimC, 1);
    pbox(ctx.P, w.x0 - 0.06, 0, w.z0 - 0.06, w.x1 + 0.06, 0.55, w.z1 + 0.06, darker(wc, 0.76), 0.85);
    const span = Math.min(ww, dd);
    let rise = 0;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    if (rt === 'gable') {
      rise = Math.min(7.5, (span / 2) * rng.range(0.55, 0.95));
      if (ww >= dd) gable(ctx, w.x0, w.z0, w.x1, w.z1, h, rise, rc, wc, { ridgeCap: darker(rc, 0.85) });
      else {
        ctx.push(Mx.rotAbout(cx, cz, Math.PI / 2));
        gable(ctx, cx - dd / 2, cz - ww / 2, cx + dd / 2, cz + ww / 2, h, rise, rc, wc, { ridgeCap: darker(rc, 0.85) });
        ctx.pop();
      }
      if (ww >= dd && rng.chance(0.5) && ww > 7) {
        const nD = rng.int(1, Math.min(4, Math.floor(ww / 4.2)));
        for (let k = 0; k < nD; k++) {
          const xc = w.x0 + ((k + 0.5) * ww) / nD;
          const zf = w.z1 - 0.45, slope = rise / (dd / 2);
          dormer(ctx.P, xc, h + slope * 0.45 - 0.1, zf, 2.1, wc, rc, [0.2, 0.26, 0.32]);
        }
        sig.push('dm' + nD);
      }
      if (rng.chance(0.6)) {
        const nC = rng.int(1, 2);
        for (let k = 0; k < nC; k++) {
          const along = ww >= dd ? [w.x0 + (w.x1 - w.x0) * rng.range(0.15, 0.85), cz + rng.range(-0.25, 0.25)] : [cx + rng.range(-0.25, 0.25), w.z0 + (w.z1 - w.z0) * rng.range(0.15, 0.85)];
          chimney(ctx.P, along[0], h + rise * 0.98, along[1], rng, rgb(rng.pick([0xa86448, 0xb9a58a, 0x9a8b7a])));
        }
        sig.push('ch' + nC);
      }
    } else if (rt === 'hip') {
      rise = Math.min(6.5, (span / 2) * rng.range(0.5, 0.85));
      hip(ctx, w.x0, w.z0, w.x1, w.z1, h, rise, rc);
      if (rng.chance(0.4)) chimney(ctx.P, cx + rng.range(-1, 1), h + rise * 0.95, cz + rng.range(-1, 1), rng, rgb(0xa86448));
    } else if (rt === 'pyramid') {
      rise = span * rng.range(0.4, 0.7);
      pyramid(ctx.P, cx, h, cz, ww / 2 + 0.4, dd / 2 + 0.4, rise, rc);
    } else if (rt === 'mansard') {
      const a = Math.min(ww, dd) * rng.range(0.14, 0.2), hm = rng.range(2.2, 3.4);
      const sc = mix3(rc, [0.34, 0.36, 0.4], 0.55);
      frustumRect(ctx.P, w.x0 - 0.1, w.z0 - 0.1, w.x1 + 0.1, w.z1 + 0.1, h, w.x0 + a, w.z0 + a, w.x1 - a, w.z1 - a, h + hm, sc, darker(sc, 0.9));
      rise = hm;
    } else if (rt === 'shed') {
      rise = rng.range(1.6, 3.2);
      shed(ctx, w.x0, w.z0, w.x1, w.z1, h, h + rise, rc, wc);
    } else {
      parapet(ctx.P, w.x0, w.z0, w.x1, w.z1, h, 0.8, 0.3, trimC);
      sig.push(rooftop(ctx, w, h, rng, pal, wc));
    }
    sig.push(fl + rt[0]);
    if (pitched) {
      res.add(w.x0, w.z0, w.x1, w.z1, 0, h, false);
      res.add(w.x0 + 0.5, w.z0 + 0.5, w.x1 - 0.5, w.z1 - 0.5, h, h + rise * 0.9, false);
    } else res.add(w.x0, w.z0, w.x1, w.z1, 0, h + 0.8, true);
    res.rect(w.x0, w.z0, w.x1, w.z1, h + rise * 0.5);
    tallest = Math.max(tallest, h + rise);
    // 立面細部：僅面對街道的翼樓
    const front = w.z1 >= frontZ - 0.6;
    if (rng.chance(0.28)) { quoins(ctx.P, w, h, trimC); sig.push('q'); }
    if (front && fl >= 3 && rng.chance(0.4)) { balconies(ctx, w, fl, fh, rng, wc); sig.push('bal'); }
    if (front && !w.arc && rng.chance(0.3)) { awnings(ctx, w, rng); sig.push('aw'); }
    else if (front && rng.chance(0.14) && ww > 9) { arcade(ctx, w, trimC); sig.push('arc'); }
  });
  // 轉角塔
  if (rng.chance(0.22)) {
    const w = wings[0];
    const r = rng.range(1.5, 2.4);
    const sx = rng.sign(), sz = rng.chance(0.6) ? 1 : -1;
    const tx = sx > 0 ? w.x1 - r * 0.4 : w.x0 + r * 0.4, tz = sz > 0 ? w.z1 - r * 0.4 : w.z0 + r * 0.4;
    const y1 = w.floors * fh + rng.range(2.5, 5);
    const rise = turret(ctx, tx, tz, 1.0, y1, r, rng, wallC, mix3(roofBase, [0.3, 0.45, 0.4], rng.chance(0.4) ? 0.7 : 0), res);
    tallest = Math.max(tallest, y1 + rise);
    sig.push('tur');
  }
  // 庭院 / 前庭樹
  if (shape === 'O') {
    const a = wings[2], b = wings[3];
    res.trees.push([(a.x1 + b.x0) / 2, (wings[0].z1 + wings[1].z0) / 2]);
    ctx.P.quad([a.x1, 0.03, wings[0].z1], [a.x1, 0.03, wings[1].z0], [b.x0, 0.03, wings[1].z0], [b.x0, 0.03, wings[0].z1], rgb(0xc9c1a8));
  }
  if (shape === 'U') res.trees.push([(wings[1].x1 + wings[2].x0) / 2, wings[1].z1 - 2]);
  ctx.pop();
  res.sig = sig.join('|');
  res.label = `舊城 · ${{ rect: '矩形', L: 'L 形', U: 'U 形', O: '中庭', T: 'T 形', Z: 'Z 形', H: 'H 形' }[shape]} · ${wings.map((w) => w.floors).join('/')} 層`;
  res.kind = 'old';
  res.h = tallest;
  return res;
}

// ============ 中層（近代） ============
function genMid(chunk, M, rng, W, D, o) {
  const pal = PAL.mid;
  const style = rng.chance(0.75) ? 1 : 0;
  const fh = rng.range(3.5, 4.0), bw = rng.range(3.0, 4.2);
  const ctx = new Ctx(chunk.wall[style], chunk.plain, bw, fh);
  const res = new Res();
  const sig = ['mid', style];
  const x0 = -W / 2 + 0.4, x1 = W / 2 - 0.4, z0 = -D / 2 + 0.4, z1 = D / 2 - 0.4;
  const F = rng.int(5, o.maxF || 11);
  const p = rng.int(1, 3);
  const wallC = col(rng, pal.walls), trimC = col(rng, pal.trim, 0.02);
  const roofC = col(rng, pal.roofs, 0.03);
  ctx.push(M);
  // 裙樓
  box(ctx, x0, 0, z0, x1, p * (fh + 0.6), z1, mix3(wallC, [1, 1, 1], 0.08), darker(roofC, 0.8));
  pbox(ctx.P, x0 - 0.15, p * (fh + 0.6) - 0.3, z0 - 0.15, x1 + 0.15, p * (fh + 0.6) + 0.05, z1 + 0.15, trimC, 1);
  res.add(x0, z0, x1, z1, 0, p * (fh + 0.6) + 0.1, true);
  // 主體（內縮 + 偏移）
  const sx = rng.range(0.55, 0.85), sz = rng.range(0.55, 0.85);
  const ww = (x1 - x0) * sx, dd = (z1 - z0) * sz;
  const ox = rng.range(-1, 1) * ((x1 - x0) - ww) / 2, oz = rng.range(-1, 1) * ((z1 - z0) - dd) / 2;
  const cx = (x0 + x1) / 2 + ox, cz = (z0 + z1) / 2 + oz;
  const yb = p * (fh + 0.6);
  const hMain = (F - p) * fh;
  const shaft = { x0: cx - ww / 2, z0: cz - dd / 2, x1: cx + ww / 2, z1: cz + dd / 2 };
  box(ctx, shaft.x0, yb, shaft.z0, shaft.x1, yb + hMain, shaft.z1, wallC, darker(roofC, 0.8));
  pbox(ctx.P, shaft.x0 - 0.15, yb + hMain - 0.35, shaft.z0 - 0.15, shaft.x1 + 0.15, yb + hMain + 0.05, shaft.z1 + 0.15, trimC, 1);
  parapet(ctx.P, shaft.x0, shaft.z0, shaft.x1, shaft.z1, yb + hMain, 0.9, 0.28, trimC);
  sig.push(rooftop(ctx, shaft, yb + hMain, rng, pal, wallC));
  res.add(shaft.x0, shaft.z0, shaft.x1, shaft.z1, yb, yb + hMain + 0.9, true);
  let top = yb + hMain;
  // 第二塊體（L 形）
  if (rng.chance(0.45)) {
    const w2 = ww * rng.range(0.4, 0.6), d2 = dd * rng.range(0.5, 0.9);
    const left = rng.chance(0.5);
    const s2 = { x0: left ? shaft.x0 - w2 + 0.5 : shaft.x1 - 0.5, z0: shaft.z0 + rng.range(0, 1) * (dd - d2), x1: left ? shaft.x0 + 0.5 : shaft.x1 + w2 - 0.5, z1: 0 };
    s2.z1 = s2.z0 + d2;
    if (s2.x0 > x0 - 0.5 && s2.x1 < x1 + 0.5) {
      const h2 = Math.max(2, Math.floor(rng.range(0.35, 0.8) * (F - p))) * fh;
      box(ctx, s2.x0, yb, s2.z0, s2.x1, yb + h2, s2.z1, mix3(wallC, rgb(rng.pick(pal.walls)), 0.4), darker(roofC, 0.8));
      parapet(ctx.P, s2.x0, s2.z0, s2.x1, s2.z1, yb + h2, 0.8, 0.28, trimC);
      res.add(s2.x0, s2.z0, s2.x1, s2.z1, yb, yb + h2 + 0.8, true);
      sig.push('b' + Math.round(h2 / fh));
    }
  }
  // 裙樓屋頂：花園（綠色塊）與棚架
  if (rng.chance(0.6)) {
    const gx = x0 + 1, gz = z1 - 4;
    ctx.P.quad([gx, p * (fh + 0.6) + 0.06, gz - 2], [gx, p * (fh + 0.6) + 0.06, z1 - 0.8], [x1 - 1, p * (fh + 0.6) + 0.06, z1 - 0.8], [x1 - 1, p * (fh + 0.6) + 0.06, gz - 2], rgb(0x8fae6c));
    sig.push('gdn');
  }
  // 垂直鰭片
  if (rng.chance(0.35)) {
    const nb = Math.max(1, Math.round((shaft.x1 - shaft.x0) / bw));
    const pitch = (shaft.x1 - shaft.x0) / nb;
    for (let i = 0; i <= nb; i++) pbox(ctx.P, shaft.x0 + i * pitch - 0.12, yb, shaft.z1, shaft.x0 + i * pitch + 0.12, yb + hMain, shaft.z1 + 0.5, trimC, 1);
    sig.push('fin');
  }
  // 雨棚
  if (rng.chance(0.4)) {
    pbox(ctx.P, x0 + (x1 - x0) * 0.25, 3.4, z1, x1 - (x1 - x0) * 0.25, 3.7, z1 + 2.6, darker(trimC, 0.85), 0.95);
    sig.push('cano');
  }
  res.rect(x0, z0, x1, z1, yb);
  res.rect(shaft.x0, shaft.z0, shaft.x1, shaft.z1, top);
  ctx.pop();
  res.sig = sig.join('|') + '|' + F + '|' + p;
  res.label = `中層 · 裙樓 ${p} 層 + 主體 ${F - p} 層`;
  res.kind = 'mid';
  res.h = top + 4;
  return res;
}

// ============ 高層塔樓（8 種冠頂） ============
const CROWNS = ['stepped', 'twist', 'cyl', 'slant', 'twin', 'prism', 'diagrid', 'cantilever'];
function genTower(chunk, M, rng, W, D, o) {
  const pal = PAL.tower;
  const style = rng.chance(0.85) ? 2 : 1;
  const fh = rng.range(3.7, 4.2), bw = rng.range(2.6, 3.4);
  const ctx = new Ctx(chunk.wall[style], chunk.plain, bw, fh);
  const res = new Res();
  const crown = o.crown || rng.pick(CROWNS);
  const sig = ['tower', crown];
  const x0 = -W / 2 + 0.6, x1 = W / 2 - 0.6, z0 = -D / 2 + 0.6, z1 = D / 2 - 0.6;
  const glass = col(rng, pal.glass, 0.03), frame = col(rng, pal.frame, 0.02);
  const tw = Math.min(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const F = rng.int(14, o.maxF || 30);
  ctx.push(M);
  // 裙樓
  const pf = rng.int(2, 3);
  const ph = pf * (fh + 0.4);
  box(ctx, x0, 0, z0, x1, ph, z1, mix3(glass, frame, 0.5), darker(frame, 0.9));
  pbox(ctx.P, x0 - 0.2, ph - 0.4, z0 - 0.2, x1 + 0.2, ph + 0.05, z1 + 0.2, frame, 1);
  res.add(x0, z0, x1, z1, 0, ph + 0.1, true);
  res.rect(x0, z0, x1, z1, ph);
  const addShaft = (sx0, sz0, sx1, sz1, ya, yb2, c = glass, topC = darker(frame, 0.85)) => {
    box(ctx, sx0, ya, sz0, sx1, yb2, sz1, c, topC);
    res.rect(sx0, sz0, sx1, sz1, yb2);
  };
  let topY = ph;
  const shaftW = tw * rng.range(0.62, 0.8);
  switch (crown) {
    case 'stepped': {
      const tiers = rng.int(3, 5);
      let sw = shaftW, sd = shaftW * rng.range(0.85, 1.1), y = ph, ccx = cx, ccz = cz;
      for (let t = 0; t < tiers; t++) {
        const fl = Math.max(3, Math.round(((F - pf) / tiers) * rng.range(0.7, 1.3)));
        const hh = fl * fh;
        addShaft(ccx - sw / 2, ccz - sd / 2, ccx + sw / 2, ccz + sd / 2, y, y + hh, mix3(glass, [1, 1, 1], t * 0.05));
        pbox(ctx.P, ccx - sw / 2 - 0.15, y + hh - 0.3, ccz - sd / 2 - 0.15, ccx + sw / 2 + 0.15, y + hh + 0.05, ccz + sd / 2 + 0.15, frame, 1);
        res.add(ccx - sw / 2, ccz - sd / 2, ccx + sw / 2, ccz + sd / 2, y, y + hh, t === tiers - 1);
        y += hh;
        sw *= rng.range(0.72, 0.88);
        sd *= rng.range(0.72, 0.88);
        ccx += rng.range(-0.1, 0.1) * sw;
        ccz += rng.range(-0.1, 0.1) * sd;
      }
      const spireH = rng.range(10, 26);
      pyramid(ctx.P, ccx, y, ccz, sw / 2, sd / 2, spireH * 0.45, mix3(frame, [0.45, 0.5, 0.55], 0.5));
      pbox(ctx.P, ccx - 0.25, y + spireH * 0.4, ccz - 0.25, ccx + 0.25, y + spireH, ccz + 0.25, [0.5, 0.52, 0.56], 1);
      topY = y + spireH;
      sig.push('t' + tiers);
      break;
    }
    case 'twist': {
      const n = rng.int(12, 20), sh = (F - pf) * fh / n, dAng = rng.range(0.07, 0.15), taper = rng.range(0.982, 0.995);
      let s = shaftW;
      let y = ph;
      for (let i = 0; i < n; i++) {
        ctx.push(Mx.rotAbout(cx, cz, dAng * i));
        box(ctx, cx - s / 2, y, cz - s / 2, cx + s / 2, y + sh, cz + s / 2, mix3(glass, [1, 1, 1], (i / n) * 0.08), darker(frame, 0.85));
        ctx.pop();
        y += sh;
        s *= taper;
      }
      res.add(cx - shaftW / 2, cz - shaftW / 2, cx + shaftW / 2, cz + shaftW / 2, ph, y * 0.55, false);
      res.add(cx - shaftW * 0.45, cz - shaftW * 0.45, cx + shaftW * 0.45, cz + shaftW * 0.45, y * 0.55, y, false);
      res.rect(cx - shaftW / 2, cz - shaftW / 2, cx + shaftW / 2, cz + shaftW / 2, y);
      ctx.push(Mx.rotAbout(cx, cz, dAng * n));
      pbox(ctx.P, cx - 0.2, y, cz - 0.2, cx + 0.2, y + rng.range(8, 16), cz + 0.2, [0.55, 0.57, 0.6], 1);
      ctx.pop();
      topY = y + 12;
      sig.push('n' + n);
      break;
    }
    case 'cyl': {
      const r = shaftW / 2 * 0.95, nseg = rng.pick([16, 20, 24]);
      const fl = F - pf, hh = fl * fh;
      cylinder(ctx, cx, cz, ph, ph + hh, r, nseg, glass, darker(frame, 0.85), { a0: rng.f() });
      const rings = Math.max(2, Math.floor(fl / rng.int(4, 7)));
      for (let i = 1; i <= rings; i++) {
        const y = ph + (hh * i) / (rings + 1);
        const pts = ngon(cx, cz, r + 0.9, nseg);
        extrude(ctx, pts, y, y + 0.45, frame, frame, { plain: true });
      }
      const crownK = rng.pick(['dome', 'cone', 'flat']);
      if (crownK === 'dome') lathe(ctx.P, cx, ph + hh, cz, domeProfile(r * 0.96, r * 0.7, 6), nseg, mix3(glass, [1, 1, 1], 0.3));
      else if (crownK === 'cone') cone(ctx.P, cx, ph + hh, cz, r, r * 1.6, nseg, mix3(frame, [0.5, 0.55, 0.6], 0.4));
      pbox(ctx.P, cx - 0.2, ph + hh + (crownK === 'flat' ? 0 : r * 0.6), cz - 0.2, cx + 0.2, ph + hh + r * 1.2 + rng.range(6, 14), cz + 0.2, [0.55, 0.57, 0.6], 1);
      res.add(cx - r, cz - r, cx + r, cz + r, ph, ph + hh, false);
      res.rect(cx - r, cz - r, cx + r, cz + r, ph + hh);
      topY = ph + hh + 14;
      sig.push(crownK + nseg + 'r' + rings);
      break;
    }
    case 'slant': {
      const hh = (F - pf) * fh;
      const s = { x0: cx - shaftW / 2, z0: cz - shaftW / 2, x1: cx + shaftW / 2, z1: cz + shaftW / 2 };
      box(ctx, s.x0, ph, s.z0, s.x1, ph + hh, s.z1, glass, null, { noTop: true });
      const rise = rng.range(8, 16);
      const sc = mix3(glass, [0.6, 0.7, 0.8], 0.4);
      // 斜屋頂（朝 +z 低、-z 高）
      const yy = ph + hh;
      oq(ctx.P, [s.x0, yy, s.z1], [s.x1, yy, s.z1], [s.x1, yy + rise, s.z0], [s.x0, yy + rise, s.z0], sc, [0, 1, 0.6], [0.9, 0.9, 1, 1]);
      ot(ctx.P, [s.x1, yy, s.z1], [s.x1, yy, s.z0], [s.x1, yy + rise, s.z0], glass, [1, 0, 0], 0.9);
      ot(ctx.P, [s.x0, yy, s.z0], [s.x0, yy, s.z1], [s.x0, yy + rise, s.z0], glass, [-1, 0, 0], 0.9);
      oq(ctx.P, [s.x0, yy, s.z0], [s.x1, yy, s.z0], [s.x1, yy + rise, s.z0], [s.x0, yy + rise, s.z0], glass, [0, 0, -1], [0.8, 0.8, 1, 1]);
      pbox(ctx.P, cx - 0.15, ph + hh + rise, s.z0 + 0.5, cx + 0.15, ph + hh + rise + rng.range(8, 18), s.z0 + 0.8, [0.55, 0.57, 0.6], 1);
      res.add(s.x0, s.z0, s.x1, s.z1, ph, ph + hh + rise * 0.5, false);
      res.rect(s.x0, s.z0, s.x1, s.z1, ph + hh + rise);
      topY = ph + hh + rise + 12;
      break;
    }
    case 'twin': {
      const gap = rng.range(7, 11);
      const tww = (shaftW - gap) / 2;
      const h1 = (F - pf) * fh, h2 = h1 * rng.range(0.7, 0.9);
      const A = { x0: cx - shaftW / 2, x1: cx - shaftW / 2 + tww }, B = { x0: cx + shaftW / 2 - tww, x1: cx + shaftW / 2 };
      const dd = shaftW * rng.range(0.7, 0.95);
      addShaft(A.x0, cz - dd / 2, A.x1, cz + dd / 2, ph, ph + h1, glass);
      addShaft(B.x0, cz - dd / 2, B.x1, cz + dd / 2, ph, ph + h2, mix3(glass, [1, 1, 1], 0.08));
      res.add(A.x0, cz - dd / 2, A.x1, cz + dd / 2, ph, ph + h1, false);
      res.add(B.x0, cz - dd / 2, B.x1, cz + dd / 2, ph, ph + h2, false);
      for (const f of [0.45, 0.72]) {
        const yy = ph + h2 * f;
        box(ctx, A.x1, yy, cz - dd * 0.3, B.x0, yy + fh * 2, cz + dd * 0.3, mix3(frame, glass, 0.4), darker(frame, 0.85), { plain: true });
        res.add(A.x1, cz - dd * 0.3, B.x0, cz + dd * 0.3, yy, yy + fh * 2, true);
      }
      pbox(ctx.P, A.x0 + tww / 2 - 0.2, ph + h1, cz - 0.2, A.x0 + tww / 2 + 0.2, ph + h1 + rng.range(6, 14), cz + 0.2, [0.55, 0.57, 0.6], 1);
      topY = ph + h1 + 10;
      break;
    }
    case 'prism': {
      const n = rng.pick([3, 5, 6, 7]);
      const r = shaftW / 2 * 1.05;
      const pts = ngon(cx, cz, r, n, rng.f() * TAU);
      const hh = (F - pf) * fh;
      extrude(ctx, pts, ph, ph + hh, glass, darker(frame, 0.85), {});
      const pointed = rng.chance(0.6);
      if (pointed) {
        const cp = rgb(0xaab7c2);
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          ot(ctx.P, [a[0], ph + hh, a[1]], [cx, ph + hh + r * 1.4, cz], [b[0], ph + hh, b[1]], cp, [(a[0] + b[0]) / 2 - cx, 0.6, (a[1] + b[1]) / 2 - cz], [0.9, 1, 0.9]);
        }
      }
      res.add(cx - r * 0.8, cz - r * 0.8, cx + r * 0.8, cz + r * 0.8, ph, ph + hh, false);
      res.rect(cx - r, cz - r, cx + r, cz + r, ph + hh);
      topY = ph + hh + (pointed ? r * 1.4 : 4);
      sig.push('n' + n + (pointed ? 'p' : 'f'));
      break;
    }
    case 'diagrid': {
      const hh = (F - pf) * fh;
      const s = { x0: cx - shaftW / 2, z0: cz - shaftW / 2, x1: cx + shaftW / 2, z1: cz + shaftW / 2 };
      box(ctx, s.x0, ph, s.z0, s.x1, ph + hh, s.z1, glass, darker(frame, 0.85));
      const lv = Math.max(3, Math.floor(hh / 16));
      const barC = [0.32, 0.35, 0.4];
      const faces = [
        [[s.x0, s.z1], [s.x1, s.z1], [0, 0.45]],
        [[s.x1, s.z0], [s.x0, s.z0], [0, -0.45]],
        [[s.x1, s.z1], [s.x1, s.z0], [0.45, 0]],
        [[s.x0, s.z0], [s.x0, s.z1], [-0.45, 0]],
      ];
      for (const [a, b, off] of faces) {
        const nd = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 7));
        for (let l = 0; l < lv; l++) {
          const ya = ph + (hh * l) / lv, yb2 = ph + (hh * (l + 1)) / lv;
          for (let i = 0; i < nd; i++) {
            const t0 = i / nd, t1 = (i + 1) / nd;
            const p0 = [a[0] + (b[0] - a[0]) * t0 + off[0], ya, a[1] + (b[1] - a[1]) * t0 + off[1]];
            const p1 = [a[0] + (b[0] - a[0]) * t1 + off[0], yb2, a[1] + (b[1] - a[1]) * t1 + off[1]];
            const p2 = [a[0] + (b[0] - a[0]) * t1 + off[0], ya, a[1] + (b[1] - a[1]) * t1 + off[1]];
            const p3 = [a[0] + (b[0] - a[0]) * t0 + off[0], yb2, a[1] + (b[1] - a[1]) * t0 + off[1]];
            beam(ctx.P, p0, p1, 0.55, barC);
            beam(ctx.P, p2, p3, 0.55, barC);
          }
        }
      }
      res.add(s.x0, s.z0, s.x1, s.z1, ph, ph + hh, true);
      res.rect(s.x0, s.z0, s.x1, s.z1, ph + hh);
      pbox(ctx.P, cx - 0.2, ph + hh, cz - 0.2, cx + 0.2, ph + hh + rng.range(6, 12), cz + 0.2, [0.55, 0.57, 0.6], 1);
      topY = ph + hh + 8;
      sig.push('lv' + lv);
      break;
    }
    default: {
      // cantilever：下部細塔身 + 上部懸挑量體
      const hh = (F - pf) * fh;
      const h1 = hh * rng.range(0.45, 0.6);
      const cw = shaftW * 0.62;
      const dx = rng.sign() * shaftW * 0.22;
      addShaft(cx - cw / 2, cz - cw / 2, cx + cw / 2, cz + cw / 2, ph, ph + h1, mix3(glass, frame, 0.25));
      res.add(cx - cw / 2, cz - cw / 2, cx + cw / 2, cz + cw / 2, ph, ph + h1, false);
      const uw = shaftW * 1.1, ud = shaftW * 0.9;
      const ux = cx + dx;
      addShaft(ux - uw / 2, cz - ud / 2, ux + uw / 2, cz + ud / 2, ph + h1, ph + hh, glass);
      res.add(ux - uw / 2, cz - ud / 2, ux + uw / 2, cz + ud / 2, ph + h1, ph + hh, true);
      ctx.P.quad([ux - 3, ph + hh + 0.05, cz - 3], [ux - 3, ph + hh + 0.05, cz + 3], [ux + 3, ph + hh + 0.05, cz + 3], [ux + 3, ph + hh + 0.05, cz - 3], [0.9, 0.9, 0.92]);
      topY = ph + hh + 2;
      sig.push('cl' + Math.sign(dx));
    }
  }
  if (crown !== 'twist' && crown !== 'cyl' && crown !== 'diagrid' && crown !== 'twin' && crown !== 'stepped' && crown !== 'cantilever' && crown !== 'slant' && crown !== 'prism') res.add(cx - shaftW / 2, cz - shaftW / 2, cx + shaftW / 2, cz + shaftW / 2, ph, topY, false);
  ctx.pop();
  res.sig = sig.join('|') + '|' + F;
  res.label = `塔樓 · ${{ stepped: '階梯退縮', twist: '扭轉疊塔', cyl: '圓筒', slant: '斜頂', twin: '雙塔連橋', prism: '多角柱', diagrid: '斜撐網格', cantilever: '懸挑' }[crown]} · ${F} 層`;
  res.kind = 'tower';
  res.h = topY;
  return res;
}

// ============ 住宅 ============
function genHouse(chunk, M, rng, W, D, o) {
  const pal = PAL.res;
  const style = rng.chance(0.5) ? 0 : 3;
  const fh = rng.range(2.9, 3.4), bw = rng.range(2.6, 3.4);
  const ctx = new Ctx(chunk.wall[style], chunk.plain, bw, fh);
  const res = new Res();
  const sig = ['house'];
  const wallC = col(rng, pal.walls), trimC = col(rng, pal.trim, 0.02), roofC = col(rng, pal.roofs, 0.04);
  const mw = clamp(W * rng.range(0.5, 0.72), 6, 13), md = clamp(D * rng.range(0.42, 0.6), 6, 11);
  const bx = rng.range(-1, 1) * (W - mw) * 0.25, bz = -D / 2 + md / 2 + 1.4;
  const fl = rng.int(1, 3);
  const mainW = { x0: bx - mw / 2, x1: bx + mw / 2, z0: bz - md / 2, z1: bz + md / 2 };
  ctx.push(M);
  const h = fl * fh;
  box(ctx, mainW.x0, 0, mainW.z0, mainW.x1, h, mainW.z1, wallC, roofC, { noTop: true });
  pbox(ctx.P, mainW.x0 - 0.05, 0, mainW.z0 - 0.05, mainW.x1 + 0.05, 0.5, mainW.z1 + 0.05, darker(wallC, 0.78), 0.85);
  const rt = rng.weighted([['gable', 5], ['hip', 2], ['shed', 1], ['flat', 0.8]]);
  const span = Math.min(mw, md);
  let rise = 0;
  if (rt === 'gable') {
    rise = (span / 2) * rng.range(0.6, 0.95);
    const alongX = rng.chance(0.55) ? mw >= md : mw < md;
    if (alongX) gable(ctx, mainW.x0, mainW.z0, mainW.x1, mainW.z1, h, rise, roofC, wallC, { ridgeCap: darker(roofC, 0.85) });
    else {
      const cx = bx, cz = bz;
      ctx.push(Mx.rotAbout(cx, cz, Math.PI / 2));
      gable(ctx, cx - md / 2, cz - mw / 2, cx + md / 2, cz + mw / 2, h, rise, roofC, wallC, { ridgeCap: darker(roofC, 0.85) });
      ctx.pop();
    }
    sig.push(alongX ? 'gx' : 'gz');
  } else if (rt === 'hip') {
    rise = (span / 2) * rng.range(0.5, 0.8);
    hip(ctx, mainW.x0, mainW.z0, mainW.x1, mainW.z1, h, rise, roofC);
  } else if (rt === 'shed') {
    rise = rng.range(1.4, 2.6);
    shed(ctx, mainW.x0, mainW.z0, mainW.x1, mainW.z1, h, h + rise, roofC, wallC);
  } else {
    ctx.P.quad([mainW.x0 - 0.3, h, mainW.z0 - 0.3], [mainW.x0 - 0.3, h, mainW.z1 + 0.3], [mainW.x1 + 0.3, h, mainW.z1 + 0.3], [mainW.x1 + 0.3, h, mainW.z0 - 0.3], darker(roofC, 0.8));
    parapet(ctx.P, mainW.x0, mainW.z0, mainW.x1, mainW.z1, h, 0.6, 0.25, trimC);
  }
  sig.push(fl + rt[0]);
  res.add(mainW.x0, mainW.z0, mainW.x1, mainW.z1, 0, h, false);
  res.add(mainW.x0 + 0.4, mainW.z0 + 0.4, mainW.x1 - 0.4, mainW.z1 - 0.4, h, h + rise * 0.9, false);
  res.rect(mainW.x0, mainW.z0, mainW.x1, mainW.z1, h + rise * 0.5);
  if (rt !== 'flat' && rng.chance(0.7)) {
    chimney(ctx.P, bx + rng.range(-mw * 0.3, mw * 0.3), h + rise * 0.96, bz + rng.range(-0.3, 0.3), rng, rgb(0xa86448));
    sig.push('ch');
  }
  // 附屬翼樓 / 車庫
  if (rng.chance(0.55)) {
    const aw = rng.range(3.5, 5.5), ad = rng.range(4, 6.5);
    const left = rng.chance(0.5);
    const ax0 = left ? mainW.x0 - aw + 0.4 : mainW.x1 - 0.4, ax1 = ax0 + aw;
    const az0 = mainW.z0 + rng.range(0, 1.5), az1 = az0 + ad;
    if (ax0 > -W / 2 + 0.4 && ax1 < W / 2 - 0.4 && az1 < D / 2 - 1) {
      const ah = fh * rng.pick([1, 1, 2]);
      box(ctx, ax0, 0, az0, ax1, ah, az1, mix3(wallC, rgb(rng.pick(pal.walls)), 0.3), roofC, { noTop: true });
      const ar = (Math.min(aw, ad) / 2) * 0.7;
      if (aw >= ad) gable(ctx, ax0, az0, ax1, az1, ah, ar, roofC, wallC);
      else {
        const acx = (ax0 + ax1) / 2, acz = (az0 + az1) / 2;
        ctx.push(Mx.rotAbout(acx, acz, Math.PI / 2));
        gable(ctx, acx - ad / 2, acz - aw / 2, acx + ad / 2, acz + aw / 2, ah, ar, roofC, wallC);
        ctx.pop();
      }
      res.add(ax0, az0, ax1, az1, 0, ah + ar * 0.8, false);
      res.rect(ax0, az0, ax1, az1, ah);
      sig.push('ann' + ah);
    }
  }
  // 門廊
  if (rng.chance(0.6)) {
    const pw = rng.range(2.4, 3.6);
    const px = bx + rng.range(-mw / 4, mw / 4);
    pbox(ctx.P, px - pw / 2, 2.6, mainW.z1, px + pw / 2, 2.8, mainW.z1 + 1.8, trimC, 1);
    pbox(ctx.P, px - pw / 2, 0, mainW.z1 + 1.55, px - pw / 2 + 0.2, 2.6, mainW.z1 + 1.75, trimC, 0.9);
    pbox(ctx.P, px + pw / 2 - 0.2, 0, mainW.z1 + 1.55, px + pw / 2, 2.6, mainW.z1 + 1.75, trimC, 0.9);
    sig.push('por');
  }
  // 圍籬
  if (rng.chance(0.6)) {
    const fz = D / 2 - 0.5, fc = rgb(0xe8e0cc);
    pbox(ctx.P, -W / 2 + 0.5, 0, fz, W / 2 - 0.5, 0.9, fz + 0.15, fc, 0.9);
    sig.push('fnc');
  }
  // 花園樹
  const nt = rng.int(1, 3);
  for (let i = 0; i < nt; i++) {
    const tx = rng.range(-W / 2 + 1.5, W / 2 - 1.5), tz = rng.range(mainW.z1 + 2.5, D / 2 - 1.5);
    if (tz < D / 2 - 1) res.trees.push([tx, tz]);
  }
  ctx.pop();
  res.sig = sig.join('|');
  res.label = `住宅 · ${fl} 層 · ${{ gable: '山牆', hip: '四坡', shed: '單坡', flat: '平頂' }[rt]}屋頂`;
  res.kind = 'house';
  res.h = h + rise;
  return res;
}

// ============ 港口倉庫 / 貨櫃場 ============
function genWarehouse(chunk, M, rng, W, D, o) {
  const pal = PAL.harbor;
  const style = rng.chance(0.5) ? 1 : 0;
  const fh = rng.range(4.6, 6.0), bw = rng.range(4.5, 7);
  const ctx = new Ctx(chunk.wall[style], chunk.plain, bw, fh);
  const res = new Res();
  const sig = ['wh'];
  const wallC = col(rng, pal.walls), roofC = col(rng, pal.roofs, 0.04), trimC = col(rng, pal.trim, 0.02);
  ctx.push(M);
  const yard = rng.chance(0.28);
  if (yard) {
    // 貨櫃堆
    const nx = Math.max(2, Math.floor((W - 3) / 6.2)), nz = Math.max(2, Math.floor((D - 3) / 2.8));
    const x0 = -(nx * 6.2) / 2, z0 = -(nz * 2.8) / 2;
    let total = 0;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        if (rng.chance(0.18)) continue;
        const stack = rng.int(1, 3);
        const c = rgb(rng.pick(CONTAINER));
        for (let k = 0; k < stack; k++) {
          const cc = jitter(c, rng, 0.05);
          pbox(ctx.P, x0 + i * 6.2 + 0.1, k * 2.6, z0 + j * 2.8 + 0.1, x0 + (i + 1) * 6.2 - 0.1, (k + 1) * 2.6, z0 + (j + 1) * 2.8 - 0.1, cc, 0.85);
        }
        total += stack;
      }
    res.add(x0, z0, x0 + nx * 6.2, z0 + nz * 2.8, 0, 3.5, false);
    res.rect(x0, z0, x0 + nx * 6.2, z0 + nz * 2.8, 5);
    sig.push('yard' + total);
    res.label = '港區 · 貨櫃堆場';
  } else {
    const x0 = -W / 2 + 0.5, x1 = W / 2 - 0.5, z0 = -D / 2 + 0.5, z1 = D / 2 - 0.5;
    const fl = rng.int(1, 2);
    const h = fl * fh;
    const long = x1 - x0 >= z1 - z0;
    box(ctx, x0, 0, z0, x1, h, z1, wallC, roofC, { noTop: true });
    pbox(ctx.P, x0 - 0.05, 0, z0 - 0.05, x1 + 0.05, 0.6, z1 + 0.05, darker(wallC, 0.75), 0.85);
    const rt = rng.weighted([['saw', 3], ['barrel', 2.5], ['gable', 2]]);
    let rise = 0;
    const rot = !long;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (rot) ctx.push(Mx.rotAbout(cx, cz, Math.PI / 2));
    const rx0 = rot ? cx - (z1 - z0) / 2 : x0, rx1 = rot ? cx + (z1 - z0) / 2 : x1, rz0 = rot ? cz - (x1 - x0) / 2 : z0, rz1 = rot ? cz + (x1 - x0) / 2 : z1;
    if (rt === 'saw') {
      const teeth = Math.max(3, Math.round((rz1 - rz0) / 6));
      rise = rng.range(2.2, 3.2);
      sawtooth(ctx, rx0, rz0, rx1, rz1, h, teeth, rise, roofC, rgb(0x9fb7c6));
      sig.push('saw' + teeth);
    } else if (rt === 'barrel') {
      rise = (rz1 - rz0) * rng.range(0.16, 0.26);
      barrel(ctx, rx0, rz0, rx1, rz1, h, rise, roofC, wallC, 8);
      sig.push('bar');
    } else {
      rise = ((rz1 - rz0) / 2) * rng.range(0.28, 0.42);
      gable(ctx, rx0, rz0, rx1, rz1, h, rise, roofC, wallC);
      sig.push('gab');
    }
    if (rot) ctx.pop();
    // 裝卸門（深色方塊）
    const nd = rng.int(2, 5);
    for (let i = 0; i < nd; i++) {
      const dx = x0 + ((i + 0.5) * (x1 - x0)) / nd;
      ctx.P.quad([dx - 1.5, 0.05, z1 + 0.02], [dx + 1.5, 0.05, z1 + 0.02], [dx + 1.5, 3.8, z1 + 0.02], [dx - 1.5, 3.8, z1 + 0.02], [0.24, 0.26, 0.3]);
    }
    if (rng.chance(0.4)) {
      const sx = rng.chance(0.5) ? x1 + 2 : x0 - 2;
      const sr = rng.range(1.6, 2.4), sh = h + rng.range(3, 8);
      if (sx > -W / 2 + 1 && sx < W / 2 - 1) {
        cylinder(ctx, sx, (z0 + z1) / 2, 0, sh, sr, 10, rgb(0xd8d3c4), rgb(0xc8c3b4), { plain: true });
        res.add(sx - sr, (z0 + z1) / 2 - sr, sx + sr, (z0 + z1) / 2 + sr, 0, sh, false);
        sig.push('silo');
      }
    }
    res.add(x0, z0, x1, z1, 0, h, false);
    res.add(x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 0.4, h, h + rise * 0.85, false);
    res.rect(x0, z0, x1, z1, h + rise * 0.5);
    sig.push('f' + fl);
    res.label = `港區 · 倉庫 · ${fl} 層`;
  }
  ctx.pop();
  res.sig = sig.join('|');
  res.kind = 'harbor';
  res.h = Math.max(res.h, 8);
  return res;
}

// ============ 特殊市政建築（各自獨特） ============
function genClockTower(chunk, M, rng, W, D) {
  const ctx = new Ctx(chunk.wall[3], chunk.plain, 3.0, 3.4);
  const res = new Res();
  ctx.push(M);
  const stone = rgb(0xd8ccb2), trim = rgb(0xf0e8d6), roof = rgb(0x4f7f76);
  const s = Math.min(W, D) * 0.5;
  const base = { x0: -W / 2 + 1, x1: W / 2 - 1, z0: -D / 2 + 1, z1: D / 2 - 1 };
  box(ctx, base.x0, 0, base.z0, base.x1, 7, base.z1, rgb(0xe4d6bb), rgb(0xb5482f));
  gable(ctx, base.x0, base.z0, base.x1, base.z1, 7, 3.6, rgb(0xb5482f), rgb(0xe4d6bb));
  res.add(base.x0, base.z0, base.x1, base.z1, 0, 8, false);
  const hh = rng.range(20, 28);
  const x0 = -s / 2, x1 = s / 2, z0 = -s / 2, z1 = s / 2;
  box(ctx, x0, 0, z0, x1, hh, z1, stone, null, { noTop: true });
  pbox(ctx.P, x0 - 0.3, hh - 0.5, z0 - 0.3, x1 + 0.3, hh + 0.1, z1 + 0.3, trim, 1);
  // 鐘面
  const faces = [[0, z1 + 0.05, 0], [0, z0 - 0.05, Math.PI], [x1 + 0.05, 0, Math.PI / 2], [x0 - 0.05, 0, -Math.PI / 2]];
  for (const [fx, fz, rot] of faces) {
    ctx.P.push(Mx.mul(Mx.T(fx, hh - 5, fz), Mx.RY(rot)));
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i * TAU) / n, a1 = ((i + 1) * TAU) / n;
      ctx.P.tri([0, 0, 0], [Math.cos(a0) * 1.6, Math.sin(a0) * 1.6, 0], [Math.cos(a1) * 1.6, Math.sin(a1) * 1.6, 0], [0.93, 0.92, 0.88]);
    }
    ctx.P.quad([-0.07, 0, 0.02], [0.07, 0, 0.02], [0.07, 1.2, 0.02], [-0.07, 1.2, 0.02], [0.2, 0.2, 0.22]);
    ctx.P.quad([0, -0.07, 0.02], [0.9, -0.07, 0.02], [0.9, 0.07, 0.02], [0, 0.07, 0.02], [0.2, 0.2, 0.22]);
    ctx.P.pop();
  }
  // 鐘樓（四面拱開口以深色塊表現）+ 錐頂
  const b0 = hh + 0.1, bh = 4.2;
  box(ctx, x0 + 0.5, b0, z0 + 0.5, x1 - 0.5, b0 + bh, z1 - 0.5, stone, null, { noTop: true, plain: true });
  for (const [fx, fz, rot] of faces) {
    ctx.P.push(Mx.mul(Mx.T(fx * 0.9, b0, fz * 0.9), Mx.RY(rot)));
    ctx.P.quad([-0.9, 0.5, 0.02], [0.9, 0.5, 0.02], [0.9, 3.0, 0.02], [-0.9, 3.0, 0.02], [0.18, 0.2, 0.24]);
    ctx.P.pop();
  }
  pyramid(ctx.P, 0, b0 + bh, 0, s / 2 - 0.2, s / 2 - 0.2, rng.range(7, 10), roof);
  pbox(ctx.P, -0.12, b0 + bh + 5, -0.12, 0.12, b0 + bh + 12, 0.12, rgb(0xc9a64a), 1);
  res.add(x0, z0, x1, z1, 0, hh, false);
  res.add(x0 + 1, z0 + 1, x1 - 1, z1 - 1, hh, b0 + bh + 5, false);
  res.rect(base.x0, base.z0, base.x1, base.z1, 8);
  res.rect(x0, z0, x1, z1, hh);
  res.h = hh + bh + 12;
  ctx.pop();
  res.sig = 'special|clock|' + Math.round(hh);
  res.label = '鐘樓';
  res.kind = 'civic';
  return res;
}
function genMarketHall(chunk, M, rng, W, D) {
  const ctx = new Ctx(chunk.wall[3], chunk.plain, 3.6, 5.0);
  const res = new Res();
  ctx.push(M);
  const x0 = -W / 2 + 0.6, x1 = W / 2 - 0.6, z0 = -D / 2 + 0.6, z1 = D / 2 - 0.6;
  const wall = rgb(0xe6d8bc), iron = rgb(0x4f7a8c);
  const long = x1 - x0 >= z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rot = !long;
  if (rot) ctx.push(Mx.rotAbout(cx, cz, Math.PI / 2));
  const rx0 = rot ? cx - (z1 - z0) / 2 : x0, rx1 = rot ? cx + (z1 - z0) / 2 : x1, rz0 = rot ? cz - (x1 - x0) / 2 : z0, rz1 = rot ? cz + (x1 - x0) / 2 : z1;
  box(ctx, rx0, 0, rz0, rx1, 5, rz1, wall, wall, { noTop: true });
  const midz0 = rz0 + (rz1 - rz0) * 0.25, midz1 = rz1 - (rz1 - rz0) * 0.25;
  box(ctx, rx0 + 0.4, 5, midz0, rx1 - 0.4, 9.5, midz1, wall, null, { noTop: true, plain: true });
  barrel(ctx, rx0 + 0.4, midz0, rx1 - 0.4, midz1, 9.5, (midz1 - midz0) * 0.32, iron, wall, 10);
  const sideC = rgb(0xb5482f);
  ctx.P.quad([rx1, 5.01, rz0 - 0.3], [rx0, 5.01, rz0 - 0.3], [rx0, 6.8, midz0], [rx1, 6.8, midz0], sideC, [0.9, 0.9, 1, 1]);
  ctx.P.quad([rx0, 5.01, rz1 + 0.3], [rx1, 5.01, rz1 + 0.3], [rx1, 6.8, midz1], [rx0, 6.8, midz1], sideC, [0.9, 0.9, 1, 1]);
  for (let i = 0; i <= 8; i++) {
    const x = rx0 + 0.5 + ((rx1 - rx0 - 1) * i) / 8;
    pbox(ctx.P, x - 0.1, 9.5, midz0 - 0.1, x + 0.1, 9.9, midz1 + 0.1, rgb(0x3d5d6b), 1);
  }
  if (rot) ctx.pop();
  res.add(x0, z0, x1, z1, 0, 5, false);
  res.add(x0 + 1, z0 + (z1 - z0) * 0.25, x1 - 1, z1 - (z1 - z0) * 0.25, 5, 12, false);
  res.rect(x0, z0, x1, z1, 10);
  res.h = 14;
  ctx.pop();
  res.sig = 'special|market';
  res.label = '市集大廳';
  res.kind = 'civic';
  return res;
}
function genBathhouse(chunk, M, rng, W, D) {
  const ctx = new Ctx(chunk.wall[3], chunk.plain, 3.4, 4.4);
  const res = new Res();
  ctx.push(M);
  const x0 = -W / 2 + 0.8, x1 = W / 2 - 0.8, z0 = -D / 2 + 0.8, z1 = D / 2 - 0.8;
  const wall = rgb(0xefe3cb), dome = rgb(0x6f9a8c), gold = rgb(0xc9a64a);
  box(ctx, x0, 0, z0, x1, 8.8, z1, wall, wall);
  pbox(ctx.P, x0 - 0.2, 8.4, z0 - 0.2, x1 + 0.2, 8.9, z1 + 0.2, rgb(0xf7f0e0), 1);
  const n = rng.int(2, 3);
  const w = x1 - x0;
  const rr = Math.min(w / n / 2 - 0.8, (z1 - z0) / 2 - 0.8);
  for (let i = 0; i < n; i++) {
    const cx = x0 + ((i + 0.5) * w) / n;
    const r = i === Math.floor(n / 2) ? rr : rr * 0.78;
    cylinder(ctx, cx, (z0 + z1) / 2, 8.8, 10.6, r, 14, wall, wall, { plain: true, noTop: true });
    lathe(ctx.P, cx, 10.6, (z0 + z1) / 2, domeProfile(r * 1.02, r * 0.9, 6), 14, dome);
    pbox(ctx.P, cx - 0.15, 10.6 + r * 0.85, (z0 + z1) / 2 - 0.15, cx + 0.15, 10.6 + r * 0.85 + 1.8, (z0 + z1) / 2 + 0.15, gold, 1);
  }
  res.add(x0, z0, x1, z1, 0, 8.8, false);
  res.add(x0 + 1.5, z0 + 1.5, x1 - 1.5, z1 - 1.5, 8.8, 13, false);
  res.rect(x0, z0, x1, z1, 12);
  res.h = 15;
  ctx.pop();
  res.sig = 'special|bath' + n;
  res.label = '穹頂浴場';
  res.kind = 'civic';
  return res;
}
function genObservatory(chunk, M, rng, W, D) {
  const ctx = new Ctx(chunk.wall[1], chunk.plain, 3.4, 4.0);
  const res = new Res();
  ctx.push(M);
  const x0 = -W / 2 + 0.8, x1 = W / 2 - 0.8, z0 = -D / 2 + 0.8, z1 = D / 2 - 0.8;
  const wall = rgb(0xe9e4d6);
  const hb = 12;
  box(ctx, x0, 0, z0, x1, 8, z1, wall, wall);
  const r = Math.min(x1 - x0, z1 - z0) * 0.34;
  cylinder(ctx, 0, 0, 8, 8 + hb, r, 16, wall, wall, { noTop: true });
  lathe(ctx.P, 0, 8 + hb, 0, domeProfile(r * 1.04, r * 0.95, 7), 16, rgb(0xdfe6ea));
  // 觀測縫
  ctx.P.quad([-0.5, 8 + hb + 0.5, r * 0.96], [0.5, 8 + hb + 0.5, r * 0.96], [0.3, 8 + hb + r * 0.9, r * 0.5], [-0.3, 8 + hb + r * 0.9, r * 0.5], [0.15, 0.17, 0.22]);
  res.add(x0, z0, x1, z1, 0, 8, false);
  res.add(-r, -r, r, r, 8, 8 + hb + r * 0.7, false);
  res.rect(x0, z0, x1, z1, 8);
  res.rect(-r, -r, r, r, 8 + hb);
  res.h = 8 + hb + r;
  ctx.pop();
  res.sig = 'special|obs';
  res.label = '天文台';
  res.kind = 'civic';
  return res;
}
function genLibrary(chunk, M, rng, W, D) {
  const ctx = new Ctx(chunk.wall[3], chunk.plain, 3.3, 4.6);
  const res = new Res();
  ctx.push(M);
  const x0 = -W / 2 + 1, x1 = W / 2 - 1, z0 = -D / 2 + 1, z1 = D / 2 - 1;
  const wall = rgb(0xece2cc), trim = rgb(0xf8f3e6);
  const h = 13.8;
  box(ctx, x0, 0, z0, x1, h, z1 - 3.6, wall, null, { noTop: true });
  pbox(ctx.P, x0 - 0.3, h - 0.9, z0 - 0.3, x1 + 0.3, h + 0.2, z1 - 3.3, trim, 1);
  // 柱廊 + 山形牆
  const n = Math.max(4, Math.floor((x1 - x0) / 3.2));
  for (let i = 0; i <= n; i++) {
    const x = x0 + 1 + ((x1 - x0 - 2) * i) / n;
    cylinder(ctx, x, z1 - 1.6, 0.4, h - 1, 0.42, 8, trim, trim, { plain: true, noTop: true });
  }
  pbox(ctx.P, x0, h - 1, z1 - 3.8, x1, h, z1 + 0.2, trim, 1);
  ctx.P.tri([x1, h, z1 + 0.2], [x0, h, z1 + 0.2], [(x0 + x1) / 2, h + 3.4, z1 + 0.2], trim, 1);
  ctx.P.quad([x0, 0, z1 - 3.4], [x1, 0, z1 - 3.4], [x1, 0.3, z1 - 3.4], [x0, 0.3, z1 - 3.4], trim);
  for (let i = 0; i < 5; i++) pbox(ctx.P, x0 - 1 + i * 0.3, 0, z1 + 0.2 + 0, x1 + 1 - i * 0.3, 0.2 + i * 0.0, z1 + 1.6 + (4 - i) * 0.0, trim, 1);
  gable(ctx, x0, z0, x1, z1 - 3.6, h, 3.2, rgb(0x6c7b82), wall, { ov: 0.2 });
  res.add(x0, z0, x1, z1 - 3.6, 0, h, false);
  res.add(x0, z1 - 3.6, x1, z1 + 0.2, 0, h, false);
  res.rect(x0, z0, x1, z1, h);
  res.h = h + 4;
  ctx.pop();
  res.sig = 'special|library';
  res.label = '圖書館';
  res.kind = 'civic';
  return res;
}

const SPECIALS = [genClockTower, genMarketHall, genBathhouse, genObservatory, genLibrary];

// ============ 對外介面 ============
export class BuildingFactory {
  constructor() {
    this.sigs = new Set();
    this.specialUsed = 0;
    this.stats = { count: 0, rerolls: 0, dup: 0 };
  }
  // chunk: {wall:[MeshBuilder x4], plain: MeshBuilder}; M：放置矩陣；回傳 Res
  make(chunk, M, seed, W, D, zone, o = {}) {
    const builders = [...chunk.wall, chunk.plain];
    let res = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      const marks = builders.map(mark);
      const rng = new RNG(seed + attempt * 7919);
      let fn;
      switch (zone) {
        case 'core': fn = genTower; break;
        case 'mid': fn = genMid; break;
        case 'res': fn = genHouse; break;
        case 'harbor': fn = genWarehouse; break;
        case 'special': fn = o.special || rng.pick(SPECIALS); break;
        default: fn = genOldTown;
      }
      res = fn(chunk, M, rng, W, D, o);
      if (!this.sigs.has(res.sig) || attempt === 6) {
        if (this.sigs.has(res.sig)) this.stats.dup++;
        this.sigs.add(res.sig);
        this.stats.count++;
        this.stats.rerolls += attempt;
        return res;
      }
      builders.forEach((b, i) => rollback(b, marks[i]));
    }
    return res;
  }
}
export { SPECIALS, genClockTower, genMarketHall, genBathhouse, genObservatory, genLibrary };
