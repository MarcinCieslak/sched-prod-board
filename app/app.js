import { fetchIncidents, ack } from './api.js';

// R4: refresh every 2 s while open. The next poll is scheduled only after the
// current one finishes, so a slow answer never stacks requests.
const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

// R5: viewer's own time zone and locale order (en-GB/de-DE: day before month).
const timeFormat = new Intl.DateTimeFormat(navigator.languages?.[0] || undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});
function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFormat.format(d);
}

/** id -> <li>; rows are kept, never rebuilt, so acks and buttons survive refreshes. */
const rows = new Map();
/** id -> ack reply, so the acked state is the board's own, not the DOM's. */
const acked = new Map();

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function severityClass(sev) {
  return /^sev[0-9]$/.test(sev) ? sev : 'sev-unknown';
}

function ackedMark(reply) {
  const mark = el('span', { 'data-testid': 'acked', class: 'acked' }, `✓ Acked ${localTime(reply.ackedAt)}`);
  mark.title = `ack receipt: ${reply.receipt}`;
  return mark;
}

async function onAck(id, button) {
  const row = rows.get(id);
  button.disabled = true;
  button.textContent = 'Acking…';
  row.querySelector('.err')?.remove();
  try {
    const reply = await ack(id);
    acked.set(id, reply);
    button.replaceWith(ackedMark(reply));
    row.classList.add('is-acked');
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Ack';
    row.querySelector('.action').append(el('span', { class: 'err', role: 'alert' }, 'Ack failed, try again'));
  }
}

function buildRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id });
  li.append(
    el('span', { class: 'id' }),
    el('span', { class: 'sev' }),
    el('span', { class: 'what' }),
    el('time'),
    el('span', { class: 'action' }),
  );
  const button = el('button', { type: 'button', 'data-testid': 'ack', class: 'ack' }, 'Ack');
  button.addEventListener('click', () => onAck(i.id, button));
  li.querySelector('.action').append(button);
  return li;
}

function fillRow(li, i) {
  li.className = `row ${severityClass(i.severity)}${acked.has(i.id) ? ' is-acked' : ''}`;
  li.querySelector('.id').textContent = i.id;
  li.querySelector('.sev').textContent = i.severity;
  li.querySelector('.what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const time = li.querySelector('time');
  time.dateTime = i.openedAt; // full UTC value stays in the attribute
  time.title = `${i.openedAt} (UTC)`;
  time.textContent = localTime(i.openedAt);
}

// R1: newest first, new incidents at the top, without touching rows that did not change.
function render(incidents) {
  const seen = new Set();
  let before = list.firstElementChild;
  for (const i of incidents) {
    seen.add(i.id);
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      rows.set(i.id, li);
    }
    fillRow(li, i);
    if (li !== before) list.insertBefore(li, before); // moves only rows out of place
    before = li.nextElementSibling;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
    }
  }
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
}

let loaded = false;
async function poll() {
  try {
    const page = await fetchIncidents();
    render(page.incidents ?? []);
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents load
    }
  } catch (err) {
    console.error(err);
    if (!loaded) loader.lastChild.textContent = ' Could not load incidents, retrying…';
  } finally {
    setTimeout(poll, REFRESH_MS);
  }
}

poll();
