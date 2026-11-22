// ---------- 基礎工具 ----------
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const sat = (x) => clamp(x, 0, 1);

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInt(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.r = mulberry32(seed >>> 0);
  }
  f() {
    return this.r();
  }
  range(a, b) {
    return a + (b - a) * this.r();
  }
  int(a, b) {
    return a + Math.floor((b - a + 1) * this.r());
  }
  pick(arr) {
    return arr[Math.floor(this.r() * arr.length)];
  }
  chance(p) {
    return this.r() < p;
  }
  sign() {
    return this.r() < 0.5 ? -1 : 1;
  }
  // items: [[value, weight], ...]
  weighted(items) {
    let t = 0;
    for (const it of items) t += it[1];
    let r = this.r() * t;
    for (const it of items) {
      r -= it[1];
      if (r <= 0) return it[0];
    }
    return items[items.length - 1][0];
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ---------- 顏色（sRGB 數值，shader 內不做色彩空間轉換） ----------
export const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export function jitter(c, rng, amt = 0.06) {
  const k = 1 + (rng.f() - 0.5) * 2 * amt;
  return [clamp(c[0] * k, 0, 1), clamp(c[1] * (1 + (rng.f() - 0.5) * amt), 0, 1), clamp(c[2] * (1 + (rng.f() - 0.5) * amt), 0, 1)];
}
export const cssRgb = (h) => '#' + h.toString(16).padStart(6, '0');

// ---------- 2D 幾何 ----------
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2; // 正值 = 數學逆時針 (x→, z↑)
}
export function polyCentroid(p) {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    const f = p[i][0] * q[1] - q[0] * p[i][1];
    a += f;
    cx += (p[i][0] + q[0]) * f;
    cz += (p[i][1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const v of p) { sx += v[0]; sz += v[1]; }
    return [sx / p.length, sz / p.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}
export function pointInConvex(p, x, z, eps = 0) {
  // p 為正向（逆時針）凸多邊形
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < -eps) return false;
  }
  return true;
}
export function pointInPoly(p, x, z) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
// Catmull-Rom (centripetal 不需要，均勻即可)
export function catmull(pts, perSeg, closed = false) {
  const out = [];
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const q = [];
      for (let d = 0; d < p1.length; d++) {
        q.push(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
      }
      out.push(q);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

// ---------- 值噪聲 ----------
function h2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, seed), b = h2(ix + 1, iy, seed), c = h2(ix, iy + 1, seed), d = h2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x, y, oct = 4, seed = 0) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 31);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
