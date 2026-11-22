import { RNG, polyArea, polyCentroid, pointInConvex, clamp, fbm, hashInt, distToSeg } from './util.js';

export const CENTER = { x: 28, z: 6 };
export const RAD = { core: 44, mid: 40, old: 46, res: 54, harbor: 52 };
const TARGET = { core: 1750, mid: 560, old: 290, res: 400, harbor: 1250 };
const MARGIN = { core: 1.2, mid: 1.0, old: 0.55, res: 1.6, harbor: 1.4 };
const SETBACK = { core: 3.0, mid: 1.6, old: 0.9, res: 4.2, harbor: 3.0 };
const MAXWD = { core: [56, 56], mid: [30, 28], old: [24, 22], res: [14, 13], harbor: [52, 36] };

export function zoneAt(T, x, z) {
  const rs = T.riverSdf(x, z);
  if (z > 262 && rs < 100) return 'harbor';
  const raw = Math.hypot(x - CENTER.x, (z - CENTER.z) * 0.92);
  const r = raw * (0.84 + 0.32 * fbm(x * 0.006 + 3, z * 0.006 + 7, 3, 21));
  if (r < 95) return 'core';
  if (r < 170) return 'mid';
  if (r < 262) return 'old';
  return 'res';
}

// 以半平面裁切（保留 nx*x+nz*z <= c）；O 為邊擁有者（可為 null）
export function clipHalf(P, O, nx, nz, c, id = -9) {
  const outP = [], outO = O ? [] : null;
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const o = O ? O[i] : 0;
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    const ina = da <= 0, inb = db <= 0;
    if (ina) {
      outP.push(a);
      if (O) outO.push(o);
      if (!inb) {
        const t = da / (da - db);
        outP.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        if (O) outO.push(id);
      }
    } else if (inb) {
      const t = da / (da - db);
      outP.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      if (O) outO.push(o);
    }
  }
  return [outP, outO];
}

function insetPoly(P, O, dOf) {
  let Q = P.map((p) => p.slice()), QO = O.slice();
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const nx = dz / l, nz = -dx / l;
    const d = dOf(O[i], i);
    [Q, QO] = clipHalf(Q, QO, nx, nz, nx * a[0] + nz * a[1] - d, O[i]);
    if (Q.length < 3) return null;
  }
  return [Q, QO];
}

function dedupe(P, O, eps = 0.05) {
  const Q = [], QO = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = Q[Q.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < eps) continue;
    Q.push(p);
    QO.push(O[i]);
  }
  if (Q.length > 1 && Math.hypot(Q[0][0] - Q[Q.length - 1][0], Q[0][1] - Q[Q.length - 1][1]) < eps) { Q.pop(); QO.pop(); }
  return [Q, QO];
}

function buildCells(sites) {
  const SH = 80;
  const hash = new Map();
  const key = (i, j) => i + ',' + j;
  sites.forEach((s, i) => {
    const k = key(Math.floor(s.x / SH), Math.floor(s.z / SH));
    let a = hash.get(k);
    if (!a) hash.set(k, (a = []));
    a.push(i);
  });
  const cells = new Array(sites.length).fill(null);
  const R = 700;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    if (s.ghost) continue;
    let P = [[s.x - R, s.z - R], [s.x + R, s.z - R], [s.x + R, s.z + R], [s.x - R, s.z + R]];
    let O = [-1, -1, -1, -1];
    const gx = Math.floor(s.x / SH), gz = Math.floor(s.z / SH);
    const cand = [];
    for (let a = -4; a <= 4; a++)
      for (let b = -4; b <= 4; b++) {
        const arr = hash.get(key(gx + a, gz + b));
        if (arr) for (const j of arr) if (j !== i) cand.push([Math.hypot(sites[j].x - s.x, sites[j].z - s.z), j]);
      }
    cand.sort((p, q) => p[0] - q[0]);
    for (const [d, j] of cand) {
      let md = 0;
      for (const p of P) md = Math.max(md, Math.hypot(p[0] - s.x, p[1] - s.z));
      if (d * 0.5 > md + 1e-6) break;
      const t = sites[j];
      const nx = (t.x - s.x) / d, nz = (t.z - s.z) / d;
      const mx = (t.x + s.x) / 2, mz = (t.z + s.z) / 2;
      [P, O] = clipHalf(P, O, nx, nz, nx * mx + nz * mz, t.ghost ? -2 : j);
      if (P.length < 3) break;
    }
    if (P.length >= 3) cells[i] = { P, O };
  }
  return cells;
}

function nearestOutline(T, x, z) {
  const poly = T.poly, n = poly.length;
  let bi = 0, bd = 1e9;
  for (let i = 0; i < n; i++) {
    const d = (poly[i][0] - x) ** 2 + (poly[i][1] - z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  const a = poly[(bi + n - 1) % n], b = poly[(bi + 1) % n];
  const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
  return { x: poly[bi][0], z: poly[bi][1], nx: tz / l, nz: -tx / l };
}
function nearestRiver(T, x, z) {
  const pts = T.river.pts, n = pts.length;
  let bi = 0, bd = 1e9;
  for (let i = 0; i < n; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  const a = pts[Math.max(0, bi - 1)], b = pts[Math.min(n - 1, bi + 1)];
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return { x: pts[bi].x, z: pts[bi].z, hw: pts[bi].hw, tx: tx / l, tz: tz / l };
}

// 將 cell 裁在島內（距邊 >=14）與河道外（岸邊保留 >=7.5）
function trimCell(T, P, O, site) {
  for (let it = 0; it < 5; it++) {
    let worst = -1e9, wp = null;
    for (const p of P) {
      const d = T.islandSdf(p[0], p[1]);
      if (d > worst) { worst = d; wp = p; }
    }
    if (worst <= -13.5) break;
    const q = nearestOutline(T, wp[0], wp[1]);
    [P, O] = clipHalf(P, O, q.nx, q.nz, q.nx * q.x + q.nz * q.z - 14, -2);
    if (P.length < 3) return null;
  }
  for (let it = 0; it < 5; it++) {
    let worst = 1e9, wp = null;
    for (const p of P) {
      const d = T.riverSdf(p[0], p[1]);
      if (d < worst) { worst = d; wp = p; }
    }
    if (worst >= 7.4) break;
    const q = nearestRiver(T, wp[0], wp[1]);
    let nx = -q.tz, nz = q.tx;
    if (nx * (site.x - q.x) + nz * (site.z - q.z) < 0) { nx = -nx; nz = -nz; }
    [P, O] = clipHalf(P, O, -nx, -nz, -(nx * q.x + nz * q.z + q.hw + 7.5), -3);
    if (P.length < 3) return null;
  }
  [P, O] = dedupe(P, O);
  if (P.length < 3) return null;
  return [P, O];
}

function lerpInt(poly, v, getU, getV) {
  let lo = 1e9, hi = -1e9;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const pv = getV(p), qv = getV(q);
    if ((pv - v) * (qv - v) > 0 || pv === qv) continue;
    const u = getU(p) + ((getU(q) - getU(p)) * (v - pv)) / (qv - pv);
    if (u < lo) lo = u;
    if (u > hi) hi = u;
  }
  return [lo, hi];
}

function splitLots(P, target, rng, out, depth = 0) {
  const A = Math.abs(polyArea(P));
  if (A < target * 1.75 || depth > 5) { out.push(P); return; }
  let bi = 0, bl = 0;
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) { bl = l; bi = i; }
  }
  const a = P[bi], b = P[(bi + 1) % n];
  const ux = (b[0] - a[0]) / bl, uz = (b[1] - a[1]) / bl, vx = -uz, vz = ux;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const p of P) {
    const u = p[0] * ux + p[1] * uz, v = p[0] * vx + p[1] * vz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const useU = u1 - u0 >= v1 - v0;
  const ax = useU ? ux : vx, az = useU ? uz : vz, lo = useU ? u0 : v0, hi = useU ? u1 : v1;
  const t = lo + (hi - lo) * rng.range(0.4, 0.6);
  const [A1] = clipHalf(P, null, ax, az, t);
  const [A2] = clipHalf(P, null, -ax, -az, -t);
  if (A1.length < 3 || A2.length < 3 || Math.abs(polyArea(A1)) < target * 0.42 || Math.abs(polyArea(A2)) < target * 0.42) { out.push(P); return; }
  splitLots(A1, target, rng, out, depth + 1);
  splitLots(A2, target, rng, out, depth + 1);
}

// 在凸多邊形 lot 內，以「前緣」為基準擬合最大矩形
function fitLot(lot, block, zone, rng) {
  const n = lot.length;
  let best = -1, bs = 0;
  for (let i = 0; i < n; i++) {
    const a = lot[i], b = lot[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 3) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let on = false;
    for (let k = 0; k < block.length; k++) {
      const p = block[k], q = block[(k + 1) % block.length];
      if (distToSeg(mx, mz, p[0], p[1], q[0], q[1]) < 0.25) { on = true; break; }
    }
    const sc = l * (on ? 1 : 0.12);
    if (sc > bs) { bs = sc; best = i; }
  }
  if (best < 0) return null;
  const A = lot[best], B = lot[(best + 1) % n];
  const l = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const dx = (B[0] - A[0]) / l, dz = (B[1] - A[1]) / l;
  const Zx = dz, Zz = -dx;
  const Xx = Zz, Xz = -Zx;
  // 內縮：前緣用 setback，其餘用 margin
  const m = MARGIN[zone] * rng.range(0.85, 1.4), sb = SETBACK[zone] * rng.range(0.75, 1.5);
  let Q = lot.map((p) => p.slice());
  for (let i = 0; i < n; i++) {
    const a = lot[i], b = lot[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez);
    if (el < 1e-6) continue;
    const nx = ez / el, nz = -ex / el;
    const d = i === best ? sb : m;
    [Q] = clipHalf(Q, null, nx, nz, nx * a[0] + nz * a[1] - d);
    if (Q.length < 3) return null;
  }
  const toUV = (p) => [(p[0] - A[0]) * Xx + (p[1] - A[1]) * Xz, (p[0] - A[0]) * Zx + (p[1] - A[1]) * Zz];
  const uv = Q.map(toUV);
  let vmax = -1e9, vmin = 1e9;
  for (const p of uv) { vmax = Math.max(vmax, p[1]); vmin = Math.min(vmin, p[1]); }
  const Dmax = vmax - vmin;
  if (Dmax < 5) return null;
  const gu = (p) => p[0], gv = (p) => p[1];
  let bestA = 0, bw = 0, bd = 0, buc = 0;
  for (let k = 0; k < 14; k++) {
    const D = Dmax * (0.22 + (0.78 * k) / 13);
    const I1 = lerpInt(uv, vmax - 0.001, gu, gv), I2 = lerpInt(uv, vmax - D, gu, gv);
    const lo = Math.max(I1[0], I2[0]), hi = Math.min(I1[1], I2[1]);
    const W = hi - lo;
    if (W < 5 || D < 5) continue;
    // 以面積為主，輕微偏好接近正方
    const asp = Math.min(W / D, D / W);
    const score = W * D * (0.55 + 0.45 * asp);
    if (score > bestA) { bestA = score; bw = W; bd = D; buc = (lo + hi) / 2; }
  }
  if (bw < 5) return null;
  const [mw, md] = MAXWD[zone];
  const W = Math.min(bw, mw), D = Math.min(bd, md);
  const vc = vmax - D / 2;
  const cx = A[0] + Xx * buc + Zx * vc, cz = A[1] + Xz * buc + Zz * vc;
  const yaw = Math.atan2(Zx, Zz);
  return { cx, cz, yaw, W, D, frontX: Zx, frontZ: Zz };
}

export function generateLayout(T, seed = 20260101, onProgress) {
  const rng = new RNG(seed);
  const poly = T.poly;
  const sites = [];
  const SH = 60;
  const hash = new Map();
  const key = (x, z) => Math.floor(x / SH) + ',' + Math.floor(z / SH);
  const addSite = (x, z, ghost, rad, zone) => {
    const s = { x, z, ghost, rad, zone, id: sites.length };
    sites.push(s);
    const k = key(x, z);
    let a = hash.get(k);
    if (!a) hash.set(k, (a = []));
    a.push(s.id);
    return s;
  };
  // 外圍虛擬點（讓邊緣 cell 有界）
  for (let i = 0; i < poly.length; i += 5) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    addSite(poly[i][0] + (tz / l) * 34, poly[i][1] - (tx / l) * 34, true, 40, 'res');
  }
  const bb = T.bbox;
  let tries = 0;
  while (tries++ < 70000 && sites.length < 700) {
    const x = rng.range(bb.minx, bb.maxx), z = rng.range(bb.minz, bb.maxz);
    if (T.islandSdf(x, z) > -17) continue;
    if (T.riverSdf(x, z) < 5) continue;
    const zone = zoneAt(T, x, z);
    const rad = RAD[zone];
    const gx = Math.floor(x / SH), gz = Math.floor(z / SH);
    let ok = true;
    for (let i = -2; i <= 2 && ok; i++)
      for (let j = -2; j <= 2 && ok; j++) {
        const a = hash.get(gx + i + ',' + (gz + j));
        if (!a) continue;
        for (const id of a) {
          const s = sites[id];
          if (Math.hypot(s.x - x, s.z - z) < (s.rad + rad) * 0.5 * (s.ghost ? 0.55 : 1)) { ok = false; break; }
        }
      }
    if (ok) addSite(x, z, false, rad, zone);
  }
  // Lloyd 鬆弛一次，讓街區更均勻
  let raw = buildCells(sites);
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i], c = raw[i];
    if (s.ghost || !c) continue;
    const t = trimCell(T, c.P, c.O, s);
    if (!t) continue;
    const ct = polyCentroid(t[0]);
    const nx = s.x + (ct[0] - s.x) * 0.7, nz = s.z + (ct[1] - s.z) * 0.7;
    if (T.islandSdf(nx, nz) < -17 && T.riverSdf(nx, nz) > 5) {
      s.x = nx; s.z = nz;
    }
  }
  raw = buildCells(sites);
  onProgress && onProgress(0.3);

  const parkDefs = T.parks;
  const cells = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i], c = raw[i];
    if (s.ghost || !c) continue;
    const t = trimCell(T, c.P, c.O, s);
    if (!t) continue;
    const [P, O] = t;
    if (Math.abs(polyArea(P)) < 350) continue;
    const ct = polyCentroid(P);
    const zone = zoneAt(T, ct[0], ct[1]);
    let kind = 'block';
    for (const p of parkDefs) if (Math.hypot(ct[0] - p.x, ct[1] - p.z) < p.r * 0.95) kind = 'park';
    const sd = T.islandSdf(ct[0], ct[1]);
    if (kind === 'block' && sd > -62 && (zone === 'res' || zone === 'old') && hashInt(i, 77) % 100 < 38) kind = 'park';
    if (kind === 'block' && (zone === 'res' || zone === 'old' || zone === 'mid') && hashInt(i, 91) % 100 < 7) kind = 'park';
    cells.push({ id: i, site: s, P, O, zone, kind, centroid: ct });
  }
  // 中央廣場
  let plaza = null, pd = 1e9;
  for (const c of cells) {
    const d = Math.hypot(c.centroid[0] - CENTER.x, c.centroid[1] - CENTER.z);
    if (d < pd) { pd = d; plaza = c; }
  }
  if (plaza) { plaza.kind = 'plaza'; plaza.zone = 'core'; }
  for (const c of cells) if (c !== plaza && Math.hypot(c.centroid[0] - plaza.centroid[0], c.centroid[1] - plaza.centroid[1]) < 52 && c.kind === 'block') c.kind = 'plaza2';
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const zoneOf = (id) => (cellById.get(id) ? cellById.get(id).zone : null);

  // 街區多邊形（扣除街道）
  const streetHalf = (cell) => (oid) => {
    if (oid < 0) return oid === -3 ? 2.6 : 4.4; // 河邊/邊緣步道
    const h = hashInt(Math.min(cell.id, oid), Math.max(cell.id, oid), 9173) % 100;
    let d = h < 15 ? 5.0 : h < 30 ? 3.7 : 3.0;
    if (cell.zone === 'core' || cell.zone === 'mid') d += 0.7;
    return d;
  };
  const lots = [];
  for (const c of cells) {
    const half = streetHalf(c);
    const kindInset = c.kind === 'park' ? () => 1.8 : c.kind === 'plaza' || c.kind === 'plaza2' ? () => 2.2 : (oid) => half(oid);
    const r = insetPoly(c.P, c.O, kindInset);
    if (!r) { c.kind = 'void'; continue; }
    const [B, BO] = dedupe(r[0], r[1]);
    if (B.length < 3 || Math.abs(polyArea(B)) < 200) { c.kind = 'void'; continue; }
    c.block = B;
    c.blockO = BO;
    if (c.kind !== 'block') continue;
    const out = [];
    splitLots(B, TARGET[c.zone], rng, out);
    c.lots = [];
    for (const lp of out) {
      const fit = fitLot(lp, B, c.zone, rng);
      if (!fit) continue;
      const lot = { poly: lp, cell: c, zone: c.zone, ...fit, area: Math.abs(polyArea(lp)) };
      lots.push(lot);
      c.lots.push(lot);
    }
  }
  onProgress && onProgress(0.6);
  return { sites, cells, lots, plaza, streetHalf };
}
