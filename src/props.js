import * as THREE from 'three';
import { MeshBuilder, pbox, lathe, cone, Mx } from './mesh.js';
import { rgb, RNG, clamp } from './util.js';

// ---------- 樹 / 路燈 幾何 ----------
function treeRound() {
  const B = new MeshBuilder();
  const trunk = rgb(0x8a6a4c), leaf = rgb(0x7fa662), leaf2 = rgb(0x95b872);
  pbox(B, -0.22, 0, -0.22, 0.22, 2.0, 0.22, trunk, 0.8);
  lathe(B, 0, 1.4, 0, [[0.0, 0], [1.7, 0.7], [2.15, 2.0], [1.5, 3.3], [0.0, 4.1]], 6, leaf, { shadeB: 0.78 });
  lathe(B, 0.35, 3.4, 0.2, [[0.0, 0], [1.1, 0.5], [1.2, 1.2], [0.0, 1.9]], 5, leaf2, { shadeB: 0.85 });
  return B;
}
function treeCone() {
  const B = new MeshBuilder();
  const trunk = rgb(0x7d614a), leaf = rgb(0x5f8f5b), leaf2 = rgb(0x6fa066);
  pbox(B, -0.2, 0, -0.2, 0.2, 1.6, 0.2, trunk, 0.8);
  cone(B, 0, 1.2, 0, 1.9, 3.6, 6, leaf, { shadeB: 0.7 });
  cone(B, 0, 3.4, 0, 1.45, 3.2, 6, leaf2, { shadeB: 0.8 });
  cone(B, 0, 5.4, 0, 0.95, 2.6, 6, leaf, { shadeB: 0.85 });
  return B;
}
function treeBlossom() {
  const B = new MeshBuilder();
  const trunk = rgb(0x8c6d55), leaf = rgb(0xe9b7b0), leaf2 = rgb(0xf2cfc6);
  pbox(B, -0.2, 0, -0.2, 0.2, 1.8, 0.2, trunk, 0.8);
  lathe(B, 0, 1.5, 0, [[0.0, 0], [1.9, 0.5], [2.2, 1.5], [1.4, 2.7], [0.0, 3.2]], 6, leaf, { shadeB: 0.8 });
  lathe(B, 0.4, 2.8, 0.1, [[0.0, 0], [1.0, 0.4], [0.9, 1.0], [0.0, 1.4]], 5, leaf2, { shadeB: 0.9 });
  return B;
}
function lampGeo() {
  const B = new MeshBuilder();
  const metal = rgb(0x6d7378), glow = rgb(0xfff1c8);
  pbox(B, -0.09, 0, -0.09, 0.09, 4.4, 0.09, metal, 0.8);
  pbox(B, -0.09, 4.3, -0.09, 0.9, 4.45, 0.09, metal, 1);
  pbox(B, 0.55, 4.05, -0.22, 1.0, 4.3, 0.22, glow, 1);
  return B;
}

const CH = 128;
export class Props {
  constructor() {
    this.trees = [new Map(), new Map(), new Map()];
    this.lamps = [];
    this.treeCount = 0;
  }
  tree(kind, x, y, z, s, rot, rng) {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let a = this.trees[kind].get(k);
    if (!a) this.trees[kind].set(k, (a = []));
    const tint = kind === 2 ? 1 : 0.88 + rng.f() * 0.26;
    a.push([x, y, z, s, rot, tint, 0.92 + rng.f() * 0.2, 0.9 + rng.f() * 0.2]);
    this.treeCount++;
  }
  lamp(x, y, z, rot) {
    this.lamps.push([x, y, z, rot]);
  }
  build(group, mat) {
    const geos = [treeRound().toGeometry(), treeCone().toGeometry(), treeBlossom().toGeometry()];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let kind = 0; kind < 3; kind++)
      for (const [, arr] of this.trees[kind]) {
        const im = new THREE.InstancedMesh(geos[kind], mat, arr.length);
        arr.forEach((t, i) => {
          e.set(0, t[4], 0);
          q.setFromEuler(e);
          p.set(t[0], t[1], t[2]);
          sc.set(t[3], t[3] * (0.85 + (t[5] - 0.88) * 0.8), t[3]);
          m4.compose(p, q, sc);
          im.setMatrixAt(i, m4);
          col.setRGB(t[5], t[6], t[7]);
          im.setColorAt(i, col);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
        n++;
      }
    if (this.lamps.length) {
      const im = new THREE.InstancedMesh(lampGeo().toGeometry(), mat, this.lamps.length);
      this.lamps.forEach((l, i) => {
        e.set(0, l[3], 0);
        q.setFromEuler(e);
        p.set(l[0], l[1], l[2]);
        sc.set(1, 1, 1);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
      n++;
    }
    return n;
  }
}
