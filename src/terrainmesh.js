import * as THREE from 'three';
import { MeshBuilder } from './mesh.js';
import { GROUND } from './ground.js';
import { ISL, RIVER_Y, POND } from './world.js';
import { clamp, vnoise, TAU, rgb, mix3 } from './util.js';

function quadUp(B, a, b, c, d, col, sh, uv) {
  const cy = (b[2] - a[2]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[2] - b[2]);
  if (cy >= 0) B.quad(a, b, c, d, col, sh, uv);
  else B.quad(d, c, b, a, col, sh, uv ? [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]] : undefined);
}

// 把島外的點拉回島邊界（保持網格乾淨收邊）
export function clampToIsland(T, x, z, dTarget = 1.5) {
  const d = T.islandSdf(x, z);
  if (d <= dTarget) return [x, z];
  const gx = (T.islandSdf(x + 1, z) - T.islandSdf(x - 1, z)) * 0.5, gz = (T.islandSdf(x, z + 1) - T.islandSdf(x, z - 1)) * 0.5;
  const l = Math.hypot(gx, gz) || 1;
  const s = d - dTarget;
  return [x - (gx / l) * s, z - (gz / l) * s];
}

// ---------- 地形（分 chunk 輸出） ----------
export function buildTerrain(T, chunks, res = 4) {
  const bb = T.bbox;
  const x0 = Math.floor((bb.minx - 16) / res) * res, z0 = Math.floor((bb.minz - 16) / res) * res;
  const nx = Math.ceil((bb.maxx + 16 - x0) / res) + 1, nz = Math.ceil((bb.maxz + 16 - z0) / res) + 1;
  const X = new Float32Array(nx * nz), Z = new Float32Array(nx * nz), Y = new Float32Array(nx * nz), D = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * res, z = z0 + j * res;
      const d = T.islandSdf(x, z);
      D[k] = d;
      const [px, pz] = clampToIsland(T, x, z, 1.5);
      X[k] = px;
      Z[k] = pz;
      Y[k] = T.heightAt(px, pz);
    }
  const S = GROUND.size;
  const col = [1, 1, 1];
  const nrm = (i, j) => {
    const k = j * nx + i;
    const ia = Math.max(0, i - 1), ib = Math.min(nx - 1, i + 1), ja = Math.max(0, j - 1), jb = Math.min(nz - 1, j + 1);
    const dx = (Y[j * nx + ib] - Y[j * nx + ia]) / ((ib - ia) * res), dz = (Y[jb * nx + i] - Y[ja * nx + i]) / ((jb - ja) * res);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  };
  let tris = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k00 = j * nx + i, k10 = k00 + 1, k01 = k00 + nx, k11 = k01 + 1;
      if (D[k00] > 2.5 && D[k10] > 2.5 && D[k01] > 2.5 && D[k11] > 2.5) continue;
      const ks = [k00, k01, k11, k10];
      const ij = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
      const ch = chunks.get((X[k00] + X[k11]) / 2, (Z[k00] + Z[k11]) / 2).terrain;
      const pos = [], nor = [], uv = [], cl = [];
      for (let q = 0; q < 4; q++) {
        const k = ks[q];
        pos.push(X[k], Y[k], Z[k]);
        const n = nrm(ij[q][0], ij[q][1]);
        nor.push(n[0], n[1], n[2]);
        uv.push((X[k] - GROUND.x0) / S, (Z[k] - GROUND.z0) / S);
        cl.push(col[0], col[1], col[2]);
      }
      ch.raw(pos, nor, cl, uv, [0, 1, 2, 0, 2, 3]);
      tris += 2;
    }
  return tris;
}

// ---------- 岩石底座（倒山）+ 頂部邊緣 ----------
export function buildSkirt(T) {
  const B = new MeshBuilder();
  const poly = T.poly;
  const N = poly.length / 2;
  const prof = [
    [1.0, -9, 2.2], [0.992, -24, 0], [0.955, -58, 0], [0.88, -100, 0], [0.74, -146, 0], [0.55, -190, 0], [0.32, -228, 0], [0.1, -254, 0],
  ];
  const top = rgb(0x9fae7c), soil = rgb(0xb9a98c), rockA = rgb(0xa89d8c), rockB = rgb(0x8d8374), tip = rgb(0x7d7467);
  const ring = (k) => {
    const [f, y, push] = prof[k];
    const pts = [];
    for (let i = 0; i < N; i++) {
      const p = poly[i * 2];
      const dx = p[0] - ISL.cx, dz = p[1] - ISL.cz;
      const l = Math.hypot(dx, dz);
      const nzs = vnoise(p[0] * 0.035 + k * 5.3, p[1] * 0.035 - k * 2.1, 3) - 0.5;
      const nys = vnoise(p[0] * 0.05 - k * 3.7, p[1] * 0.05 + k * 1.9, 8) - 0.5;
      const amp = k === 0 ? 0 : 6 + k * 5;
      const r = l * f + push + nzs * amp;
      pts.push([ISL.cx + (dx / l) * r, y + nys * (k === 0 ? 0 : 9 + k * 3), ISL.cz + (dz / l) * r]);
    }
    return pts;
  };
  const rings = prof.map((_, k) => ring(k));
  const colAt = (k, j) => {
    const t = k / (prof.length - 1);
    let c = k === 0 ? top : k === 1 ? soil : mix3(rockA, rockB, clamp((k - 2) / 4, 0, 1));
    if (k >= prof.length - 2) c = mix3(rockB, tip, 0.5);
    const v = 0.9 + 0.18 * vnoise(j * 0.7 + k * 3.1, k * 1.7, 11);
    return [c[0] * v, c[1] * v, c[2] * v];
  };
  const apex = [ISL.cx + 6, -270, ISL.cz - 4];
  for (let k = 0; k < prof.length - 1; k++)
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      const A = rings[k][j], Bp = rings[k][j2], C = rings[k + 1][j2], D = rings[k + 1][j];
      B.quad(A, Bp, C, D, colAt(k, j), [1, 1, 0.94, 0.94]);
    }
  const kl = prof.length - 1;
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    B.tri(rings[kl][j], rings[kl][j2], apex, colAt(kl, j), [0.9, 0.9, 0.8]);
  }
  return B;
}

// ---------- 水面 ----------
export function buildWater(T) {
  const B = new MeshBuilder();
  const pts = T.river.pts;
  const n = pts.length;
  const L = [], R = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    const w = pts[i].hw + 1.6;
    const lp = clampToIsland(T, pts[i].x + nx * w, pts[i].z + nz * w, -0.6);
    const rp = clampToIsland(T, pts[i].x - nx * w, pts[i].z - nz * w, -0.6);
    if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    L.push([lp[0], RIVER_Y, lp[1], acc / 12]);
    R.push([rp[0], RIVER_Y, rp[1], acc / 12]);
  }
  const wc = [1, 1, 1];
  for (let i = 0; i < n - 1; i++) {
    const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1];
    // 跳過完全在島外（已被夾到邊界、面積為零）的段
    if (T.islandSdf(pts[i].x, pts[i].z) > 4 && T.islandSdf(pts[i + 1].x, pts[i + 1].z) > 4) continue;
    quadUp(B, [a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]], [d[0], d[1], d[2]], wc, 1, [-1, a[3], 1, b[3], 1, c[3], -1, d[3]]);
  }
  // 池塘
  const seg = 56;
  const cx = POND.x, cz = POND.z, r = POND.r + 0.9, y = POND.y;
  for (let i = 0; i < seg; i++) {
    const a0 = (i * TAU) / seg, a1 = ((i + 1) * TAU) / seg;
    quadUp(B, [cx, y, cz], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx, y, cz], wc, 1, [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  return B;
}

// 河流離島處的瀑布
export function buildWaterfall(T) {
  const pts = T.river.pts;
  let idx = -1;
  for (let i = 0; i < pts.length; i++) if (T.islandSdf(pts[i].x, pts[i].z) > -1) { idx = i; break; }
  if (idx < 1) return null;
  const a = pts[idx - 1], b = pts[idx];
  const sa = T.islandSdf(a.x, a.z), sb = T.islandSdf(b.x, b.z);
  const t = clamp((-1 - sa) / (sb - sa), 0, 1);
  const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, hw = a.hw + (b.hw - a.hw) * t;
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  const nx = -tz / l, nz = tx / l;
  const w = hw * 0.97;
  const g = new THREE.BufferGeometry();
  const P = [x + nx * w, RIVER_Y, z + nz * w, x - nx * w, RIVER_Y, z - nz * w, x - nx * w, -86, z - nz * w, x + nx * w, -86, z + nz * w];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return { geo: g, x, z, hw, tx: tx / l, tz: tz / l };
}
