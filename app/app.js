import { fetchIncidents, ack } from './api.js';

// R4: refresh every 2 s while open. The next poll is scheduled only after the
// current one finishes, so a slow answer never stacks requests.
const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = panel.querySelector('[data-testid="panel-ack"]');
const panelStatus = panel.querySelector('.p-status');

// R5: viewer's own time zone and locale order (en-GB/de-DE: day before month).
const timeFormat = new Intl.DateTimeFormat(navigator.languages?.[0] || undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});
function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFormat.format(d);
}

/** id -> <li>; rows are kept, never rebuilt, so acked marks and focus survive refreshes. */
const rows = new Map();
/** id -> latest incident data from the API. */
const incidents = new Map();
/** id -> ack reply, so the acked state is the board's own, not the DOM's. */
const acked = new Map();
/** The incident the panel is open on. Set only by the user picking a row. */
let selectedId = null;
let acking = false;

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

// ---- incident panel (product decision, 2026-11-12): Ack lives here, not in the row ----

function openPanel(id) {
  selectedId = id;
  panelStatus.textContent = '';
  for (const [rid, li] of rows) li.setAttribute('aria-current', rid === id ? 'true' : 'false');
  renderPanel();
  panel.hidden = false;
}

function closePanel() {
  selectedId = null;
  panel.hidden = true;
  panel.removeAttribute('data-id');
  for (const li of rows.values()) li.setAttribute('aria-current', 'false');
}

function renderPanel() {
  if (!selectedId) return;
  const i = incidents.get(selectedId);
  panel.dataset.id = selectedId;
  panel.className = `panel ${i ? severityClass(i.severity) : ''}`;
  panel.querySelector('.panel-id').textContent = selectedId;
  panel.querySelector('.p-sev').textContent = i ? i.severity : '—';
  panel.querySelector('.p-service').textContent = i ? i.service : '—';
  panel.querySelector('.p-region').textContent = i ? i.region : '—';
  panel.querySelector('.p-summary').textContent = i ? i.summary : 'No longer on the board.';
  const time = panel.querySelector('.p-time');
  time.dateTime = i ? i.openedAt : '';
  time.title = i ? `${i.openedAt} (UTC)` : '';
  time.textContent = i ? localTime(i.openedAt) : '—';

  const reply = acked.get(selectedId);
  if (!acking) panelAck.textContent = `Ack ${selectedId}`;
  panelAck.hidden = Boolean(reply);
  panelAck.disabled = acking || !i;
  if (reply) panelStatus.textContent = `✓ Acked ${localTime(reply.ackedAt)}`;
}

async function onPanelAck() {
  const id = panel.dataset.id; // the incident the panel names, whatever the list did meanwhile
  if (!id || acked.has(id) || acking) return;
  acking = true;
  panelAck.disabled = true;
  panelAck.textContent = `Acking ${id}…`;
  panelStatus.textContent = '';
  try {
    const reply = await ack(id);
    acked.set(id, reply);
    const li = rows.get(id);
    if (li) fillRow(li, incidents.get(id));
  } catch (err) {
    console.error(err);
    panelStatus.textContent = 'Ack failed, try again';
  } finally {
    acking = false;
    if (selectedId === id) renderPanel();
  }
}

panelAck.addEventListener('click', onPanelAck);
panel.querySelector('.panel-close').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selectedId) closePanel();
});

// ---- list ----

function buildRow(i) {
  const li = el('li', {
    'data-testid': 'incident-row',
    'data-id': i.id,
    tabindex: '0',
    'aria-current': 'false',
    'aria-label': `Open ${i.id}`,
  });
  li.append(
    el('span', { class: 'id' }),
    el('span', { class: 'sev' }),
    el('span', { class: 'what' }),
    el('time'),
    el('span', { class: 'action' }),
  );
  li.addEventListener('click', () => openPanel(i.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(i.id);
    }
  });
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
  const action = li.querySelector('.action');
  const reply = acked.get(i.id);
  if (reply && !action.querySelector('[data-testid="acked"]')) action.replaceChildren(ackedMark(reply));
  else if (!reply && !action.firstChild) action.replaceChildren(el('span', { class: 'open-hint', 'aria-hidden': 'true' }, 'Open ›'));
}

// R1: newest first, new incidents live at the top, without touching rows that did not change.
function render(page) {
  const seen = new Set();
  let before = list.firstElementChild;
  for (const i of page) {
    seen.add(i.id);
    incidents.set(i.id, i);
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      rows.set(i.id, li);
    }
    fillRow(li, i);
    li.setAttribute('aria-current', i.id === selectedId ? 'true' : 'false');
    if (li !== before) list.insertBefore(li, before); // moves only rows out of place
    before = li.nextElementSibling;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
      incidents.delete(id);
    }
  }
  empty.hidden = page.length > 0;
  list.hidden = page.length === 0;
  renderPanel();
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
