// Read-only check of the board in a fresh Chrome (never clicks Ack).
// Usage: node scripts/check.mjs <board url>
import { chromium } from 'playwright';

const url = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

for (const viewer of [
  { name: 'Berlin', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
  { name: 'Auckland', locale: 'en-NZ', timezoneId: 'Pacific/Auckland' },
]) {
  console.log(`--- ${viewer.name} (${viewer.locale}, ${viewer.timezoneId})`);
  const ctx = await browser.newContext({ locale: viewer.locale, timezoneId: viewer.timezoneId });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let polls = 0;
  page.on('request', (r) => { if (r.url().includes('/incidents?')) polls++; });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const loaderSeen = await page.locator('[data-testid="loader"]').count();
  ok(loaderSeen === 1, 'loader present on open');
  await page.locator('[data-testid="incident-row"]').first().waitFor();
  ok(await page.locator('[data-testid="loader"]').count() === 0, 'loader gone once incidents load');
  const rows = await page.locator('[data-testid="incident-row"]').count();
  ok(rows > 0, `${rows} incident rows`);
  ok(await page.locator('[data-testid="empty"]').isHidden(), 'empty state hidden');
  ok(await page.locator('[data-testid="incident-row"] [data-testid="ack"]').count() === rows, 'one Ack button per row');

  const meta = await page.locator('meta[name="build"]').getAttribute('content');
  const footer = (await page.locator('[data-testid="build-sha"]').textContent()).trim();
  ok(/^[0-9a-f]{40}$/.test(meta) && meta === footer, `build sha in meta and footer match (${meta})`);

  const first = page.locator('[data-testid="incident-row"]').first();
  const t = first.locator('time');
  console.log(`     first row ${await first.getAttribute('data-id')}: datetime=${await t.getAttribute('datetime')} shown="${await t.textContent()}"`);
  const ids = await page.locator('[data-testid="incident-row"]').evaluateAll((els) => els.map((e) => e.querySelector('time').dateTime));
  ok(ids.every((d, i) => i === 0 || ids[i - 1] >= d), 'rows newest first');

  // same DOM node after refreshes => rows are kept, not rebuilt
  await first.evaluate((el) => { el.dataset.probe = '1'; });
  const before = polls;
  await page.waitForTimeout(6500);
  ok(polls - before >= 2, `refreshed ${polls - before}x in 6.5 s`);
  ok(await page.locator('[data-testid="incident-row"][data-probe="1"]').count() === 1, 'rows survive refresh (not rebuilt)');
  ok(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
