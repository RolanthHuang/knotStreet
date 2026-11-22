import * as THREE from 'three';
import { MeshBuilder, pbox } from './mesh.js';
import { clamp, angleLerp, rgb } from './util.js';

const EYE = 1.62, RADIUS = 0.38, HEIGHT = 1.8, STEP = 0.55, GRAV = 22, JUMP = 7.0;

function part(minx, miny, minz, maxx, maxy, maxz, col, shB = 0.82) {
  const B = new MeshBuilder();
  pbox(B, minx, miny, minz, maxx, maxy, maxz, col, shB, false);
  return B.toGeometry();
}

export class Player {
  constructor(camera, dom, physics, scene, mat) {
    this.cam = camera;
    this.dom = dom;
    this.phys = physics;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.fly = false;
    this.third = false;
    this.onGround = true;
    this.kind = 0;
    this.keys = new Set();
    this.locked = false;
    this.useDrag = false;
    this.dragging = false;
    this.camDist = 5.6;
    this.camCur = 5.6;
    this.facing = 0;
    this.phase = 0;
    this.speed = 0;
    this.fovT = 72;
    this.coyote = 0;
    this.flySpeed = 38;
    this.spawn = { x: 0, y: 0, z: 0, yaw: 0 };
    this.enabled = false;
    this.bob = 0;
    this.onAction = null;
    this._buildAvatar(scene, mat);
    this._bind();
  }

  _buildAvatar(scene, mat) {
    const jacket = rgb(0xe0784b), pants = rgb(0x39475f), skin = rgb(0xf0c9a6), cap = rgb(0x2d2f36), shoe = rgb(0x2b2b2f), white = rgb(0xf4efe4);
    const g = new THREE.Group();
    const mk = (geo) => new THREE.Mesh(geo, mat);
    // 軀幹與頭
    const torso = mk(part(-0.26, 0.82, -0.15, 0.26, 1.46, 0.15, jacket));
    const belt = mk(part(-0.265, 0.82, -0.155, 0.265, 0.9, 0.155, pants));
    const head = mk(part(-0.15, 1.5, -0.15, 0.15, 1.8, 0.15, skin, 0.9));
    const hat = mk(part(-0.165, 1.72, -0.165, 0.165, 1.84, 0.165, cap, 0.9));
    const brim = mk(part(-0.14, 1.72, 0.14, 0.14, 1.76, 0.3, cap, 0.9));
    const pack = mk(part(-0.2, 0.95, -0.28, 0.2, 1.4, -0.15, white, 0.85));
    g.add(torso, belt, head, hat, brim, pack);
    const limb = (x, y, geo) => {
      const p = new THREE.Group();
      p.position.set(x, y, 0);
      p.add(mk(geo));
      g.add(p);
      return p;
    };
    this.legL = limb(-0.12, 0.84, part(-0.09, -0.84, -0.1, 0.09, 0, 0.1, pants));
    this.legR = limb(0.12, 0.84, part(-0.09, -0.84, -0.1, 0.09, 0, 0.1, pants));
    const shoeL = mk(part(-0.1, -0.84, -0.1, 0.1, -0.7, 0.2, shoe));
    const shoeR = mk(part(-0.1, -0.84, -0.1, 0.1, -0.7, 0.2, shoe));
    this.legL.add(shoeL);
    this.legR.add(shoeR);
    this.armL = limb(-0.34, 1.42, part(-0.07, -0.58, -0.08, 0.07, 0, 0.08, jacket));
    this.armR = limb(0.34, 1.42, part(-0.07, -0.58, -0.08, 0.07, 0, 0.08, jacket));
    g.traverse((o) => { o.frustumCulled = false; });
    g.visible = false;
    scene.add(g);
    this.avatar = g;
  }

  _bind() {
    const dom = this.dom;
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyV') this.third = !this.third;
      if (e.code === 'KeyF') this.toggleFly();
      if (e.code === 'KeyR') this.respawn();
      if (e.code === 'Space') this.jumpReq = true;
      this.onAction && this.onAction(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    document.addEventListener('pointerlockerror', () => {
      this.useDrag = true;
    });
    const look = (dx, dy) => {
      this.yaw -= dx * 0.0022;
      this.pitch = clamp(this.pitch - dy * 0.0022, -1.5, 1.5);
    };
    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 || e.button === 2) {
        this.dragging = true;
        if (!this.useDrag && !this.locked && dom.requestPointerLock) {
          try {
            const r = dom.requestPointerLock();
            if (r && r.catch) r.catch(() => { this.useDrag = true; });
          } catch (err) {
            this.useDrag = true;
          }
          setTimeout(() => {
            if (!this.locked) this.useDrag = true;
          }, 250);
        }
      }
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) look(e.movementX, e.movementY);
      else if (this.dragging && e.buttons) look(e.movementX, e.movementY);
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        if (this.fly) this.flySpeed = clamp(this.flySpeed * (e.deltaY < 0 ? 1.15 : 0.87), 6, 400);
        else this.camDist = clamp(this.camDist * (e.deltaY < 0 ? 0.9 : 1.1), 2, 16);
      },
      { passive: true }
    );
  }

  setSpawn(x, z, yaw = 0) {
    const y = this.phys.floor(x, z, 1e4, STEP);
    this.spawn = { x, y, z, yaw };
  }
  respawn() {
    this.teleport(this.spawn.x, this.spawn.z, this.spawn.yaw, this.spawn.y);
  }
  teleport(x, z, yaw, y) {
    this.pos.set(x, y !== undefined ? y : this.phys.floor(x, z, 1e4, STEP), z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.onGround = true;
    this.fly = false;
    this.pitch = 0;
  }
  toggleFly() {
    this.fly = !this.fly;
    if (this.fly) {
      this.vel.set(0, 0, 0);
    } else {
      // 降落到下方最高的可站立面
      const y = this.phys.floor(this.pos.x, this.pos.z, this.pos.y, STEP);
      this.pos.y = Math.max(y, this.pos.y);
      this.onGround = false;
    }
  }
  setPose(x, y, z, yaw, pitch) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.fly = true;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    // 方向鍵轉視角
    const lk = 1.9 * dt;
    if (k.has('ArrowLeft')) this.yaw += lk;
    if (k.has('ArrowRight')) this.yaw -= lk;
    if (k.has('ArrowUp')) this.pitch = clamp(this.pitch + lk * 0.8, -1.5, 1.5);
    if (k.has('ArrowDown')) this.pitch = clamp(this.pitch - lk * 0.8, -1.5, 1.5);

    const fw = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const st = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const p = this.pos;

    if (this.fly) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fx = -sy * cp, fy = sp, fz = -cy * cp;
      const rx = cy, rz = -sy;
      let vx = fx * fw + rx * st, vy = fy * fw, vz = fz * fw + rz * st;
      if (k.has('Space')) vy += 1;
      if (k.has('KeyC') || k.has('ControlLeft')) vy -= 1;
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp2 = this.flySpeed * (sprint ? 3 : 1);
      const want = fw || st || k.has('Space') || k.has('KeyC') || k.has('ControlLeft') ? 1 : 0;
      const a = 1 - Math.exp(-8 * dt);
      this.vel.x += (((vx / l) * sp2 * want) - this.vel.x) * a;
      this.vel.y += (((vy / l) * sp2 * want) - this.vel.y) * a;
      this.vel.z += (((vz / l) * sp2 * want) - this.vel.z) * a;
      p.addScaledVector(this.vel, dt);
      this.speed = this.vel.length();
      this.onGround = false;
      this.jumpReq = false;
    } else {
      // 水平期望速度
      let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
      const wl = Math.hypot(wx, wz);
      if (wl > 0) { wx /= wl; wz /= wl; }
      let spd = sprint ? 9.2 : 5.0;
      if (this.kind === 1) spd *= 0.62;
      const accel = this.onGround ? 14 : 3.5;
      const a = 1 - Math.exp(-accel * dt);
      this.vel.x += (wx * spd - this.vel.x) * a;
      this.vel.z += (wz * spd - this.vel.z) * a;
      if (this.onGround) this.coyote = 0.1;
      else this.coyote -= dt;
      if (this.jumpReq && this.coyote > 0) {
        this.vel.y = JUMP;
        this.onGround = false;
        this.coyote = 0;
      }
      this.jumpReq = false;
      const n = Math.max(1, Math.ceil(dt / (1 / 90)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        p.x += this.vel.x * h;
        p.z += this.vel.z * h;
        this.phys.collide(p, RADIUS, p.y, p.y + HEIGHT, STEP);
        if (!this.onGround) this.vel.y -= GRAV * h;
        p.y += this.vel.y * h;
        const fy = this.phys.floor(p.x, p.z, p.y, STEP);
        this.kind = this.phys.kind;
        if (p.y <= fy) {
          if (this.vel.y <= 0.01) {
            p.y = this.onGround ? Math.min(fy, p.y + 11 * h + Math.max(0, (fy - p.y) * 0.0)) : fy;
            this.vel.y = 0;
            this.onGround = true;
          }
        } else if (this.onGround && this.vel.y <= 0 && p.y - fy < 0.5) {
          p.y = Math.max(fy, p.y - 14 * h);
        } else {
          this.onGround = false;
        }
      }
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      if (p.y < -75) this.respawn();
    }

    // 攝影機
    const cam = this.cam;
    const moving = this.speed > 0.4 && this.onGround;
    if (moving) this.phase += this.speed * dt * 1.55;
    this.bob += ((moving ? 1 : 0) - this.bob) * (1 - Math.exp(-8 * dt));
    const targetFov = (this.third ? 64 : 74) + (sprint && this.speed > 6 ? 5 : 0);
    this.fovT += (targetFov - this.fovT) * (1 - Math.exp(-6 * dt));
    if (Math.abs(cam.fov - this.fovT) > 0.01) {
      cam.fov = this.fovT;
      cam.updateProjectionMatrix();
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = [-sy * cp, sp, -cy * cp];
    if (!this.third) {
      const bobY = Math.sin(this.phase * 2) * 0.035 * this.bob;
      const bobX = Math.cos(this.phase) * 0.02 * this.bob;
      cam.position.set(p.x + cy * bobX, p.y + EYE + bobY, p.z - sy * bobX);
      this.camCur = this.camDist;
      this.avatar.visible = false;
    } else {
      const tx = p.x, ty = p.y + 1.55, tz = p.z;
      let d = this.camDist;
      const px = tx - fwd[0] * d, py = ty - fwd[1] * d + 0.25, pz = tz - fwd[2] * d;
      const t = this.fly ? 1 : this.phys.segmentFree(tx, ty, tz, px, py, pz, 0.3);
      const dTarget = Math.max(0.7, d * t);
      this.camCur = dTarget < this.camCur ? dTarget : this.camCur + (dTarget - this.camCur) * (1 - Math.exp(-4 * dt));
      d = this.camCur;
      cam.position.set(tx - fwd[0] * d, ty - fwd[1] * d + 0.25 * (d / this.camDist), tz - fwd[2] * d);
      this.avatar.visible = true;
      // 角色朝向 + 擺動
      if (this.speed > 0.5) {
        const f = Math.atan2(this.vel.x, this.vel.z);
        this.facing = angleLerp(this.facing, f, 1 - Math.exp(-12 * dt));
      } else if (this.fly) this.facing = angleLerp(this.facing, this.yaw + Math.PI, 1 - Math.exp(-6 * dt));
      this.avatar.position.copy(p);
      this.avatar.rotation.y = this.facing;
      const sw = Math.sin(this.phase * 2) * 0.9 * Math.min(1, this.speed / 5) * (this.onGround ? 1 : 0.2);
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.8;
      this.armR.rotation.x = sw * 0.8;
      if (!this.onGround && !this.fly) {
        this.armL.rotation.x = -2.4;
        this.armR.rotation.x = -2.4;
      }
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
