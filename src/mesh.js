import * as THREE from 'three';
import { polyArea, clamp, TAU } from './util.js';

// ---------- 3x4 矩陣（欄向量：X,Y,Z,平移） ----------
export const Mx = {
  I: () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  T: (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z],
  RY: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0, 1, 0, s, 0, c, 0, 0, 0];
  },
  RX: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, c, s, 0, -s, c, 0, 0, 0];
  },
  RZ: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0];
  },
  // A∘B：先 B 後 A
  mul: (A, B) => {
    const r = new Array(12);
    for (let j = 0; j < 3; j++) {
      const bx = B[j * 3], by = B[j * 3 + 1], bz = B[j * 3 + 2];
      r[j * 3] = A[0] * bx + A[3] * by + A[6] * bz;
      r[j * 3 + 1] = A[1] * bx + A[4] * by + A[7] * bz;
      r[j * 3 + 2] = A[2] * bx + A[5] * by + A[8] * bz;
    }
    const tx = B[9], ty = B[10], tz = B[11];
    r[9] = A[0] * tx + A[3] * ty + A[6] * tz + A[9];
    r[10] = A[1] * tx + A[4] * ty + A[7] * tz + A[10];
    r[11] = A[2] * tx + A[5] * ty + A[8] * tz + A[11];
    return r;
  },
  basis: (X, Y, Z, T) => [X[0], X[1], X[2], Y[0], Y[1], Y[2], Z[0], Z[1], Z[2], T[0], T[1], T[2]],
  apply: (M, x, y, z) => [
    M[0] * x + M[3] * y + M[6] * z + M[9],
    M[1] * x + M[4] * y + M[7] * z + M[10],
    M[2] * x + M[5] * y + M[8] * z + M[11],
  ],
  // 圍繞點 (cx,cz) 的 Y 軸旋轉
  rotAbout: (cx, cz, a) => Mx.mul(Mx.T(cx, 0, cz), Mx.mul(Mx.RY(a), Mx.T(-cx, 0, -cz))),
  place: (x, y, z, yaw) => Mx.mul(Mx.T(x, y, z), Mx.RY(yaw)),
};

// ---------- 合併網格建構器 ----------
export class MeshBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.u = [];
    this.i = [];
    this.nv = 0;
    this.m = null;
    this.st = [];
  }
  get tris() {
    return this.i.length / 3;
  }
  push(m) {
    this.st.push(this.m);
    this.m = this.m ? Mx.mul(this.m, m) : m;
    return this;
  }
  pop() {
    this.m = this.st.pop();
    return this;
  }
  _t(a) {
    const m = this.m;
    if (!m) return a;
    const x = a[0], y = a[1], z = a[2];
    return [m[0] * x + m[3] * y + m[6] * z + m[9], m[1] * x + m[4] * y + m[7] * z + m[10], m[2] * x + m[5] * y + m[8] * z + m[11]];
  }
  _v(P, nx, ny, nz, col, s, u, v) {
    this.p.push(P[0], P[1], P[2]);
    this.n.push(nx, ny, nz);
    this.c.push(col[0] * s, col[1] * s, col[2] * s);
    this.u.push(u, v);
    return this.nv++;
  }
  // 四邊形：a,b,c,d 逆時針（由外側看）。sh: 單一數值或 4 個頂點明暗。uv: [u0,v0,...]
  quad(a, b, c, d, col, sh, uv) {
    const A = this._t(a), B = this._t(b), C = this._t(c), D = this._t(d);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) {
      // 退化：嘗試用另一個三角
      const wx = D[0] - A[0], wy = D[1] - A[1], wz = D[2] - A[2];
      nx = vy * wz - vz * wy; ny = vz * wx - vx * wz; nz = vx * wy - vy * wx;
      l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return;
    }
    nx /= l; ny /= l; nz /= l;
    const s0 = Array.isArray(sh) ? sh[0] : sh === undefined ? 1 : sh;
    const s1 = Array.isArray(sh) ? sh[1] : s0;
    const s2 = Array.isArray(sh) ? sh[2] : s0;
    const s3 = Array.isArray(sh) ? sh[3] : s0;
    const b0 = this._v(A, nx, ny, nz, col, s0, uv ? uv[0] : 0, uv ? uv[1] : 0);
    this._v(B, nx, ny, nz, col, s1, uv ? uv[2] : 0, uv ? uv[3] : 0);
    this._v(C, nx, ny, nz, col, s2, uv ? uv[4] : 0, uv ? uv[5] : 0);
    this._v(D, nx, ny, nz, col, s3, uv ? uv[6] : 0, uv ? uv[7] : 0);
    this.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  }
  tri(a, b, c, col, sh, uv) {
    const A = this._t(a), B = this._t(b), C = this._t(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    const s0 = Array.isArray(sh) ? sh[0] : sh === undefined ? 1 : sh;
    const s1 = Array.isArray(sh) ? sh[1] : s0;
    const s2 = Array.isArray(sh) ? sh[2] : s0;
    const b0 = this._v(A, nx, ny, nz, col, s0, uv ? uv[0] : 0, uv ? uv[1] : 0);
    this._v(B, nx, ny, nz, col, s1, uv ? uv[2] : 0, uv ? uv[3] : 0);
    this._v(C, nx, ny, nz, col, s2, uv ? uv[4] : 0, uv ? uv[5] : 0);
    this.i.push(b0, b0 + 1, b0 + 2);
  }
  // 直接加入頂點資料（地形、帶狀物用），不經變換
  raw(pos, nor, col, uv, idx) {
    const base = this.nv;
    for (let k = 0; k < pos.length; k++) this.p.push(pos[k]);
    for (let k = 0; k < nor.length; k++) this.n.push(nor[k]);
    for (let k = 0; k < col.length; k++) this.c.push(col[k]);
    for (let k = 0; k < uv.length; k++) this.u.push(uv[k]);
    for (let k = 0; k < idx.length; k++) this.i.push(base + idx[k]);
    this.nv += pos.length / 3;
  }
  isEmpty() {
    return this.nv === 0;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
    g.setIndex(new THREE.BufferAttribute(this.nv > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// 建築/地標繪製上下文：W = 帶窗戶貼圖的牆面，P = 純色（屋頂/細節）
export class Ctx {
  constructor(W, P, bw = 3.2, fh = 3.3) {
    this.W = W;
    this.P = P;
    this.bw = bw;
    this.fh = fh;
    this.shadeB = 0.8;
  }
  push(m) {
    this.W.push(m);
    this.P.push(m);
    return this;
  }
  pop() {
    this.W.pop();
    this.P.pop();
    return this;
  }
}

// ---------- 牆面（帶窗貼圖 UV，自動吸附整數開間/樓層） ----------
export function wallFace(ctx, p, q, y0, y1, col, o = {}) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (len < 1e-4 || y1 - y0 < 1e-4) return;
  const bw = o.bw || ctx.bw, fh = o.fh || ctx.fh;
  const nb = Math.max(1, Math.round(len / bw));
  const nf = Math.max(1, Math.round((y1 - y0) / fh));
  const sb = o.shadeB !== undefined ? o.shadeB : ctx.shadeB, st = o.shadeT !== undefined ? o.shadeT : 1;
  const B = o.plain ? ctx.P : ctx.W;
  B.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], col, [sb, sb, st, st], [0, 0, nb, 0, nb, nf, 0, nf]);
}

// 軸對齊方盒。側面→W，頂→P。o.plain: 側面也畫純色；o.noTop；o.bottom；o.sides: 位元遮罩 1=-x 2=+z 4=+x 8=-z
export function box(ctx, x0, y0, z0, x1, y1, z1, wallCol, topCol, o = {}) {
  const sides = o.sides === undefined ? 15 : o.sides;
  if (sides & 1) wallFace(ctx, [x0, z0], [x0, z1], y0, y1, wallCol, o);
  if (sides & 2) wallFace(ctx, [x0, z1], [x1, z1], y0, y1, wallCol, o);
  if (sides & 4) wallFace(ctx, [x1, z1], [x1, z0], y0, y1, wallCol, o);
  if (sides & 8) wallFace(ctx, [x1, z0], [x0, z0], y0, y1, wallCol, o);
  if (!o.noTop) ctx.P.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], topCol || wallCol);
  if (o.bottom) ctx.P.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], o.bottomCol || [0.3, 0.3, 0.3]);
}

// 純色方盒（全部畫在單一 builder）。shB：底部頂點明暗
export function pbox(B, x0, y0, z0, x1, y1, z1, col, shB = 0.85, noBottom = true) {
  const sb = shB, st = 1;
  B.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, [sb, sb, st, st]);
  B.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [sb, sb, st, st]);
  B.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, [sb, sb, st, st]);
  B.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, [sb, sb, st, st]);
  B.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], col);
  if (!noBottom) B.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, 0.6);
}

// 旋轉方盒（繞自身中心 Y 旋轉）
export function rbox(B, cx, cy, cz, sx, sy, sz, yaw, col, shB = 0.85) {
  B.push(Mx.mul(Mx.T(cx, cy, cz), Mx.RY(yaw)));
  pbox(B, -sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2, col, shB, false);
  B.pop();
}

// 兩端點之間的細長方柱（任意方向，如桁架/纜索）
export function beam(B, a, b, t, col, up = [0, 1, 0]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-6) return;
  const Z = [dx / L, dy / L, dz / L];
  let X = [up[1] * Z[2] - up[2] * Z[1], up[2] * Z[0] - up[0] * Z[2], up[0] * Z[1] - up[1] * Z[0]];
  let lx = Math.hypot(X[0], X[1], X[2]);
  if (lx < 1e-4) {
    X = [1, 0, 0];
    lx = 1;
  }
  X = [X[0] / lx, X[1] / lx, X[2] / lx];
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  B.push(Mx.basis(X, Y, Z, a));
  const h = t / 2;
  // 局部：沿 Z 從 0..L
  B.quad([-h, -h, 0], [-h, h, 0], [h, h, 0], [h, -h, 0], col, 1);
  B.quad([-h, -h, L], [h, -h, L], [h, h, L], [-h, h, L], col, 1);
  B.quad([-h, -h, 0], [-h, -h, L], [-h, h, L], [-h, h, 0], col, 0.8);
  B.quad([h, -h, L], [h, -h, 0], [h, h, 0], [h, h, L], col, 0.8);
  B.quad([-h, h, 0], [-h, h, L], [h, h, L], [h, h, 0], col, 1);
  B.quad([-h, -h, L], [-h, -h, 0], [h, -h, 0], [h, -h, L], col, 0.7);
  B.pop();
}

// ---------- 耳切法三角化 ----------
function ptInTri(p, a, b, c) {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
export function triangulate(pts) {
  const n = pts.length;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const sgn = polyArea(pts) >= 0 ? 1 : -1;
  const res = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 2000) {
    let found = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr * sgn <= 1e-9) continue;
      let inside = false;
      for (let m = 0; m < idx.length; m++) {
        const j = idx[m];
        if (j === i0 || j === i1 || j === i2) continue;
        if (ptInTri(pts[j], a, b, c)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      res.push([i0, i1, i2]);
      idx.splice(k, 1);
      found = true;
      break;
    }
    if (!found) {
      res.push([idx[0], idx[1], idx[2]]);
      idx.splice(1, 1);
    }
  }
  if (idx.length === 3) res.push([idx[0], idx[1], idx[2]]);
  return res;
}

// 多邊形（[x,z] 陣列，任意方向）→ 統一成「由上往下看頂面為正」的方向（x,z 面積為負）
export function orient(poly) {
  return polyArea(poly) > 0 ? poly.slice().reverse() : poly;
}

// 擠出多邊形：牆→W、頂→P
export function extrude(ctx, poly, y0, y1, wallCol, topCol, o = {}) {
  const P = orient(poly);
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    wallFace(ctx, a, b, y0, y1, wallCol, o);
  }
  if (!o.noTop) {
    const tris = triangulate(P);
    for (const t of tris) ctx.P.tri([P[t[0]][0], y1, P[t[0]][1]], [P[t[1]][0], y1, P[t[1]][1]], [P[t[2]][0], y1, P[t[2]][1]], topCol || wallCol);
  }
}

export function ngon(cx, cz, r, n, a0 = 0, sx = 1, sz = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 - (i * TAU) / n;
    pts.push([cx + Math.cos(a) * r * sx, cz + Math.sin(a) * r * sz]);
  }
  return pts;
}

export function cylinder(ctx, cx, cz, y0, y1, r, n, wallCol, topCol, o = {}) {
  extrude(ctx, ngon(cx, cz, r, n, o.a0 || 0), y0, y1, wallCol, topCol, o);
}

// ---------- 旋轉體（圓頂、錐、尖塔、水塔...）----------
// profile: [[半徑, y], ...] 由下而上；colFn(k) 可依段落變色
export function lathe(B, cx, cy, cz, profile, n, col, o = {}) {
  const a0 = o.a0 || 0;
  const rings = profile.map(([r, y]) => {
    const ring = [];
    for (let j = 0; j < n; j++) {
      const a = a0 - (j * TAU) / n;
      ring.push([cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r]);
    }
    return ring;
  });
  for (let k = 0; k < profile.length - 1; k++) {
    const c = o.colFn ? o.colFn(k) : col;
    const r0 = profile[k][0], r1 = profile[k + 1][0];
    const sb = o.shadeB !== undefined ? o.shadeB : 0.9;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      const a = rings[k][j], b = rings[k][j2], cc = rings[k + 1][j2], d = rings[k + 1][j];
      if (r0 < 1e-6) B.tri(a, cc, d, c, [sb, 1, 1]);
      else if (r1 < 1e-6) B.tri(a, b, cc, c, [sb, sb, 1]);
      else B.quad(a, b, cc, d, c, [sb, sb, 1, 1]);
    }
  }
  if (o.capTop) {
    const k = profile.length - 1;
    for (let j = 1; j < n - 1; j++) B.tri(rings[k][0], rings[k][j + 1], rings[k][j], o.capCol || col);
    // 方向：頂面朝上 → 需 (0, j+1, j)?? 下方保證朝上
  }
}

export function cone(B, cx, cy, cz, r, h, n, col, o = {}) {
  lathe(B, cx, cy, cz, [[r, 0], [0, h]], n, col, o);
}
export function domeProfile(r, h, rings = 6, startAng = 0) {
  const pr = [];
  for (let k = 0; k <= rings; k++) {
    const e = startAng + ((Math.PI / 2 - startAng) * k) / rings;
    pr.push([Math.cos(e) * r, Math.sin(e) * h]);
  }
  return pr;
}

// ---------- 屋頂 ----------
// 切面屋頂（山牆）：脊線沿 x。x0..x1,z0..z1 為牆體矩形；ov 屋簷外伸

// 雙面薄片：正面 + 反向暗色底面（屋簷底面不再透空）
export function sheet(B, a, b, c, d, col, sh) {
  B.quad(a, b, c, d, col, sh);
  const u = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55];
  const r = Array.isArray(sh) ? [sh[3], sh[2], sh[1], sh[0]] : sh;
  B.quad(d, c, b, a, u, r);
}
export function gable(ctx, x0, z0, x1, z1, y0, rise, roofCol, wallCol, o = {}) {
  const ov = o.ov !== undefined ? o.ov : 0.4;
  const zc = (z0 + z1) / 2;
  const hs = (z1 - z0) / 2;
  const slope = rise / hs;
  const ye = y0 - ov * slope, yr = y0 + rise;
  const xa = x0 - ov, xb = x1 + ov, za = z0 - ov, zb = z1 + ov;
  const P = ctx.P;
  const sh = [0.92, 0.92, 1, 1];
  sheet(P, [xb, ye, za], [xa, ye, za], [xa, yr, zc], [xb, yr, zc], roofCol, sh);
  sheet(P, [xa, ye, zb], [xb, ye, zb], [xb, yr, zc], [xa, yr, zc], roofCol, sh);
  // 山牆三角
  P.tri([x1, y0, z1], [x1, y0, z0], [x1, yr, zc], wallCol, [0.9, 0.9, 1]);
  P.tri([x0, y0, z0], [x0, y0, z1], [x0, yr, zc], wallCol, [0.9, 0.9, 1]);
  if (o.ridgeCap) {
    pbox(P, xa, yr - 0.05, zc - 0.18, xb, yr + 0.14, zc + 0.18, o.ridgeCap, 1);
  }
}

// 歇山/四坡屋頂（脊線沿較長邊）
export function hip(ctx, x0, z0, x1, z1, y0, rise, roofCol, o = {}) {
  const ov = o.ov !== undefined ? o.ov : 0.4;
  const w = x1 - x0, d = z1 - z0;
  if (d > w) {
    // 轉 90°
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    ctx.push(Mx.rotAbout(cx, cz, Math.PI / 2));
    hip(ctx, cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2, y0, rise, roofCol, o);
    ctx.pop();
    return;
  }
  const zc = (z0 + z1) / 2;
  const hd = d / 2;
  const slope = rise / hd;
  const ye = y0 - ov * slope, yr = y0 + rise;
  const xa = x0 - ov, xb = x1 + ov, za = z0 - ov, zb = z1 + ov;
  const rx0 = x0 + hd, rx1 = x1 - hd;
  const P = ctx.P;
  const sh = [0.92, 0.92, 1, 1];
  sheet(P, [xb, ye, za], [xa, ye, za], [rx0, yr, zc], [rx1, yr, zc], roofCol, sh);
  sheet(P, [xa, ye, zb], [xb, ye, zb], [rx1, yr, zc], [rx0, yr, zc], roofCol, sh);
  P.tri([xa, ye, za], [xa, ye, zb], [rx0, yr, zc], roofCol, [0.92, 0.92, 1]);
  P.tri([xb, ye, zb], [xb, ye, za], [rx1, yr, zc], roofCol, [0.92, 0.92, 1]);
}

export function pyramid(P, cx, y0, cz, hw, hd, h, col) {
  const sh = [0.92, 0.92, 1];
  P.tri([cx + hw, y0, cz - hd], [cx - hw, y0, cz - hd], [cx, y0 + h, cz], col, sh);
  P.tri([cx - hw, y0, cz + hd], [cx + hw, y0, cz + hd], [cx, y0 + h, cz], col, sh);
  P.tri([cx - hw, y0, cz - hd], [cx - hw, y0, cz + hd], [cx, y0 + h, cz], col, sh);
  P.tri([cx + hw, y0, cz + hd], [cx + hw, y0, cz - hd], [cx, y0 + h, cz], col, sh);
}

// 單坡屋頂：z0 側低 (yl)，z1 側高 (yh)
export function shed(ctx, x0, z0, x1, z1, yl, yh, roofCol, wallCol, o = {}) {
  const P = ctx.P;
  const ov = o.ov !== undefined ? o.ov : 0.3;
  sheet(P, [x1 + ov, yl, z0 - ov], [x0 - ov, yl, z0 - ov], [x0 - ov, yh, z1 + ov], [x1 + ov, yh, z1 + ov], roofCol, [0.92, 0.92, 1, 1]);
  // 側面三角
  P.tri([x1, yl, z1], [x1, yl, z0], [x1, yh, z1], wallCol, [0.9, 0.9, 1]);
  P.tri([x0, yl, z0], [x0, yl, z1], [x0, yh, z1], wallCol, [0.9, 0.9, 1]);
  // 高側牆
  P.quad([x0, yl, z1], [x1, yl, z1], [x1, yh, z1], [x0, yh, z1], wallCol, [0.85, 0.85, 1, 1]);
}

// 錐台（矩形外框 → 內縮矩形），可作為 mansard/退縮冠頂
export function frustumRect(B, x0, z0, x1, z1, y0, ix0, iz0, ix1, iz1, y1, col, topCol) {
  const sh = [0.9, 0.9, 1, 1];
  B.quad([x1, y0, z0], [x0, y0, z0], [ix0, y1, iz0], [ix1, y1, iz0], col, sh);
  B.quad([x0, y0, z1], [x1, y0, z1], [ix1, y1, iz1], [ix0, y1, iz1], col, sh);
  B.quad([x0, y0, z0], [x0, y0, z1], [ix0, y1, iz1], [ix0, y1, iz0], col, sh);
  B.quad([x1, y0, z1], [x1, y0, z0], [ix1, y1, iz0], [ix1, y1, iz1], col, sh);
  if (topCol) B.quad([ix0, y1, iz0], [ix0, y1, iz1], [ix1, y1, iz1], [ix1, y1, iz0], topCol);
}

// ---------- 帶拱形開口的牆（半圓拱） ----------
// O 原點，U 沿牆，V 向上，Nn 外法線（U×V=Nn 右手系）
export function archWall(B, O, U, V, Nn, s) {
  const seg = s.seg || 10;
  const P = (x, y, z) => [O[0] + U[0] * x + V[0] * y + Nn[0] * z, O[1] + U[1] * x + V[1] * y + Nn[1] * z, O[2] + U[2] * x + V[2] * y + Nn[2] * z];
  const topFn = typeof s.top === 'function' ? s.top : () => s.top;
  const yb = s.yb || 0;
  const col = s.col;
  const colIn = s.colIn || col.map((v) => v * 0.78);
  const colBack = s.colBack || col.map((v) => v * 0.55);
  const depth = s.depth !== undefined ? s.depth : 1.2;
  const holes = (s.holes || []).slice().sort((a, b) => a.c - b.c);
  const sb = s.shadeB !== undefined ? s.shadeB : 0.85;
  const wallQuad = (xa, ya, xb, yb2, ta, tb) => {
    // 由 (xa..xb) 的下緣 ya/yb2 到上緣 ta/tb
    if (ta - ya < 1e-4 && tb - yb2 < 1e-4) return;
    B.quad(P(xa, ya, 0), P(xb, yb2, 0), P(xb, tb, 0), P(xa, ta, 0), col, [sb, sb, 1, 1]);
  };
  let cur = s.x0;
  for (const h of holes) {
    const hl = h.c - h.r, hr = h.c + h.r;
    const ys = h.ys;
    if (hl > cur + 1e-4) wallQuad(cur, yb, hl, yb, topFn(cur), topFn(hl));
    // 拱上方
    for (let j = 0; j < seg; j++) {
      const xa = hl + ((hr - hl) * j) / seg, xb = hl + ((hr - hl) * (j + 1)) / seg;
      const aa = ys + Math.sqrt(Math.max(0, h.r * h.r - (xa - h.c) * (xa - h.c)));
      const ab = ys + Math.sqrt(Math.max(0, h.r * h.r - (xb - h.c) * (xb - h.c)));
      wallQuad(xa, aa, xb, ab, topFn(xa), topFn(xb));
      // 拱內面（intrados）
      if (depth > 0) {
        B.quad(P(xa, aa, -depth), P(xb, ab, -depth), P(xb, ab, 0), P(xa, aa, 0), colIn, [0.85, 0.85, 1, 1]);
        if (!s.through) B.quad(P(xa, yb, -depth), P(xb, yb, -depth), P(xb, ab, -depth), P(xa, aa, -depth), colBack, [0.75, 0.75, 1, 1]);
      }
    }
    // 兩側門框（jamb）
    if (depth > 0 && ys > yb + 1e-3) {
      B.quad(P(hl, yb, 0), P(hl, yb, -depth), P(hl, ys, -depth), P(hl, ys, 0), colIn, 0.85);
      B.quad(P(hr, yb, -depth), P(hr, yb, 0), P(hr, ys, 0), P(hr, ys, -depth), colIn, 0.85);
    }
    // 開口底部（地面/拱底）
    cur = hr;
  }
  if (s.x1 > cur + 1e-4) wallQuad(cur, yb, s.x1, yb, topFn(cur), topFn(s.x1));
}

// ---------- 簡易樓梯 / 柱列 ----------
export function steps(B, x0, z0, x1, z1, y0, n, rise, dir, col) {
  // dir: 0 = 沿 +z 上升前緣在 z1 低，1=+x ... 這裡只做面向 +z 的階梯（高在 z0 側）
  const run = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    const zz0 = z0 + i * run * 0;
    pbox(B, x0, y0, z1 - (i + 1) * run, x1, y0 + rise * (i + 1), z1, col, 0.9);
  }
}

// ---------- 自動朝向的面（給一個「外側」提示向量，自動決定繞序）----------
export function oq(B, a, b, c, d, col, hint, sh, uv) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) {
    B.quad(a, b, c, d, col, sh, uv);
  } else {
    const rs = Array.isArray(sh) ? [sh[3], sh[2], sh[1], sh[0]] : sh;
    const ru = uv ? [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]] : undefined;
    B.quad(d, c, b, a, col, rs, ru);
  }
}
export function ot(B, a, b, c, col, hint, sh) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) B.tri(a, b, c, col, sh);
  else B.tri(c, b, a, col, Array.isArray(sh) ? [sh[2], sh[1], sh[0]] : sh);
}
