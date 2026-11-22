import * as THREE from 'three';
import { Player } from './player.js';
import { makeWorldMaterial } from './materials.js';
import { clamp, angleLerp } from './util.js';

const EYE = 1.62, RADIUS = 0.38, HEIGHT = 1.8, STEP = 0.55, GRAV = 22, JUMP = 7.0;

// 步行：位置在「條帶座標」(x=弧長 s, y=離甲板高度, z=橫向 u)，物理沿用 Physics；相機/角色每幀映射到紐結世界。
// 飛行：世界座標自由飛行（上方向固定為世界 +Y）。
export class KnotPlayer extends Player {
  constructor(camera, dom, physics, scene, mat, curve, halfW) {
    super(camera, dom, physics, scene, mat);
    this.curve = curve;
    this.HW = halfW;
    this.L = curve.L;
    this.wpos = new THREE.Vector3();
    this.wvel = new THREE.Vector3();
    this.T = new THREE.Vector3(); this.N = new THREE.Vector3(); this.Z = new THREE.Vector3();
    this.qf = new THREE.Quaternion();
    this.m4 = new THREE.Matrix4();
    this.qa = new THREE.Quaternion();
    this.eul = new THREE.Euler(0, 0, 0, 'YXZ');
    this.worldPos = new THREE.Vector3();
    this.worldYaw = 0;
    this.sprintFov = 0;
    this.avMat = makeWorldMaterial(null, { AVATAR: 1 });
    this.avatar.traverse((o) => { if (o.isMesh) o.material = this.avMat; });
    this.qInv = new THREE.Quaternion();
    this.m4b = new THREE.Matrix4();
    this.wd = new THREE.Vector3();
  }
  setSpawn(s, u, yaw = 0) {
    this.spawn = { x: s, y: 0, z: u, yaw };
  }
  respawn() {
    this.teleport(this.spawn.x, this.spawn.z, this.spawn.yaw, 0);
  }
  teleport(s, u, yaw, y) {
    this.fly = false;
    this.pos.set(this._wrap(s), y !== undefined ? y : this.phys.floor(s, u, 1e4, STEP), u);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = 0;
    this.onGround = true;
  }
  _wrap(s) {
    return ((s % this.L) + this.L) % this.L;
  }
  _frame(s) {
    this.curve.frame(s, this.T, this.N, this.Z);
    this.m4.makeBasis(this.T, this.N, this.Z);
    this.qf.setFromRotationMatrix(this.m4);
  }
  toggleFly() {
    const cam = this.cam;
    if (!this.fly) {
      const d = new THREE.Vector3();
      cam.getWorldDirection(d);
      this.wpos.copy(this.curve.point(this.pos.x, this.pos.y + EYE + 0.5, this.pos.z));
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = Math.asin(clamp(d.y, -1, 1));
      this.wvel.set(0, 0, 0);
      this.fly = true;
    } else {
      const d = new THREE.Vector3();
      cam.getWorldDirection(d);
      const q = this.curve.nearest(this.wpos.x, this.wpos.y, this.wpos.z);
      this._frame(q.s);
      const u = clamp(q.u, -this.HW + 1.5, this.HW - 1.5);
      const fT = d.dot(this.T), fZ = d.dot(this.Z);
      this.pos.set(q.s, Math.max(q.h, 0) + 0.5, u);
      const fl = this.phys.floor(q.s, u, this.pos.y, STEP);
      this.pos.y = Math.max(fl, Math.min(this.pos.y, fl + 40));
      this.vel.set(0, 0, 0);
      this.yaw = Math.hypot(fT, fZ) > 0.05 ? Math.atan2(-fT, -fZ) : 0;
      this.pitch = 0;
      this.onGround = false;
      this.fly = false;
    }
  }
  setPose(x, y, z, yaw, pitch) {
    this.wpos.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.fly = true;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
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
    const cam = this.cam;

    if (this.fly) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fx = -sy * cp, fy = sp, fz = -cy * cp;
      let vx = fx * fw + cy * st, vy = fy * fw, vz = fz * fw - sy * st;
      if (k.has('Space')) vy += 1;
      if (k.has('KeyC') || k.has('ControlLeft')) vy -= 1;
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp2 = this.flySpeed * (sprint ? 3 : 1);
      const want = fw || st || k.has('Space') || k.has('KeyC') || k.has('ControlLeft') ? 1 : 0;
      const a = 1 - Math.exp(-8 * dt);
      this.wvel.x += (((vx / l) * sp2 * want) - this.wvel.x) * a;
      this.wvel.y += (((vy / l) * sp2 * want) - this.wvel.y) * a;
      this.wvel.z += (((vz / l) * sp2 * want) - this.wvel.z) * a;
      this.wpos.addScaledVector(this.wvel, dt);
      this.speed = this.wvel.length();
      this.onGround = false;
      this.jumpReq = false;
      this.worldPos.copy(this.wpos);
      this.worldYaw = this.yaw;
      let d = 0;
      if (this.third) {
        d = this.camDist * 2.2;
        this.avatar.visible = true;
        this.avatar.position.copy(this.wpos);
        this.facing = angleLerp(this.facing, this.speed > 1 ? Math.atan2(this.wvel.x, this.wvel.z) : this.yaw + Math.PI, 1 - Math.exp(-6 * dt));
        this.avatar.quaternion.setFromEuler(this.eul.set(0, this.facing, 0));
        this.legL.rotation.x = this.legR.rotation.x = this.armL.rotation.x = this.armR.rotation.x = 0;
      } else this.avatar.visible = false;
      cam.position.set(this.wpos.x - fx * d, this.wpos.y - fy * d, this.wpos.z - fz * d);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      const tf = 74 + (sprint && this.speed > 20 ? 6 : 0);
      this.fovT += (tf - this.fovT) * (1 - Math.exp(-6 * dt));
      if (Math.abs(cam.fov - this.fovT) > 0.01) { cam.fov = this.fovT; cam.updateProjectionMatrix(); }
      return;
    }

    // ---- 步行（條帶座標）----
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const spd = sprint ? 9.2 : 5.0;
    const accel = this.onGround ? 14 : 3.5;
    const a = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx * spd - this.vel.x) * a;
    this.vel.z += (wz * spd - this.vel.z) * a;
    if (this.onGround) this.coyote = 0.1; else this.coyote -= dt;
    if (this.jumpReq && this.coyote > 0) { this.vel.y = JUMP; this.onGround = false; this.coyote = 0; }
    this.jumpReq = false;
    const n = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / n;
    for (let i = 0; i < n; i++) {
      p.x += this.vel.x * h;
      p.z += this.vel.z * h;
      this.phys.collide(p, RADIUS, p.y, p.y + HEIGHT, STEP);
      if (!this.onGround) this.vel.y -= GRAV * h;
      p.y += this.vel.y * h;
      const fy = this.phys.floor(p.x, p.z, p.y, STEP);
      if (p.y <= fy) {
        if (this.vel.y <= 0.01) {
          p.y = this.onGround ? Math.min(fy, p.y + 11 * h) : fy;
          this.vel.y = 0;
          this.onGround = true;
        }
      } else if (this.onGround && this.vel.y <= 0 && p.y - fy < 0.5) p.y = Math.max(fy, p.y - 14 * h);
      else this.onGround = false;
    }
    if (p.x < 0) p.x += this.L; else if (p.x >= this.L) p.x -= this.L;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (p.y < -30 || Math.abs(p.z) > this.HW + 1) this.respawn();

    // ---- 相機 / 角色 ----
    const moving = this.speed > 0.4 && this.onGround;
    if (moving) this.phase += this.speed * dt * 1.55;
    this.bob += ((moving ? 1 : 0) - this.bob) * (1 - Math.exp(-8 * dt));
    const tf = (this.third ? 64 : 74) + (sprint && this.speed > 6 ? 5 : 0);
    this.fovT += (tf - this.fovT) * (1 - Math.exp(-6 * dt));
    if (Math.abs(cam.fov - this.fovT) > 0.01) { cam.fov = this.fovT; cam.updateProjectionMatrix(); }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = [-sy * cp, sp, -cy * cp];
    this._frame(p.x);
    let cx, cyy, cz;
    if (!this.third) {
      const bobY = Math.sin(this.phase * 2) * 0.035 * this.bob, bobX = Math.cos(this.phase) * 0.02 * this.bob;
      cx = p.x + cy * bobX; cyy = p.y + EYE + bobY; cz = p.z - sy * bobX;
      this.camCur = this.camDist;
      this.avatar.visible = false;
    } else {
      const tx = p.x, ty = p.y + 1.55, tz = p.z;
      let d = this.camDist;
      const px = tx - fwd[0] * d, py = ty - fwd[1] * d + 0.25, pz = tz - fwd[2] * d;
      const t = this.phys.segmentFree(tx, ty, tz, px, py, pz, 0.3);
      const dT = Math.max(0.7, d * t);
      this.camCur = dT < this.camCur ? dT : this.camCur + (dT - this.camCur) * (1 - Math.exp(-4 * dt));
      d = this.camCur;
      cx = tx - fwd[0] * d; cyy = ty - fwd[1] * d + 0.25 * (d / this.camDist); cz = tz - fwd[2] * d;
      this.avatar.visible = true;
      if (this.speed > 0.5) this.facing = angleLerp(this.facing, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-12 * dt));
      const wp = this.curve.point(p.x, p.y, p.z);
      this.avatar.position.copy(wp);
      this.avatar.quaternion.copy(this.qf).multiply(this.qa.setFromEuler(this.eul.set(0, this.facing, 0)));
      const sw = Math.sin(this.phase * 2) * 0.9 * Math.min(1, this.speed / 5) * (this.onGround ? 1 : 0.2);
      this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
      if (!this.onGround) this.armL.rotation.x = this.armR.rotation.x = -2.4;
    }
    const wc = this.curve.point(cx, cyy, cz);
    cam.position.copy(wc);
    this.eul.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.quaternion.copy(this.qf).multiply(this.qa.setFromEuler(this.eul));
    this.worldPos.copy(this.curve.point(p.x, p.y, p.z));
    const wd = this.wd;
    cam.getWorldDirection(wd);
    this.qInv.copy(this.qf).invert();
    this.avMat.uniforms.uFrameInv.value.setFromMatrix4(this.m4b.makeRotationFromQuaternion(this.qInv));
    this.worldYaw = Math.atan2(-wd.x, -wd.z);
    this.eyeStrip = [cx, cyy, cz];
    this.fwdStrip = fwd;
  }
}
