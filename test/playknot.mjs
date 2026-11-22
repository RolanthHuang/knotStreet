import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 480, height: 270 });
const logs = []; page.on('pageerror', (e) => logs.push(e.message));
await page.goto('file:///home/claude/neural-city/dist/index.html?auto', { waitUntil: 'load' });
await page.waitForFunction('window.__city && (window.__city.ready || window.__city.err.length)', { timeout: 240000, polling: 500 });
const r = await page.evaluate(() => {
  const c = window.__city, pl = c.player, L = c.world.L, HW = c.world.HW, out = {};
  pl.enabled = true;
  const sim = (secs, keys) => { pl.keys = new Set(keys); for (let t = 0; t < secs; t += 1 / 60) pl.update(1 / 60); pl.keys = new Set(); };
  let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let respawns = 0, runs = 60, stuck = 0, maxAbsU = 0, minH = 1e9, travelled = 0;
  for (let i = 0; i < runs; i++) {
    pl.teleport(rnd() * L, (rnd() - 0.5) * 2 * (HW - 3), rnd() * 6.28);
    const p0 = pl.pos.x, u0 = pl.pos.z;
    let prevS = pl.pos.x;
    for (let s = 0; s < 14; s++) {
      pl.yaw += (rnd() - 0.5) * 1.6;
      if (rnd() < 0.25) pl.jumpReq = true;
      sim(1, ['KeyW', 'ShiftLeft']);
      let d = pl.pos.x - prevS; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      if (Math.abs(d) > 40) respawns++;
      travelled += Math.abs(d); prevS = pl.pos.x;
      maxAbsU = Math.max(maxAbsU, Math.abs(pl.pos.z)); minH = Math.min(minH, pl.pos.y);
    }
    let dd = pl.pos.x - p0; if (dd > L / 2) dd -= L; if (dd < -L / 2) dd += L;
    if (Math.hypot(dd, pl.pos.z - u0) < 3) stuck++;
  }
  out.walk = { runs, respawns, stuck, maxAbsU: +maxAbsU.toFixed(2), minH: +minH.toFixed(2), avgTravel: +(travelled / runs).toFixed(0) };
  // 沿甲板走完整圈（導航：一般走 u=2.5；地標廣場旁改走 u=13）
  const pls = c.world.plazas;
  pl.teleport(20, 2.5, -Math.PI / 2); let lap = 0, last = pl.pos.x, resp = 0, t = 0, stuckT = 0;
  while (lap < L - 40 && t < 1200) {
    pl.keys = new Set(['KeyW', 'ShiftLeft']);
    let target = 2.5;
    for (const q of pls) { const dx = Math.min(Math.abs(pl.pos.x - q.c), Math.abs(pl.pos.x - q.c + L), Math.abs(pl.pos.x - q.c - L)); if (dx < (q.special ? 20 : 13)) target = q.special ? 13 : 9; }
    const dlt = Math.max(-0.7, Math.min(0.7, (pl.pos.z - target) * 0.25));
    pl.yaw = -Math.PI / 2 + dlt;
    pl.update(1 / 30); t += 1 / 30;
    let d = pl.pos.x - last; if (d < -L / 2) d += L; if (d > L / 2) d -= L; if (Math.abs(d) > 30) resp++;
    lap += Math.max(0, d); last = pl.pos.x;
    if (pl.speed < 1.0) stuckT += 1 / 30; else stuckT = 0;
    if (stuckT > 6) { out.stuckAt = { s: +pl.pos.x.toFixed(1), u: +pl.pos.z.toFixed(1) }; break; }
  }
  out.lap = { dist: +lap.toFixed(0), seconds: +t.toFixed(0), respawns: resp, L: +L.toFixed(0) };
  // 跳躍
  pl.teleport(14, 0, 0); sim(1, []);
  const y0 = pl.pos.y; let ymax = y0; pl.jumpReq = true;
  for (let t2 = 0; t2 < 1.5; t2 += 1 / 60) { pl.update(1 / 60); ymax = Math.max(ymax, pl.pos.y); }
  out.jump = +(ymax - y0).toFixed(2);
  // 飛行 ↔ 步行切換
  pl.teleport(1500, 0, 0); pl.update(0.016); pl.toggleFly(); const fp = pl.wpos.clone(); pl.keys = new Set(['KeyW']); for (let i = 0; i < 60; i++) pl.update(1 / 60); pl.keys = new Set(); pl.toggleFly(); sim(1, []);
  out.flyland = { s: +pl.pos.x.toFixed(1), u: +pl.pos.z.toFixed(1), h: +pl.pos.y.toFixed(2), onGround: pl.onGround };
  return out;
});
console.log(JSON.stringify(r)); console.log(logs.join('\n') || 'no errors');
await browser.close();
