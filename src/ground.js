import * as THREE from 'three';
import { RNG, hashInt, polyCentroid, rgb, cssRgb } from './util.js';
import { clipHalf } from './layout.js';
import { SUN_DIR } from './materials.js';

export const GROUND = { size: 900, x0: 0, z0: 0 };

const PAVE = {
  old: ['#d9cfba', '#d3c8b0', '#dccfb7', '#d6ccb8', '#e0d4bc'],
  mid: ['#dedacd', '#d9d5c8', '#e2ded2'],
  core: ['#e6e3d9', '#e1ded3'],
  res: ['#b9d097', '#aecb8c', '#c3d79f', '#b2cc91', '#bdd39a'],
  harbor: ['#c8c4b8', '#c0bcb0', '#cbc7bb'],
};

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

export function shrinkPoly(poly, d) {
  let Q = poly.map((p) => p.slice());
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    if (l < 1e-6) continue;
    const nx = ez / l, nz = -ex / l;
    [Q] = clipHalf(Q, null, nx, nz, nx * a[0] + nz * a[1] - d);
    if (Q.length < 3) return null;
  }
  return Q;
}

// 把整座島的地面（街道、街區、公園、廣場、岸邊、烘焙陰影）畫進一張貼圖
export function paintGround(T, L, shadows, treeDots, size = 4096) {
  const bb = T.bbox;
  GROUND.x0 = (bb.minx + bb.maxx) / 2 - GROUND.size / 2;
  GROUND.z0 = (bb.minz + bb.maxz) / 2 - GROUND.size / 2;
  const S = size / GROUND.size;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2efe4';
  g.fillRect(0, 0, size, size);
  g.setTransform(S, 0, 0, S, -GROUND.x0 * S, -GROUND.z0 * S);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const path = (pts) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) (i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]));
    g.closePath();
  };
  const rng = new RNG(4242);

  // 島面草地底色 + 大塊色斑
  path(T.poly);
  g.fillStyle = '#b4cc92';
  g.fill();
  g.save();
  g.clip();
  for (let i = 0; i < 520; i++) {
    const x = rng.range(bb.minx, bb.maxx), z = rng.range(bb.minz, bb.maxz), r = rng.range(14, 60);
    const gr = g.createRadialGradient(x, z, 0, x, z, r);
    const light = rng.chance(0.5);
    gr.addColorStop(0, light ? 'rgba(214,230,170,0.22)' : 'rgba(120,160,100,0.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, z - r, r * 2, r * 2);
  }
  // 邊緣深色帶
  path(T.poly);
  g.strokeStyle = 'rgba(110,140,90,0.38)';
  g.lineWidth = 16;
  g.stroke();
  g.strokeStyle = 'rgba(120,105,85,0.55)';
  g.lineWidth = 2.4;
  g.stroke();
  g.restore();

  // 河岸（石砌堤岸）與河床
  const rp = T.river.pts;
  for (let i = 0; i < rp.length - 1; i++) {
    g.strokeStyle = '#d2cbb8';
    g.lineWidth = 2 * (rp[i].hw + 6.5);
    g.beginPath();
    g.moveTo(rp[i].x, rp[i].z);
    g.lineTo(rp[i + 1].x, rp[i + 1].z);
    g.stroke();
  }
  for (let i = 0; i < rp.length - 1; i++) {
    g.strokeStyle = '#bdb5a1';
    g.lineWidth = 2 * (rp[i].hw + 2.2);
    g.beginPath();
    g.moveTo(rp[i].x, rp[i].z);
    g.lineTo(rp[i + 1].x, rp[i + 1].z);
    g.stroke();
  }
  for (let i = 0; i < rp.length - 1; i++) {
    g.strokeStyle = '#86a5a3';
    g.lineWidth = 2 * (rp[i].hw + 0.4);
    g.beginPath();
    g.moveTo(rp[i].x, rp[i].z);
    g.lineTo(rp[i + 1].x, rp[i + 1].z);
    g.stroke();
  }
  // 池塘
  g.fillStyle = '#c9c2ae';
  g.beginPath();
  g.arc(186, 100, 47, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#86a5a3';
  g.beginPath();
  g.arc(186, 100, 41, 0, Math.PI * 2);
  g.fill();

  // 街區
  for (const c of L.cells) {
    if (!c.block) continue;
    path(c.P);
    g.fillStyle = '#cdc7b8';
    g.fill();
  }
  for (const c of L.cells) {
    if (!c.block) continue;
    const B = c.block;
    if (c.kind === 'park') {
      path(B);
      g.fillStyle = '#a7c785';
      g.fill();
      g.save();
      g.clip();
      const ct = c.centroid;
      for (let i = 0; i < 26; i++) {
        const x = ct[0] + rng.range(-45, 45), z = ct[1] + rng.range(-45, 45), r = rng.range(8, 24);
        const gr = g.createRadialGradient(x, z, 0, x, z, r);
        gr.addColorStop(0, rng.chance(0.5) ? 'rgba(210,232,160,0.35)' : 'rgba(90,140,90,0.25)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, z - r, r * 2, r * 2);
      }
      // 步道：從幾個邊中點連到中心附近
      g.strokeStyle = '#ece4cc';
      g.lineWidth = 2.2;
      const n = B.length;
      const cx0 = ct[0] + rng.range(-6, 6), cz0 = ct[1] + rng.range(-6, 6);
      for (let k = 0; k < 3; k++) {
        const i = (hashInt(c.id, k, 5) % n + n) % n;
        const a = B[i], b = B[(i + 1) % n];
        g.beginPath();
        g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        g.quadraticCurveTo((a[0] + cx0) / 2 + rng.range(-8, 8), (a[1] + cz0) / 2 + rng.range(-8, 8), cx0, cz0);
        g.stroke();
      }
      g.restore();
      continue;
    }
    if (c.kind === 'plaza' || c.kind === 'plaza2') {
      path(B);
      g.fillStyle = c.kind === 'plaza' ? '#e8e1ce' : '#e3ddcc';
      g.fill();
      g.save();
      g.clip();
      const ct = c.centroid;
      g.strokeStyle = 'rgba(180,168,140,0.55)';
      g.lineWidth = 0.35;
      for (let r = 4; r < 60; r += 4) {
        g.beginPath();
        g.arc(ct[0], ct[1], r, 0, Math.PI * 2);
        g.stroke();
      }
      for (let a = 0; a < 24; a++) {
        g.beginPath();
        g.moveTo(ct[0], ct[1]);
        g.lineTo(ct[0] + Math.cos((a * Math.PI) / 12) * 60, ct[1] + Math.sin((a * Math.PI) / 12) * 60);
        g.stroke();
      }
      g.restore();
      continue;
    }
    // 一般街區：人行道 + 地塊
    path(B);
    g.fillStyle = '#e8e2d2';
    g.fill();
    if (!c.lots) continue;
    const pal = PAVE[c.zone] || PAVE.old;
    for (const lot of c.lots) {
      const sp = shrinkPoly(lot.poly, 0.9);
      if (!sp) continue;
      path(sp);
      g.fillStyle = pal[hashInt((lot.cx * 7) | 0, (lot.cz * 7) | 0, 3) % pal.length];
      g.fill();
      if (c.zone === 'res') {
        // 前院小徑
        g.fillStyle = '#e4dcc6';
        const px = lot.cx + lot.frontX * (lot.D / 2 + 1.5), pz = lot.cz + lot.frontZ * (lot.D / 2 + 1.5);
        g.save();
        g.translate(px, pz);
        g.rotate(-lot.yaw);
        g.fillRect(-0.9, -2.6, 1.8, 5.2);
        g.restore();
      }
    }
  }
  // 大道中線
  g.setLineDash([2.4, 2.8]);
  g.strokeStyle = 'rgba(255,252,238,0.95)';
  g.lineWidth = 0.28;
  g.lineCap = 'butt';
  for (const c of L.cells) {
    const n = c.P.length;
    for (let i = 0; i < n; i++) {
      const oid = c.O[i];
      if (oid < 0 || oid < c.id) continue;
      if (hashInt(Math.min(c.id, oid), Math.max(c.id, oid), 9173) % 100 >= 15) continue;
      const a = c.P[i], b = c.P[(i + 1) % n];
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  }
  g.setLineDash([]);
  g.lineCap = 'round';

  // 烘焙陰影 / 接地暗角
  const sx = SUN_DIR.x, sz = SUN_DIR.z, sy = SUN_DIR.y;
  const dirX = -sx / sy, dirZ = -sz / sy;
  g.shadowColor = 'rgba(40,40,60,0.5)';
  g.shadowBlur = 5;
  for (const r of shadows) {
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const hw = r.W / 2 + 0.5, hd = r.D / 2 + 0.5;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [r.cx + x * c + z * s, r.cz - x * s + z * c]);
    const len = Math.min(r.h * 0.9, 75);
    const pts = corners.concat(corners.map((p) => [p[0] + dirX * len, p[1] + dirZ * len]));
    const hp = hull(pts);
    g.fillStyle = 'rgba(70,72,96,0.16)';
    path(hp);
    g.fill();
    g.fillStyle = 'rgba(70,60,50,0.12)';
    path(corners);
    g.fill();
  }
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.fillStyle = 'rgba(60,70,60,0.2)';
  for (const t of treeDots) {
    g.beginPath();
    g.ellipse(t[0] + 0.9, t[1] - 0.6, t[2] * 1.1, t[2] * 0.85, 0, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
