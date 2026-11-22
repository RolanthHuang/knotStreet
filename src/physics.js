import { clamp } from './util.js';

// 空間雜湊 + OBB 碰撞 + 地板高度查詢（地形 / 方盒頂面 / 橋面）
export class Physics {
  constructor(cell = 32) {
    this.cell = cell;
    this.boxes = [];
    this.grid = new Map();
    this.decks = [];
    this.deckGrid = new Map();
    this.terrainH = () => 0;
    this.waterY = () => -Infinity;
    this.kind = 0; // 0 地形 1 水 2 方盒/橋面
  }
  _k(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }
  _insert(map, id, minx, maxx, minz, maxz) {
    const c = this.cell;
    const ix0 = Math.floor(minx / c), ix1 = Math.floor(maxx / c), iz0 = Math.floor(minz / c), iz1 = Math.floor(maxz / c);
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this._k(ix, iz);
        let a = map.get(k);
        if (!a) map.set(k, (a = []));
        a.push(id);
      }
  }
  // 世界座標 OBB：中心、半長、yaw（與 Mx.RY 同向）、y 範圍
  addBox(cx, cz, hx, hz, yaw, y0, y1, stand = true, tag = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const b = { cx, cz, hx, hz, c, s, y0, y1, stand, tag, minx: cx - ex, maxx: cx + ex, minz: cz - ez, maxz: cz + ez };
    const id = this.boxes.length;
    this.boxes.push(b);
    this._insert(this.grid, id, b.minx, b.maxx, b.minz, b.maxz);
    return b;
  }
  // 局部矩形 → 世界（M 為 Mx.place 產生的 yaw 矩陣；y 為相對 M 的高度）
  addLocal(M, lx0, lz0, lx1, lz1, y0, y1, stand = true, tag = 0) {
    const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
    const wx = M[0] * cx + M[6] * cz + M[9];
    const wz = M[2] * cx + M[8] * cz + M[11];
    const yaw = Math.atan2(-M[2], M[0]);
    return this.addBox(wx, wz, Math.abs(lx1 - lx0) / 2, Math.abs(lz1 - lz0) / 2, yaw, y0 + M[10], y1 + M[10], stand, tag);
  }
  // 橋面/高架：沿軸 (ax,az)→方向 (ux,uz) 長度 L，半寬 hw，ys 為每 step 公尺一個高度樣本
  addDeck(ax, az, ux, uz, L, hw, ys, step = 1) {
    const rx = -uz, rz = ux;
    const d = { ax, az, ux, uz, rx, rz, L, hw, ys, step };
    const xs = [ax + rx * hw, ax - rx * hw, ax + ux * L + rx * hw, ax + ux * L - rx * hw];
    const zs = [az + rz * hw, az - rz * hw, az + uz * L + rz * hw, az + uz * L - rz * hw];
    const id = this.decks.length;
    this.decks.push(d);
    this._insert(this.deckGrid, id, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    return d;
  }
  // 圓形（玩家）與可站立盒子的水平碰撞。p: {x,z}
  collide(p, r, y0, y1, step) {
    let hit = false;
    const cell = this.cell;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const ix0 = Math.floor((p.x - r) / cell), ix1 = Math.floor((p.x + r) / cell);
      const iz0 = Math.floor((p.z - r) / cell), iz1 = Math.floor((p.z + r) / cell);
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = this.grid.get(this._k(ix, iz));
          if (!list) continue;
          for (let q = 0; q < list.length; q++) {
            const b = this.boxes[list[q]];
            if (b.y1 <= y0 + step || b.y0 >= y1) continue;
            if (p.x + r < b.minx || p.x - r > b.maxx || p.z + r < b.minz || p.z - r > b.maxz) continue;
            const dx = p.x - b.cx, dz = p.z - b.cz;
            const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
            const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz);
            const ox = lx - qx, oz = lz - qz;
            const d2 = ox * ox + oz * oz;
            if (d2 >= r * r) continue;
            let nx, nz, pen;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              nx = ox / d;
              nz = oz / d;
              pen = r - d;
            } else {
              const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
              if (px < pz) {
                nx = lx >= 0 ? 1 : -1;
                nz = 0;
                pen = px + r;
              } else {
                nx = 0;
                nz = lz >= 0 ? 1 : -1;
                pen = pz + r;
              }
            }
            p.x += (b.c * nx + b.s * nz) * pen;
            p.z += (-b.s * nx + b.c * nz) * pen;
            moved = true;
            hit = true;
          }
        }
      if (!moved) break;
    }
    return hit;
  }
  // 腳下地板高度
  floor(x, z, feetY, step) {
    const th = this.terrainH(x, z);
    let best = th;
    this.kind = 0;
    const wy = this.waterY(x, z);
    if (wy > th + 0.25) {
      best = Math.max(th, wy - 1.15);
      this.kind = 1;
    }
    const lim = feetY + step;
    const cell = this.cell;
    const k = this._k(Math.floor(x / cell), Math.floor(z / cell));
    const list = this.grid.get(k);
    if (list) {
      for (let q = 0; q < list.length; q++) {
        const b = this.boxes[list[q]];
        if (!b.stand || b.y1 > lim || b.y1 <= best) continue;
        if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue;
        const dx = x - b.cx, dz = z - b.cz;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) {
          best = b.y1;
          this.kind = 2;
        }
      }
    }
    const dl = this.deckGrid.get(k);
    if (dl) {
      for (let q = 0; q < dl.length; q++) {
        const d = this.decks[dl[q]];
        const dxp = x - d.ax, dzp = z - d.az;
        const t = dxp * d.ux + dzp * d.uz;
        if (t < 0 || t > d.L) continue;
        const w = dxp * d.rx + dzp * d.rz;
        if (Math.abs(w) > d.hw) continue;
        const fi = t / d.step, i0 = Math.floor(fi), fr = fi - i0;
        const ys = d.ys;
        const y = ys[Math.min(i0, ys.length - 1)] + (ys[Math.min(i0 + 1, ys.length - 1)] - ys[Math.min(i0, ys.length - 1)]) * fr;
        if (y <= lim && y > best) {
          best = y;
          this.kind = 2;
        }
      }
    }
    return best;
  }
  // 點是否位在任何實體內（鏡頭碰撞用）
  pointBlocked(x, y, z, margin) {
    const th = this.terrainH(x, z);
    if (y < th + 0.15) return true;
    const cell = this.cell;
    const list = this.grid.get(this._k(Math.floor(x / cell), Math.floor(z / cell)));
    if (list) {
      for (let q = 0; q < list.length; q++) {
        const b = this.boxes[list[q]];
        if (y < b.y0 - margin || y > b.y1 + margin) continue;
        if (x < b.minx - margin || x > b.maxx + margin || z < b.minz - margin || z > b.maxz + margin) continue;
        const dx = x - b.cx, dz = z - b.cz;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) <= b.hx + margin && Math.abs(lz) <= b.hz + margin) return true;
      }
    }
    return false;
  }
  // 沿線段取樣，回傳最遠可通行比例 t (0..1)
  segmentFree(ax, ay, az, bx, by, bz, margin = 0.25) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.4));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, margin)) return Math.max(0, (i - 1) / n);
    }
    return 1;
  }
  // 以第一人稱視線射線找出最近的盒子（用於 HUD 顯示建築資訊）
  rayBox(ox, oy, oz, dx, dy, dz, maxD) {
    const step = 0.8;
    const cell = this.cell;
    for (let t = 1; t < maxD; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const list = this.grid.get(this._k(Math.floor(x / cell), Math.floor(z / cell)));
      if (!list) continue;
      for (let q = 0; q < list.length; q++) {
        const b = this.boxes[list[q]];
        if (!b.tag || y < b.y0 || y > b.y1) continue;
        const px = x - b.cx, pz = z - b.cz;
        const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
        if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) return b;
      }
    }
    return null;
  }
}
