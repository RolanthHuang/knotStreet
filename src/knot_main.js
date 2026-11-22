import * as THREE from 'three';
import { buildKnot } from './knotcity.js';
import { makeSkyMaterial, makeContourMaterial, U } from './materials.js';
import { KnotPlayer } from './knotplayer.js';
import { createUI } from './ui.js';

const ui = createUI();
ui.setTitle('乾淨的神經 · 紐結環', 'Neural Knot · 依「Neural Networks Are Already Clean」右側插圖打造：環面紐結上的拱廊城市，重力沿環面法線，走一圈就是上下顛倒一圈', '進入紐結環');
const canvas = document.createElement('canvas');
canvas.id = 'c';
canvas.tabIndex = 0;
document.body.prepend(canvas);
const dbg = { ready: false, err: [], stats: null };
window.__city = dbg;
addEventListener('error', (e) => dbg.err.push(String(e.message) + ' @' + (e.filename || '') + ':' + e.lineno));
addEventListener('unhandledrejection', (e) => dbg.err.push('promise: ' + String(e.reason && e.reason.stack ? e.reason.stack : e.reason)));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  ui.setProgress(0, '無法建立 WebGL：' + e.message);
  throw e;
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0xf4f1ea, 1);
U.belowFade.value = 0;
U.fogDen.value = 0.00085;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1, 0.3, 7000);
const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 14), makeSkyMaterial());
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);
const paper = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), makeContourMaterial());
paper.position.y = -330;
scene.add(paper);

const maxPR = Math.min(window.devicePixelRatio || 1, 1.6);
let pr = Math.min(maxPR, 1.25);
function resize() {
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let world = null, player = null, entered = false;
let hudOn = true;

function teleportTo(i) {
  const d = world.dests[i];
  if (!d) return;
  player.teleport(d.s, d.u, d.yaw);
  player.pitch = d.pitch || 0;
  ui.toast(`傳送 ${i + 1} · ${d.name}`);
  ui.toggleMap(false);
}

const skyQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), idQ = new THREE.Quaternion(), upV = new THREE.Vector3();
function orient(dt) {
  const walking = entered && player && !player.fly;
  const k = 1 - Math.exp(-5 * dt);
  U.localLight.value += ((walking ? 1 : 0) - U.localLight.value) * k;
  skyQ.slerp(walking ? player.qf : idQ, k);
  sky.quaternion.copy(skyQ);
  paper.quaternion.copy(skyQ);
  upV.set(0, 1, 0).applyQuaternion(skyQ);
  const w = U.localLight.value;
  paper.position.set(
    camera.position.x * w + camera.position.x * (1 - w) - upV.x * 380 * w,
    (-330) * (1 - w) + (camera.position.y - upV.y * 380) * w,
    camera.position.z - upV.z * 380 * w
  );
  if (walking) { const m = paper.material.uniforms.uOff.value; m.set(player.pos.x * 0.4, player.pos.z * 0.4); }
}
function renderOnce() {
  U.uTime.value = performance.now() / 1000;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
dbg.render = () => { orient(10); renderOnce(); };

(async function boot() {
  try {
    world = await buildKnot({ maxAniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), onProgress: (p, t) => ui.setProgress(p, t) });
    scene.add(world.group);
    if (new URLSearchParams(location.search).has('back')) {
      U.dbgBack.value = 1;
      for (const m of [...world.materials.matWall, world.materials.matPlain]) m.side = THREE.DoubleSide;
    }
    dbg.stats = world.stats;
    dbg.world = world;
    player = new KnotPlayer(camera, canvas, world.physics, scene, world.materials.matPlain, world.curve, world.HW);
    dbg.player = player;
    player.setSpawn(world.spawn.s, world.spawn.u, world.spawn.yaw);
    player.respawn();
    ui.buildMapsKnot(world.curve);
    ui.setDestinations(world.dests, teleportTo);
    player.update(0.016);
    renderOnce();
    player.onAction = (code) => {
      if (code === 'KeyM') {
        const open = ui.toggleMap();
        if (open && document.exitPointerLock) document.exitPointerLock();
      } else if (code === 'Escape') ui.toggleMap(false);
      else if (code === 'KeyH') hudOn = !hudOn, ui.showHud(hudOn);
      else if (code === 'KeyV') ui.toast(player.third ? '第三人稱' : '第一人稱');
      else if (code === 'KeyF') ui.toast(player.fly ? '飛行模式（世界座標）' : '步行模式（重力沿環面）');
      else if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5), 10);
        if (n >= 1 && n <= world.dests.length) teleportTo(n - 1);
      }
    };
    dbg.ready = true;
    dbg.orient = orient;
    const enter = () => {
      entered = true;
      player.enabled = true;
      player.respawn();
      canvas.focus();
      try {
        const r = canvas.requestPointerLock && canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => (player.useDrag = true));
      } catch (e) {
        player.useDrag = true;
      }
      setTimeout(() => {
        if (!player.locked) {
          player.useDrag = true;
          ui.toast('無法鎖定滑鼠：請按住左鍵拖曳轉視角（或用方向鍵）');
        }
      }, 400);
    };
    ui.ready(enter);
    if (new URLSearchParams(location.search).has('auto')) {
      document.getElementById('start').style.display = 'none';
      entered = true;
      player.enabled = true;
    }
    requestAnimationFrame(loop);
  } catch (e) {
    dbg.err.push('boot: ' + (e && e.stack ? e.stack : e));
    ui.setProgress(0, '錯誤：' + (e && e.message));
    console.error(e);
  }
})();

let last = performance.now(), hudT = 0, frames = 0, acc = 0, fpsShow = 0, bldT = 0, orbit = 0;
const dirV = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!player || !world) return;
  if (!entered) {
    orbit += dt * 0.07;
    camera.position.set(Math.cos(orbit) * 520, 300, Math.sin(orbit) * 520);
    camera.lookAt(0, -10, 0);
  } else if (!ui.mapOpen()) player.update(dt);
  orient(dt);
  renderOnce();
  frames++;
  acc += dt;
  if (acc >= 1.2) {
    const fps = frames / acc;
    fpsShow = fps;
    if (fps < 50 && pr > 0.55) { pr = Math.max(0.55, pr * 0.88); resize(); }
    else if (fps > 58 && pr < maxPR) { pr = Math.min(maxPR, pr * 1.08); resize(); }
    frames = 0;
    acc = 0;
  }
  if (!entered) return;
  hudT += dt;
  if (hudT > 0.12) {
    hudT = 0;
    const p = player.pos;
    const wp = player.worldPos;
    ui.hud(
      `${fpsShow.toFixed(0)} fps · ${pr.toFixed(2)}x<br>${player.fly ? '飛行（世界座標）' : '步行（沿環面）'} · ${player.third ? '第三人稱' : '第一人稱'}<br>${player.fly ? `x ${wp.x.toFixed(0)}　y ${wp.y.toFixed(0)}　z ${wp.z.toFixed(0)}` : `行程 ${p.x.toFixed(0)} / ${world.L.toFixed(0)} m　高 ${p.y.toFixed(1)}`}<br>${player.locked ? '' : player.useDrag ? '按住左鍵拖曳視角' : ''}`
    );
    ui.setCross(!player.third);
    ui.drawMarkers(wp.x, wp.z, player.worldYaw, world.dests);
  }
  bldT += dt;
  if (bldT > 0.15) {
    bldT = 0;
    if (!player.third && !player.fly && !ui.mapOpen() && player.eyeStrip) {
      const e = player.eyeStrip, f = player.fwdStrip;
      const b = world.physics.rayBox(e[0], e[1], e[2], f[0], f[1], f[2], 60);
      const inf = b && world.info[b.tag - 1];
      ui.building(inf ? `${inf.label}　·　高 ${inf.h.toFixed(0)} m` : '');
    } else ui.building('');
  }
}
