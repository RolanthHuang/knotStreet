const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#f4f1e8;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;color:#2c2a26;-webkit-user-select:none;user-select:none}
canvas#c{position:fixed;inset:0;width:100%;height:100%;display:block;outline:none}
.ov{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,rgba(250,247,238,.96),rgba(236,231,216,.97));z-index:20;transition:opacity .5s}
.card{width:min(680px,92vw);padding:34px 38px 30px;background:rgba(255,255,255,.62);border:1px solid rgba(60,52,40,.14);border-radius:18px;box-shadow:0 18px 60px rgba(70,60,40,.14)}
.card h1{margin:0 0 4px;font-weight:650;font-size:26px;letter-spacing:.02em}
.card .sub{margin:0 0 18px;color:#6d675a;font-size:14px}
.grid{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:14px;line-height:1.55;margin:14px 0 18px}
.grid b{font-weight:600;color:#8a3b25;white-space:nowrap}
.bar{height:5px;background:rgba(60,52,40,.12);border-radius:3px;overflow:hidden;margin:6px 0 6px}
.bar i{display:block;height:100%;width:0;background:#b4513a;transition:width .2s}
.btn{display:inline-block;margin-top:8px;padding:11px 26px;border-radius:999px;background:#2c2a26;color:#f7f3e8;font-size:15px;cursor:pointer;border:0;font-family:inherit}
.btn[disabled]{opacity:.35;cursor:default}
.note{font-size:12.5px;color:#6d675a;margin-top:10px;line-height:1.6}
#hud{position:fixed;left:14px;bottom:12px;font-size:12px;line-height:1.5;color:#3b372f;background:rgba(250,247,238,.72);padding:8px 11px;border-radius:10px;border:1px solid rgba(60,52,40,.1);pointer-events:none;z-index:5;min-width:150px}
#help{position:fixed;right:14px;bottom:12px;font-size:12px;line-height:1.55;color:#3b372f;background:rgba(250,247,238,.72);padding:8px 12px;border-radius:10px;border:1px solid rgba(60,52,40,.1);pointer-events:none;z-index:5}
#help b{color:#8a3b25;font-weight:600}
#cross{position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 1.5px rgba(40,36,30,.55);z-index:4;pointer-events:none}
#tip{position:fixed;left:50%;top:58%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(40,36,30,.72);color:#fbf8ee;font-size:13px;z-index:6;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}
#bld{position:fixed;left:50%;top:62%;transform:translateX(-50%);font-size:14px;color:#2c2a26;background:rgba(250,247,238,.86);padding:6px 14px;border-radius:10px;border:1px solid rgba(60,52,40,.12);z-index:5;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap}
#toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(40,36,30,.78);color:#fbf8ee;font-size:13.5px;z-index:8;pointer-events:none;opacity:0;transition:opacity .3s}
#mini{position:fixed;right:14px;top:12px;width:190px;height:200px;border-radius:12px;border:1px solid rgba(60,52,40,.16);background:rgba(250,247,238,.78);z-index:5;overflow:hidden}
#mini canvas{width:100%;height:100%;display:block}
#map{position:fixed;inset:0;background:rgba(244,241,232,.94);z-index:12;display:none;align-items:center;justify-content:center;gap:26px;padding:20px;box-sizing:border-box}
#map .mc{height:min(86vh,900px);aspect-ratio:740/790;border-radius:14px;border:1px solid rgba(60,52,40,.16);overflow:hidden;position:relative;background:#f7f4ea}
#map canvas{width:100%;height:100%;display:block}
#map .side{width:260px;font-size:14px;line-height:1.5}
#map .side h2{margin:0 0 10px;font-size:18px}
#map .dst{display:block;width:100%;text-align:left;margin:0 0 8px;padding:9px 12px;border-radius:10px;border:1px solid rgba(60,52,40,.16);background:rgba(255,255,255,.7);cursor:pointer;font-family:inherit;font-size:14px;color:#2c2a26}
#map .dst:hover{background:#fff;border-color:#b4513a}
#map .dst span{color:#8a3b25;font-weight:600;margin-right:8px}
`;

export function createUI() {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const root = document.body;
  const el = (tag, id, html, cls) => {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    root.appendChild(e);
    return e;
  };
  const start = el('div', 'start', '', 'ov');
  start.innerHTML = `<div class="card">
    <h1>乾淨的神經島城</h1>
    <p class="sub">Neural Isle · 可玩原型 v0.1 — 依「Neural Networks Are Already Clean」插圖打造的 3D 島城</p>
    <div class="bar"><i id="pbar"></i></div>
    <div class="note" id="ptxt">載入中…</div>
    <div class="grid">
      <b>W A S D</b><span>移動　<b style="display:inline">Shift</b> 奔跑　<b style="display:inline">Space</b> 跳躍</span>
      <b>滑鼠</b><span>轉動視角（點擊畫面鎖定；若瀏覽器擋下，改為按住左鍵拖曳，或用方向鍵）</span>
      <b>V</b><span>第一人稱 / 第三人稱　（滾輪調整鏡頭距離）</span>
      <b>F</b><span>飛行模式（Space 上升、C 下降、Shift 加速、滾輪調速）</span>
      <b>M / 1–8</b><span>大地圖 / 快速傳送至地標</span>
      <b>R · H · Esc</b><span>回出生點 · 顯示/隱藏介面 · 釋放滑鼠</span>
    </div>
    <button class="btn" id="go" disabled>載入中…</button>
    <div class="note">低多邊形極簡風、約數百棟結構互不重複的建築；畫質會依幀率自動調整。</div>
  </div>`;
  const hud = el('div', 'hud', '');
  const help = el('div', 'help', '<b>WASD</b> 移動　<b>Shift</b> 奔跑　<b>Space</b> 跳<br><b>V</b> 視角　<b>F</b> 飛行　<b>M</b> 地圖　<b>1–8</b> 傳送<br><b>H</b> 隱藏介面　<b>R</b> 重生');
  const cross = el('div', 'cross', '');
  const tip = el('div', 'tip', '');
  const bld = el('div', 'bld', '');
  const toastEl = el('div', 'toast', '');
  const mini = el('div', 'mini', '<canvas width="380" height="400"></canvas>');
  const map = el('div', 'map', '<div class="mc"><canvas width="1100" height="1170"></canvas></div><div class="side"><h2>地圖 · 傳送</h2><div id="dsts"></div><div class="note">M 或 Esc 關閉</div></div>');
  let toastT = 0;
  const api = {
    start,
    setProgress(p, txt) {
      document.getElementById('pbar').style.width = Math.round(p * 100) + '%';
      document.getElementById('ptxt').textContent = txt + ' ' + Math.round(p * 100) + '%';
    },
    ready(onGo) {
      const b = document.getElementById('go');
      b.disabled = false;
      b.textContent = api._goLabel || '進入島城';
      document.getElementById('ptxt').textContent = '準備完成';
      b.onclick = () => {
        start.style.opacity = 0;
        setTimeout(() => (start.style.display = 'none'), 500);
        onGo();
      };
    },
    toast(msg) {
      toastEl.textContent = msg;
      toastEl.style.opacity = 1;
      clearTimeout(toastT);
      toastT = setTimeout(() => (toastEl.style.opacity = 0), 1700);
    },
    tipMsg(msg) {
      tip.textContent = msg;
      tip.style.opacity = msg ? 1 : 0;
    },
    building(label) {
      if (label) bld.textContent = label;
      bld.style.opacity = label ? 1 : 0;
    },
    hud(txt) {
      hud.innerHTML = txt;
    },
    showHud(v) {
      for (const e of [hud, help, mini, cross]) e.style.display = v ? '' : 'none';
    },
    setCross(v) {
      cross.style.display = v ? '' : 'none';
    },
    mapOpen() {
      return map.style.display === 'flex';
    },
    toggleMap(v) {
      map.style.display = v === undefined ? (map.style.display === 'flex' ? 'none' : 'flex') : v ? 'flex' : 'none';
      return map.style.display === 'flex';
    },
    buildMaps(city) {
      const { T, L, bridgeCenters } = city;
      const bb = T.bbox;
      const ox = bb.minx - 10, oz = bb.minz - 10, W = bb.maxx - bb.minx + 20, H = bb.maxz - bb.minz + 20;
      const draw = (cv) => {
        const g = cv.getContext('2d');
        const sx = cv.width / W, sz = cv.height / H;
        const s = Math.min(sx, sz);
        g.setTransform(s, 0, 0, s, -ox * s, -oz * s);
        g.fillStyle = '#f7f4ea';
        g.fillRect(ox, oz, W, H);
        g.beginPath();
        T.poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.fillStyle = '#ece6d3';
        g.fill();
        g.lineWidth = 2 / s * 1.5;
        g.strokeStyle = '#6d675a';
        g.stroke();
        const col = { core: '#d98a76', mid: '#e3b46e', old: '#d3b48a', res: '#bfd29a', harbor: '#8fb1c6' };
        for (const c of L.cells) {
          if (!c.block) continue;
          g.beginPath();
          c.block.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.closePath();
          g.fillStyle = c.kind === 'park' ? '#a9c88a' : c.kind.startsWith('plaza') ? '#f0e8d0' : col[c.zone] || '#ddd';
          g.fill();
        }
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const rp = T.river.pts;
        g.strokeStyle = '#9ecfd2';
        for (let i = 0; i < rp.length - 1; i++) {
          g.lineWidth = rp[i].hw * 2;
          g.beginPath();
          g.moveTo(rp[i].x, rp[i].z);
          g.lineTo(rp[i + 1].x, rp[i + 1].z);
          g.stroke();
        }
        g.fillStyle = '#9ecfd2';
        g.beginPath();
        g.arc(186, 100, 41, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 3 / s * 1.2;
        for (const b of bridgeCenters) {
          g.beginPath();
          g.moveTo(b.x - 24, b.z);
          g.lineTo(b.x + 24, b.z);
          g.stroke();
        }
        return { s, ox, oz };
      };
      const m1 = draw(mini.querySelector('canvas'));
      const m2 = draw(map.querySelector('canvas'));
      api._maps = { m1, m2, c1: mini.querySelector('canvas'), c2: map.querySelector('canvas'), base1: null };
      // 儲存底圖，之後每幀只疊玩家標記
      for (const k of ['c1', 'c2']) {
        const c = api._maps[k];
        const o = document.createElement('canvas');
        o.width = c.width;
        o.height = c.height;
        o.getContext('2d').drawImage(c, 0, 0);
        api._maps[k + 'o'] = o;
      }
    },
    setTitle(title, sub, goLabel) {
      start.querySelector('h1').textContent = title;
      start.querySelector('.sub').textContent = sub;
      api._goLabel = goLabel;
    },
    buildMapsKnot(curve) {
      const pts = [];
      for (let k = 0; k < curve.M; k += 6) pts.push([curve.P[3 * k], curve.P[3 * k + 2], curve.P[3 * k + 1]]);
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const ox = minx - 30, oz = minz - 30, W = maxx - minx + 60, H = maxz - minz + 60;
      const idx = pts.map((_, i) => i).sort((a, b) => pts[a][2] + pts[(a + 1) % pts.length][2] - pts[b][2] - pts[(b + 1) % pts.length][2]);
      const draw = (cv) => {
        const g = cv.getContext('2d');
        const s = Math.min(cv.width / W, cv.height / H);
        g.setTransform(s, 0, 0, s, -ox * s, -oz * s);
        g.fillStyle = '#f7f4ea';
        g.fillRect(ox, oz, W, H);
        g.lineCap = 'butt';
        for (const i of idx) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const t = Math.max(0, Math.min(1, (a[2] + b[2]) / 2 / 110 + 0.5));
          const lo = [150, 138, 110], hi = [240, 228, 198];
          const c = lo.map((v, k) => Math.round(v + (hi[k] - v) * t));
          g.strokeStyle = 'rgba(70,60,45,.75)';
          g.lineWidth = 38;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
          g.lineWidth = 33;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.strokeStyle = 'rgba(190,84,56,.55)';
          g.lineWidth = 8;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
        return { s, ox, oz };
      };
      const m1 = draw(mini.querySelector('canvas'));
      const m2 = draw(map.querySelector('canvas'));
      api._maps = { m1, m2, c1: mini.querySelector('canvas'), c2: map.querySelector('canvas') };
      for (const k of ['c1', 'c2']) {
        const c = api._maps[k];
        const o = document.createElement('canvas');
        o.width = c.width; o.height = c.height;
        o.getContext('2d').drawImage(c, 0, 0);
        api._maps[k + 'o'] = o;
      }
    },
    drawMarkers(px, pz, yaw, dests) {
      const M = api._maps;
      if (!M) return;
      const mk = (c, o, m, big) => {
        const g = c.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(o, 0, 0);
        const x = (px - m.ox) * m.s, y = (pz - m.oz) * m.s;
        if (big && dests) {
          g.font = '600 22px sans-serif';
          dests.forEach((d, i) => {
            const dx = (d.x - m.ox) * m.s, dy = (d.z - m.oz) * m.s;
            g.fillStyle = '#2c2a26';
            g.beginPath();
            g.arc(dx, dy, 15, 0, 6.3);
            g.fill();
            g.fillStyle = '#fff';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(i + 1), dx, dy + 1);
          });
        }
        g.save();
        g.translate(x, y);
        g.rotate(-yaw + Math.PI);
        g.fillStyle = '#c0392b';
        g.strokeStyle = '#fff';
        g.lineWidth = big ? 3 : 2;
        const r = big ? 14 : 9;
        g.beginPath();
        g.moveTo(0, r);
        g.lineTo(r * 0.7, -r * 0.8);
        g.lineTo(0, -r * 0.3);
        g.lineTo(-r * 0.7, -r * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      };
      if (api.mapOpen()) mk(M.c2, M.c2o, M.m2, true);
      else mk(M.c1, M.c1o, M.m1, false);
    },
    setDestinations(list, onPick) {
      const box = document.getElementById('dsts');
      box.innerHTML = '';
      list.forEach((d, i) => {
        const b = document.createElement('button');
        b.className = 'dst';
        b.innerHTML = `<span>${i + 1}</span>${d.name}`;
        b.onclick = () => onPick(i);
        box.appendChild(b);
      });
    },
  };
  return api;
}
