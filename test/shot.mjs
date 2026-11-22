import puppeteer from 'puppeteer-core';
import fs from 'fs';
const poses = JSON.parse(process.argv[2] || '[]');
const prefix = process.argv[3] || 'shot';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-dev-shm-usage',`--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const logs = [];
page.on('console', (m) => logs.push('[' + m.type() + '] ' + m.text()));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const t0 = Date.now();
await page.goto('file:///home/claude/neural-city/dist/index.html?auto' + (process.env.Q || ''), { waitUntil: 'load', timeout: 120000 });
try {
  await page.waitForFunction('window.__city && (window.__city.ready || window.__city.err.length)', { timeout: 240000, polling: 500 });
} catch (e) { logs.push('TIMEOUT waiting for ready'); }
console.log('boot ms', Date.now() - t0);
const st = await page.evaluate(() => ({ ready: window.__city.ready, err: window.__city.err, stats: window.__city.stats }));
console.log(JSON.stringify(st, null, 1));
for (let i = 0; i < poses.length; i++) {
  const p = poses[i];
  if (p.tx !== undefined) {
    const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  const t1 = Date.now();
  await page.evaluate((p) => {
    const c = window.__city;
    const pl = c.player;
    pl.enabled = true;
    if (p.third !== undefined) pl.third = p.third;
    if (p.fly === false) { pl.teleport(p.x, p.z, p.yaw || 0); pl.pitch = p.pitch || 0; pl.update(0.05); pl.update(0.05); }
    else { pl.setPose(p.x, p.y, p.z, p.yaw, p.pitch); pl.update(0.001); }
    if (p.fov) { c.cam = c.cam; }
    c.render();
  }, p);
  await new Promise((r) => setTimeout(r, 300));
  const f = `test/${prefix}_${i}.png`;
  if (process.env.CLEAN) await page.addStyleTag({ content: '#ui,.ui,.hud,.panel,#minimap,canvas~*{display:none!important}' });
  await page.screenshot({ path: f });
  console.log('shot', f, Date.now() - t1, 'ms', p.name || '');
}
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
