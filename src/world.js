import { smoothstep, clamp, lerp, distToSeg, catmull, fbm, TAU } from './util.js';

// ====================== 島形（腦形輪廓） ======================
export const ISL = { cx: 0, cz: 15, rx: 330, rz: 400 };
const HARM = [[2, 0.055, 0.7], [3, 0.06, 2.1], [4, 0.04, 0.2], [5, 0.03, 1.3], [7, 0.022, 2.7], [9, 0.015, 0.9], [13, 0.011, 1.9], [21, 0.008, 0.4], [29, 0.006, 2.4]];
export function radiusAt(th) {
  const c = Math.cos(th), s = Math.sin(th);
  const re = (ISL.rx * ISL.rz) / Math.hypot(ISL.rz * c, ISL.rx * s);
  let m = 1;
  for (const [k, a, p] of HARM) m += a * Math.sin(k * th + p);
  const d = Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2));
  m *= 1 - 0.085 * Math.exp(-(d * d) / (2 * 0.1 * 0.1)); // 北側縱裂
  return re * m;
}
export function outline(n = 288) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const r = radiusAt(th);
    pts.push([ISL.cx + Math.cos(th) * r, ISL.cz + Math.sin(th) * r]);
  }
  return pts;
}

export class Grid {
  constructor(x0, z0, x1, z1, res) {
    this.x0 = x0; this.z0 = z0; this.res = res;
    this.nx = Math.ceil((x1 - x0) / res) + 1;
    this.nz = Math.ceil((z1 - z0) / res) + 1;
    this.data = new Float32Array(this.nx * this.nz);
  }
  fill(fn) {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) this.data[j * this.nx + i] = fn(this.x0 + i * this.res, this.z0 + j * this.res);
  }
  sample(x, z) {
    let fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    fx = clamp(fx, 0, this.nx - 1.001);
    fz = clamp(fz, 0, this.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const d = this.data, nx = this.nx;
    const a = d[j * nx + i], b = d[j * nx + i + 1], c = d[(j + 1) * nx + i], e = d[(j + 1) * nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
  }
}

// ====================== 河流 ======================
const RIVER_CTRL = [
  [-46, -292, 9], [-54, -262, 10], [-75, -232, 11.5], [-96, -190, 12.5], [-86, -135, 13.5], [-66, -85, 15], [-82, -32, 16.5],
  [-112, 20, 17.5], [-124, 78, 18.5], [-110, 138, 19.5], [-90, 200, 21], [-80, 255, 26], [-68, 310, 34], [-62, 365, 48], [-58, 425, 62], [-56, 480, 70],
];
export const RIVER_Y = -0.9;
export const POND = { x: 186, z: 100, r: 40, y: -0.45 };

export function makeRiver() {
  const pts = catmull(RIVER_CTRL, 8).map((p) => ({ x: p[0], z: p[1], hw: p[2] }));
  const n = pts.length;
  const segLen = [];
  for (let i = 0; i < n - 1; i++) segLen.push(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z));
  function sdf(x, z) {
    let best = 1e9;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) - (a.hw + (b.hw - a.hw) * t);
      if (d < best) best = d;
    }
    return best;
  }
  // 於指定 z 取中心點、半寬與切線（z 單調遞增）
  function atZ(z) {
    for (let i = 0; i < n - 1; i++) {
      if (pts[i + 1].z >= z) {
        const a = pts[i], b = pts[i + 1];
        const t = clamp((z - a.z) / Math.max(1e-6, b.z - a.z), 0, 1);
        const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz);
        return { x: lerp(a.x, b.x, t), z, hw: lerp(a.hw, b.hw, t), tx: tx / l, tz: tz / l };
      }
    }
    const a = pts[n - 1];
    return { x: a.x, z: a.z, hw: a.hw, tx: 0, tz: 1 };
  }
  return { pts, sdf, atZ, ctrl: RIVER_CTRL };
}

// ====================== 世界（地形函式、SDF） ======================
export class Terrain {
  constructor() {
    this.poly = outline(288);
    this.river = makeRiver();
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of this.poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    this.bbox = { minx, maxx, minz, maxz };
    const pad = 40;
    this.sdfGrid = new Grid(minx - pad, minz - pad, maxx + pad, maxz + pad, 3);
    this.sdfGrid.fill((x, z) => this._islandSdfExact(x, z));
    this.parks = [{ x: 244, z: 228, r: 78, amp: 5.5 }, { x: -222, z: 128, r: 46, amp: 3.2 }];
  }
  _islandSdfExact(x, z) {
    const dx = x - ISL.cx, dz = z - ISL.cz;
    const th = Math.atan2(dz, dx);
    const r = radiusAt(th), dist = Math.hypot(dx, dz);
    const d0 = dist - r;
    if (Math.abs(d0) > 110) return d0 * 0.92;
    const N = this.poly.length;
    const idx = Math.round((((th + TAU) % TAU) / TAU) * N) % N;
    let best = 1e9;
    for (let k = -30; k <= 30; k++) {
      const i = (idx + k + N) % N, j = (i + 1) % N;
      const d = distToSeg(x, z, this.poly[i][0], this.poly[i][1], this.poly[j][0], this.poly[j][1]);
      if (d < best) best = d;
    }
    return d0 < 0 ? -best : best;
  }
  islandSdf(x, z) {
    return this.sdfGrid.sample(x, z);
  }
  riverSdf(x, z) {
    return this.river.sdf(x, z);
  }
  heightAt(x, z) {
    const d = this.islandSdf(x, z);
    const rimT = smoothstep(-5, 1.5, d);
    let h = -9 * rimT * rimT;
    // 綠帶起伏
    const hm = smoothstep(-44, -34, d) * (1 - smoothstep(-10, -5, d));
    if (hm > 0) h += hm * (fbm(x * 0.012, z * 0.012, 3, 5) - 0.45) * 10;
    for (const p of this.parks) {
      const dd = Math.hypot(x - p.x, z - p.z) / p.r;
      if (dd < 1) h += p.amp * (1 - smoothstep(0.35, 1, dd)) * (0.6 + 0.8 * fbm(x * 0.02, z * 0.02, 2, 9));
    }
    // 河道
    if (d < 20) {
      const rs = this.river.sdf(x, z);
      if (rs < 9) h += -3.3 * (1 - smoothstep(-2.5, 6.5, rs)) + (rs < 6.5 ? 0 : 0);
    }
    // 池塘
    const pd = Math.hypot(x - POND.x, z - POND.z) - POND.r;
    if (pd < 4) h += -1.7 * (1 - smoothstep(-6, 2.5, pd));
    return h;
  }
  waterAt(x, z) {
    if (this.islandSdf(x, z) > 1) return -Infinity;
    if (this.river.sdf(x, z) < 0.4) return RIVER_Y;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.5) return POND.y;
    return -Infinity;
  }
}
