// Records the board in use (open-board, watch-board, ack-incident) as .webm, with an on-screen mm:ss clock.
// Usage: node scripts/record.mjs <board url> <name>   -> rec/<name>.webm + rec/<name>.json
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const [url, name = 'step1'] = process.argv.slice(2);
mkdirSync('rec', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'rec/raw', size: { width: 1280, height: 720 } },
});
const t0 = Date.now(); // video starts with the page
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
// recording overlay only (not part of the board): elapsed clock + a caption line
await ctx.addInitScript((start) => {
  const mount = () => {
    const box = document.createElement('div');
    box.id = '__rec';
    box.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:99999;font:13px ui-monospace,monospace;background:#111;color:#fff;padding:6px 10px;border-radius:6px;opacity:.85;pointer-events:none;max-width:560px';
    box.innerHTML = '<div>● rec <b id="__clock">00:00</b></div><div id="__cap"></div>';
    document.documentElement.append(box);
    setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      document.getElementById('__clock').textContent =
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}, t0);

const page = await ctx.newPage();
const caption = (text) => page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.textContent = t; }, text);
const log = [];
const mark = (what) => { const at = mmss(Date.now() - t0); log.push({ at, what }); console.log(at, what); return at; };

// open-board
mark('open-board: navigate');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await caption('open-board: loading');
await page.locator('[data-testid="incident-row"]').first().waitFor();
const sha = await page.locator('meta[name="build"]').getAttribute('content');
const rows = await page.locator('[data-testid="incident-row"]').count();
mark(`open-board: ${rows} incidents shown, build ${sha}`);
await caption(`open-board: ${rows} incidents · build ${sha.slice(0, 7)}`);
await page.waitForTimeout(3000);

// watch-board
let polls = 0;
page.on('request', (r) => { if (r.url().includes('/incidents?')) polls++; });
mark('watch-board: start');
await caption('watch-board: board refreshes every 2 s, no reload');
await page.waitForTimeout(10000);
mark(`watch-board: ${polls} refreshes in 10 s`);

// ack-incident: top row (newest)
const row = page.locator('[data-testid="incident-row"]').first();
const id = await row.getAttribute('data-id');
await caption(`ack-incident: Ack on ${id}`);
await row.locator('[data-testid="ack"]').hover();
await page.waitForTimeout(1200);
const ackReply = page.waitForResponse((r) => r.url().includes('/ack?'));
const clickAt = mark(`ack-incident: click Ack on ${id}`);
await row.locator('[data-testid="ack"]').click();
const reply = await (await ackReply).json();
await row.locator('[data-testid="acked"]').waitFor();
const ackedAt = mark(`ack-incident: ${reply.id} acked at ${reply.ackedAt}`);
await caption(`ack-incident: ${reply.id} acked · receipt ${String(reply.receipt).slice(0, 16)}…`);
await page.waitForTimeout(6000);
const stillAcked = await page.locator(`[data-testid="incident-row"][data-id="${id}"] [data-testid="acked"]`).count();
mark(`ack-incident: acked mark still there after refreshes: ${stillAcked === 1}`);
await page.waitForTimeout(2000);

const video = page.video();
await ctx.close();
renameSync(await video.path(), `rec/${name}.webm`);
await browser.close();
writeFileSync(`rec/${name}.json`, JSON.stringify({ url, sha, clickedId: id, clickAt, ackedMarkAt: ackedAt, reply, log }, null, 2));
console.log(`saved rec/${name}.webm and rec/${name}.json`);
