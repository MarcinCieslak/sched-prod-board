// Records the ack race like a person: the pointer rests on the top row's Ack, a new incident lands,
// and the hand clicks the same screen point a reaction time later (raw mouse click, no auto-wait).
// Usage: node scripts/record-race.mjs <board url> <name> [reactionMs=200]
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const [url, name = 'race', reactionArg] = process.argv.slice(2);
const REACTION_MS = Number(reactionArg ?? 200);
const MAX_WAIT_MS = 12 * 60_000;
mkdirSync('rec', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'rec/raw', size: { width: 1280, height: 720 } },
});
const t0 = Date.now();
const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
// recording overlay only (not part of the board): clock, caption, visible pointer + click flash
await ctx.addInitScript((start) => {
  const mount = () => {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:99999;font:13px ui-monospace,monospace;background:#111;color:#fff;padding:6px 10px;border-radius:6px;opacity:.85;pointer-events:none;max-width:640px';
    box.innerHTML = '<div>● rec <b id="__clock">00:00</b></div><div id="__cap"></div>';
    const dot = document.createElement('div');
    dot.id = '__ptr';
    dot.style.cssText =
      'position:fixed;left:-50px;top:-50px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,40,.55);border:2px solid #b00020;z-index:99998;pointer-events:none;transition:transform .12s';
    document.documentElement.append(box, dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(2.2)'; setTimeout(() => (dot.style.transform = ''), 350); }, true);
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
const caption = (text) => page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.textContent = t; }, text).catch(() => {});
const log = [];
const mark = (what) => { const at = mmss(Date.now() - t0); log.push({ at, what }); console.log(at, what); return at; };

mark('open-board: navigate');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="incident-row"]').first().waitFor();
const sha = await page.locator('meta[name="build"]').getAttribute('content');
mark(`open-board: ${await page.locator('[data-testid="incident-row"]').count()} incidents, build ${sha}`);
await page.waitForTimeout(2000);

// Aim: the person decides to take the top incident and moves the hand onto its Ack button.
const meantId = await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
const box = await page.locator(`[data-testid="incident-row"][data-id="${meantId}"] [data-testid="ack"]`).boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(400, 600);
await page.mouse.move(x, y, { steps: 25 });
mark(`ack-incident: pointer on Ack of ${meantId} (meant row), point ${Math.round(x)},${Math.round(y)}`);
await caption(`ack-incident: about to Ack ${meantId} (top row)`);

// The board goes on changing. When a new incident lands at the top, the hand clicks a reaction time later.
const acks = [];
page.on('response', async (r) => { if (r.url().includes('/ack?')) acks.push({ t: Date.now(), body: await r.json().catch(() => null) }); });
await page.waitForFunction(
  (id) => document.querySelector('[data-testid="incident-row"]')?.getAttribute('data-id') !== id,
  meantId,
  { timeout: MAX_WAIT_MS, polling: 'raf' },
);
const landedAt = mark('ack-incident: new incident landed at the top, rows shifted down');
const newTopId = await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
await page.waitForTimeout(REACTION_MS);
const underPointer = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="incident-row"]')?.getAttribute('data-id'), [x, y]);
const clickAt = mark(`ack-incident: hand clicks the same point (${REACTION_MS} ms after the landing); row under pointer: ${underPointer}`);
await page.mouse.click(x, y);
await page.waitForTimeout(1500);
const reply = acks.at(-1)?.body;
const ackedId = reply?.id;
mark(`ack-incident: meant ${meantId}, acked ${ackedId} (new top was ${newTopId})`);
await caption(`ack-incident: meant ${meantId} · acked ${ackedId}${ackedId !== meantId ? '  ✗ wrong row' : ''}`);
await page.waitForTimeout(6000);
mark('end');

const video = page.video();
await ctx.close();
renameSync(await video.path(), `rec/${name}.webm`);
await browser.close();
writeFileSync(`rec/${name}.json`, JSON.stringify({ url, sha, meantId, newTopId, underPointer, ackedId, landedAt, clickAt, reactionMs: REACTION_MS, reply, log }, null, 2));
console.log(`saved rec/${name}.webm and rec/${name}.json`);
