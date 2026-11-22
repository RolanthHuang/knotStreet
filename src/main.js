import * as THREE from 'three';
import { buildCity } from './city.js';
import { makeSkyMaterial, U } from './materials.js';
import { Player } from './player.js';
import { createUI } from './ui.js';

const ui = createUI();
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
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1, 0.3, 6500);
camera.position.set(0, 60, 200);
const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 24, 14), makeSkyMaterial());
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

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

let city = null, player = null;
const dests = [];

function findFree(x, z) {
  const ph = city.physics;
  for (let r = 0; r <= 48; r += 4) {
    const n = r === 0 ? 1 : Math.ceil((r * 6.28) / 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + r;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (city.T.islandSdf(px, pz) > -16) continue;
      const y = ph.floor(px, pz, 1e4, 0.55);
      if (ph.kind === 1) continue;
      const p = { x: px, z: pz };
      if (ph.collide(p, 0.7, y, y + 1.8, 0.55)) continue;
      return [px, pz];
    }
  }
  return [x, z];
}
function teleportTo(i) {
  const d = dests[i];
  if (!d) return;
  const [x, z] = findFree(d.x, d.z);
  player.teleport(x, z, 0);
  const fx = d.x - x, fz = d.z - z;
  player.yaw = Math.hypot(fx, fz) > 1 ? Math.atan2(-fx, -fz) : 0;
  player.pitch = d.pitch || 0;
  ui.toast(`傳送 ${i + 1} · ${d.name}`);
  ui.toggleMap(false);
}

function setupDestinations() {
  const T = city.T, info = city.info;
  const byKind = (k) => info.filter((b) => b.kind === k);
  const tallest = byKind('tower').sort((a, b) => b.h - a.h)[0];
  const civic = byKind('civic');
  const harbor = byKind('harbor');
  const arch = city.bridgeCenters.find((b) => b.type === 'arch');
  const tied = city.bridgeCenters.find((b) => b.type === 'tied');
  const falls = T.river.atZ(404);
  dests.push({ name: '中央尖塔 · 噴泉廣場', x: city.plaza.x, z: city.plaza.z, pitch: 0.28 });
  if (tallest) dests.push({ name: `塔樓區 · 最高 ${tallest.h.toFixed(0)} m`, x: tallest.x, z: tallest.z, pitch: 0.42 });
  if (arch) dests.push({ name: '石拱橋', x: arch.x, z: arch.z, pitch: 0.05 });
  if (tied) dests.push({ name: '系桿拱橋', x: tied.x, z: tied.z, pitch: 0.15 });
  if (civic[0]) dests.push({ name: civic[0].label.split(' ')[0] + ' · 市政區', x: civic[0].x, z: civic[0].z, pitch: 0.25 });
  dests.push({ name: '東側山丘公園', x: T.parks[0].x, z: T.parks[0].z, pitch: 0.1 });
  if (harbor[0]) dests.push({ name: '南側港區', x: harbor[0].x, z: harbor[0].z, pitch: 0.2 });
  dests.push({ name: '河口 · 瀑布', x: falls.x, z: falls.z, pitch: 0.05 });
}

function renderOnce() {
  U.uTime.value = performance.now() / 1000;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
dbg.render = renderOnce;

(async function boot() {
  try {
    const maxTex = renderer.capabilities.maxTextureSize;
    city = await buildCity({
      maxAniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
      groundSize: maxTex >= 4096 ? 4096 : 2048,
      onProgress: (p, t) => ui.setProgress(p, t),
    });
    scene.add(city.group);
    if (new URLSearchParams(location.search).has('back')) {
      U.dbgBack.value = 1;
      for (const m of [...city.materials.matWall, city.materials.matPlain, city.materials.matGround]) m.side = THREE.DoubleSide;
    }
    dbg.stats = city.stats;
    dbg.city = city;
    player = new Player(camera, canvas, city.physics, scene, city.materials.matPlain);
    dbg.player = player;
    const [sx, sz] = findFree(city.spawn.x, city.spawn.z);
    player.setSpawn(sx, sz, Math.atan2(-(city.plaza.x - sx), -(city.plaza.z - sz)));
    player.respawn();
    setupDestinations();
    ui.buildMaps(city);
    ui.setDestinations(dests, teleportTo);
    // 預先走一圈，讓場景準備好
    player.update(0.016);
    renderOnce();
    player.onAction = (code) => {
      if (code === 'KeyM') {
        const open = ui.toggleMap();
        if (open && document.exitPointerLock) document.exitPointerLock();
      } else if (code === 'Escape') ui.toggleMap(false);
      else if (code === 'KeyH') hudOn = !hudOn, ui.showHud(hudOn);
      else if (code === 'KeyV') ui.toast(player.third ? '第三人稱' : '第一人稱');
      else if (code === 'KeyF') ui.toast(player.fly ? '飛行模式' : '步行模式');
      else if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5), 10);
        if (n >= 1 && n <= dests.length) teleportTo(n - 1);
      }
    };
    dbg.ready = true;
    ui.ready(() => {
      player.enabled = true;
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
      requestAnimationFrame(loop);
    });
    if (new URLSearchParams(location.search).has('auto')) {
      player.enabled = true;
      document.getElementById('start').style.display = 'none';
      requestAnimationFrame(loop);
    }
  } catch (e) {
    dbg.err.push('boot: ' + (e && e.stack ? e.stack : e));
    ui.setProgress(0, '錯誤：' + (e && e.message));
    console.error(e);
  }
})();

let hudOn = true;
let last = performance.now(), hudT = 0, frames = 0, acc = 0, fpsShow = 0, bldT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!player || !city) return;
  if (!ui.mapOpen()) player.update(dt);
  renderOnce();
  // 自適應解析度
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
  hudT += dt;
  if (hudT > 0.12) {
    hudT = 0;
    const p = player.pos;
    ui.hud(
      `${fpsShow.toFixed(0)} fps · ${(pr).toFixed(2)}x<br>${player.fly ? '飛行' : player.kind === 1 ? '涉水' : '步行'} · ${player.third ? '第三人稱' : '第一人稱'}<br>x ${p.x.toFixed(0)}　z ${p.z.toFixed(0)}　高 ${p.y.toFixed(1)}<br>${player.locked ? '' : player.useDrag ? '按住左鍵拖曳視角' : ''}`
    );
    ui.setCross(!player.third);
    ui.drawMarkers(p.x, p.z, player.yaw, dests);
  }
  bldT += dt;
  if (bldT > 0.15) {
    bldT = 0;
    if (!player.third && !ui.mapOpen()) {
      const c = camera.position;
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      const b = city.physics.rayBox(c.x, c.y, c.z, d.x, d.y, d.z, 70);
      const inf = b && city.info[b.tag - 1];
      ui.building(inf ? `${inf.label}　·　高 ${inf.h.toFixed(0)} m` : '');
    } else ui.building('');
  }
}
