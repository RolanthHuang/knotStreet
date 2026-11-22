import * as THREE from 'three';

// 環面紐結 T(p,q)：沿弧長取樣，附帶「貼在環面上的帶狀面」座標框 (T, N, Z)
// 條帶座標：x = 弧長 s、y = 沿環面外法線 N 的高度、z = 橫向（Z = T×N），右手系，映射保持繞向。
export class KnotCurve {
  constructor({ R = 118, r = 48, p = 5, q = 2 } = {}) {
    this.R = R; this.r = r; this.p = p; this.q = q;
    const pt = (t) => {
      const a = p * t, b = q * t, k = R + r * Math.cos(b);
      return [k * Math.cos(a), r * Math.sin(b), k * Math.sin(a)];
    };
    const dpt = (t) => {
      const a = p * t, b = q * t, k = R + r * Math.cos(b);
      return [-q * r * Math.sin(b) * Math.cos(a) - p * k * Math.sin(a), q * r * Math.cos(b), -q * r * Math.sin(b) * Math.sin(a) + p * k * Math.cos(a)];
    };
    const nrm = (t) => {
      const a = p * t, b = q * t;
      return [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
    };
    const N0 = 60000, TAU = Math.PI * 2;
    const cum = new Float64Array(N0 + 1);
    let prev = pt(0);
    for (let i = 1; i <= N0; i++) {
      const c = pt((i / N0) * TAU);
      cum[i] = cum[i - 1] + Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]);
      prev = c;
    }
    const total = cum[N0];
    const M = Math.round(total / 0.5);
    this.M = M;
    this.ds = total / M;
    this.L = total;
    this.P = new Float32Array(3 * M);
    this.T = new Float32Array(3 * M);
    this.N = new Float32Array(3 * M);
    this.Z = new Float32Array(3 * M);
    let j = 0;
    for (let k = 0; k < M; k++) {
      const target = k * this.ds;
      while (j < N0 - 1 && cum[j + 1] < target) j++;
      const f = (target - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      const t = ((j + f) / N0) * TAU;
      const P = pt(t), d = dpt(t), n = nrm(t);
      const dl = Math.hypot(d[0], d[1], d[2]);
      const T = [d[0] / dl, d[1] / dl, d[2] / dl];
      const Z = [T[1] * n[2] - T[2] * n[1], T[2] * n[0] - T[0] * n[2], T[0] * n[1] - T[1] * n[0]];
      for (let a = 0; a < 3; a++) {
        this.P[3 * k + a] = P[a]; this.T[3 * k + a] = T[a]; this.N[3 * k + a] = n[a]; this.Z[3 * k + a] = Z[a];
      }
    }
    this._o = [0, 0, 0];
  }
  _idx(s) {
    let u = s / this.ds;
    u -= Math.floor(u / this.M) * this.M;
    const k = Math.floor(u), f = u - k;
    return [k % this.M, (k + 1) % this.M, f];
  }
  // 條帶座標 → 世界座標，寫入 o
  map(x, y, z, o) {
    const [k, k2, f] = this._idx(x), P = this.P, N = this.N, Z = this.Z, g = 1 - f;
    for (let a = 0; a < 3; a++) {
      o[a] = P[3 * k + a] * g + P[3 * k2 + a] * f + y * (N[3 * k + a] * g + N[3 * k2 + a] * f) + z * (Z[3 * k + a] * g + Z[3 * k2 + a] * f);
    }
    return o;
  }
  point(x, y, z) {
    const o = this.map(x, y, z, [0, 0, 0]);
    return new THREE.Vector3(o[0], o[1], o[2]);
  }
  // 座標框（T,N,Z 單位向量）
  frame(s, T, N, Z) {
    const [k, k2, f] = this._idx(s), g = 1 - f;
    const set = (A, S) => {
      for (let a = 0; a < 3; a++) A.setComponent(a, S[3 * k + a] * g + S[3 * k2 + a] * f);
      return A.normalize();
    };
    set(T, this.T); set(N, this.N); set(Z, this.Z);
  }
  // 世界座標 → 最近的條帶座標
  nearest(wx, wy, wz) {
    let best = 1e18, bk = 0;
    for (let k = 0; k < this.M; k += 4) {
      const dx = wx - this.P[3 * k], dy = wy - this.P[3 * k + 1], dz = wz - this.P[3 * k + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bk = k; }
    }
    let bs = bk * this.ds;
    for (let it = 0; it < 3; it++) {
      const k = Math.floor(bs / this.ds) % this.M;
      const dx = wx - this.P[3 * k], dy = wy - this.P[3 * k + 1], dz = wz - this.P[3 * k + 2];
      bs += dx * this.T[3 * k] + dy * this.T[3 * k + 1] + dz * this.T[3 * k + 2];
    }
    bs = ((bs % this.L) + this.L) % this.L;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), Z = new THREE.Vector3(), P = this.point(bs, 0, 0);
    this.frame(bs, T, N, Z);
    const d = new THREE.Vector3(wx, wy, wz).sub(P);
    return { s: bs, h: d.dot(N), u: d.dot(Z), dist: d.length() };
  }
}

// 把條帶座標系的 MeshBuilder 彎曲到紐結上：沿 x 方向細分，逐頂點映射，重算平面法線
export function bendBuilder(B, curve, maxDx = 6) {
  const P = B.p, C = B.c, UV = B.u, I = B.i, NS = B.n;
  const op = [], oc = [], ou = [], on = [], os = [];
  const stack = [];
  const o = [0, 0, 0];
  const W = new Float64Array(9);
  const emit = (t) => {
    for (let v = 0; v < 3; v++) {
      curve.map(t[v * 11], t[v * 11 + 1], t[v * 11 + 2], o);
      W[v * 3] = o[0]; W[v * 3 + 1] = o[1]; W[v * 3 + 2] = o[2];
    }
    const ux = W[3] - W[0], uy = W[4] - W[1], uz = W[5] - W[2], vx = W[6] - W[0], vy = W[7] - W[1], vz = W[8] - W[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let v = 0; v < 3; v++) {
      op.push(W[v * 3], W[v * 3 + 1], W[v * 3 + 2]);
      on.push(nx, ny, nz);
      oc.push(t[v * 11 + 3], t[v * 11 + 4], t[v * 11 + 5]);
      ou.push(t[v * 11 + 6], t[v * 11 + 7]);
      os.push(t[v * 11 + 8], t[v * 11 + 9], t[v * 11 + 10]);
    }
  };
  const mid = (t, a, b) => {
    const m = new Float64Array(11);
    for (let k = 0; k < 11; k++) m[k] = (t[a * 11 + k] + t[b * 11 + k]) * 0.5;
    return m;
  };
  const mk = (...vs) => {
    const t = new Float64Array(33);
    vs.forEach((v, i) => t.set(v, i * 11));
    return t;
  };
  const vert = (t, i) => t.subarray(i * 11, i * 11 + 11);
  for (let i = 0; i < I.length; i += 3) {
    const t = new Float64Array(33);
    for (let v = 0; v < 3; v++) {
      const k = I[i + v];
      t[v * 11] = P[3 * k]; t[v * 11 + 1] = P[3 * k + 1]; t[v * 11 + 2] = P[3 * k + 2];
      t[v * 11 + 3] = C[3 * k]; t[v * 11 + 4] = C[3 * k + 1]; t[v * 11 + 5] = C[3 * k + 2];
      t[v * 11 + 6] = UV[2 * k]; t[v * 11 + 7] = UV[2 * k + 1];
      t[v * 11 + 8] = NS[3 * k]; t[v * 11 + 9] = NS[3 * k + 1]; t[v * 11 + 10] = NS[3 * k + 2];
    }
    stack.push(t);
    while (stack.length) {
      const tr = stack.pop();
      const x0 = tr[0], x1 = tr[11], x2 = tr[22];
      if (Math.max(x0, x1, x2) - Math.min(x0, x1, x2) <= maxDx) { emit(tr); continue; }
      const d01 = Math.abs(x0 - x1), d12 = Math.abs(x1 - x2), d20 = Math.abs(x2 - x0);
      const a = vert(tr, 0), b = vert(tr, 1), c = vert(tr, 2);
      if (d01 >= d12 && d01 >= d20) { const m = mid(tr, 0, 1); stack.push(mk(a, m, c), mk(m, b, c)); }
      else if (d12 >= d20) { const m = mid(tr, 1, 2); stack.push(mk(a, b, m), mk(a, m, c)); }
      else { const m = mid(tr, 2, 0); stack.push(mk(a, b, m), mk(m, b, c)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(op), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(on), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(oc), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ou), 2));
  g.setAttribute('nstrip', new THREE.BufferAttribute(new Float32Array(os), 3));
  g.computeBoundingSphere();
  return g;
}
