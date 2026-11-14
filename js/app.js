import {
  DAY_TYPES, DAY_LABELS, DEFAULT_SETTINGS, durationHours, crossesMidnight, detectDayType,
  calcPay, baseRates, summarize, entryDayType, parseDate, round2,
} from './calc.js';
import * as store from './store.js';

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());
const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
};
const RM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (n) => `${round2(n)}h`;
const fmtDateLong = (iso) => {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2000);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- State ----------
const state = {
  view: 'home',
  month: monthKeyOf(new Date()),
  holidayYear: new Date().getFullYear(),
};

const ctx = () => {
  const settings = store.getSettings();
  const holidays = store.getHolidays();
  return { settings, holidays };
};

function monthEntries(key) {
  return store.getEntries()
    .filter((e) => e.date.startsWith(key))
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
}

// ---------- Shared components ----------
function monthNav() {
  return `
    <section class="month-nav glass">
      <button class="icon-btn" data-month="-1" aria-label="Previous month">${ICON.left}</button>
      <b>${monthLabel(state.month)}</b>
      <button class="icon-btn" data-month="1" aria-label="Next month">${ICON.right}</button>
    </section>`;
}

function entryRow(e, settings, holidays) {
  const type = entryDayType(e, settings, holidays);
  const h = durationHours(e.start, e.end);
  const pay = calcPay(h, type, settings).amount;
  const d = parseDate(e.date);
  const overnight = crossesMidnight(e.start, e.end) ? ' <small>(+1)</small>' : '';
  return `
    <button class="entry" data-edit="${esc(e.id)}">
      <div class="entry-date"><b>${d.getDate()}</b><span>${WEEKDAYS[d.getDay()].slice(0, 3)}</span></div>
      <div class="entry-main">
        <div class="entry-top">
          <span class="chip ${type}">${DAY_LABELS[type]}</span>
          <span class="entry-time">${esc(e.start)} – ${esc(e.end)}${overnight}</span>
        </div>
        <p class="entry-desc ${e.description ? '' : 'empty'}">${e.description ? esc(e.description) : 'No description'}</p>
      </div>
      <div class="entry-amt"><b>${RM(pay)}</b><span>${hrs(h)}</span></div>
    </button>`;
}

function emptyState(text) {
  return `
    <div class="card empty-state">
      <div class="emoji">${ICON.clock}</div>
      <h3>No overtime yet</h3>
      <p>${text}</p>
      <button class="btn primary" data-action="add">+ Add overtime</button>
    </div>`;
}

// ---------- Views ----------
function renderHome() {
  const { settings, holidays } = ctx();
  const entries = monthEntries(state.month);
  const sum = summarize(entries, settings, holidays);
  const { hrp } = baseRates(settings);
  const cap = Number(settings.monthlyCapHours) || 104;
  const pct = Math.min(100, (sum.hours / cap) * 100);
  const capClass = sum.hours > cap ? 'over' : pct >= 80 ? 'warn' : '';

  const today = todayISO();
  const next = holidays.find((h) => h.date >= today);

  app.innerHTML = `
    ${monthNav()}

    ${!settings.salary ? `
      <div class="notice">
        <p><b>Set your monthly salary</b> so OT pay can be calculated.</p>
        <button class="btn primary sm" data-go="settings">Set now</button>
      </div>` : ''}

    <section class="card hero">
      <p class="eyebrow">Estimated OT pay</p>
      <h2 class="big">${RM(sum.amount)}</h2>
      <div class="hero-stats">
        <div><span>Total hours</span><b>${hrs(sum.hours)}</b></div>
        <div><span>Entries</span><b>${sum.count}</b></div>
        <div><span>Hourly rate</span><b>${RM(hrp)}</b></div>
      </div>
      <div class="cap">
        <div class="cap-bar ${capClass}"><i style="width:${pct}%"></i></div>
        <small>${hrs(sum.hours)} of ${cap}h monthly OT limit${sum.hours > cap ? ' — limit exceeded!' : ''}</small>
      </div>
    </section>

    <section class="tiles">
      ${DAY_TYPES.map((t) => `
        <div class="card tile">
          <span class="chip ${t}">${DAY_LABELS[t]}</span>
          <div class="amt">${RM(sum.byType[t].amount)}</div>
          <small>${hrs(sum.byType[t].hours)} · ${sum.byType[t].count} ${sum.byType[t].count === 1 ? 'entry' : 'entries'}</small>
        </div>`).join('')}
    </section>

    ${entries.length ? `
      <section class="card">
        <div class="section-title">
          <h3>Recent</h3>
          <button class="btn ghost sm" data-go="records">See all</button>
        </div>
        <div class="list">${entries.slice(0, 5).map((e) => entryRow(e, settings, holidays)).join('')}</div>
      </section>` : emptyState(`Tap + to log your first overtime for ${monthLabel(state.month)}.`)}

    ${next ? `
      <section class="card next-holiday">
        <div class="cal"><b>${parseDate(next.date).getDate()}</b><span>${MONTHS[parseDate(next.date).getMonth()].slice(0, 3)}</span></div>
        <div>
          <p class="small muted">Next public holiday</p>
          <p><b>${esc(next.name)}</b></p>
          <p class="small muted">${fmtDateLong(next.date)}</p>
        </div>
      </section>` : ''}
  `;
}

function renderRecords() {
  const { settings, holidays } = ctx();
  const entries = monthEntries(state.month);
  const sum = summarize(entries, settings, holidays);

  app.innerHTML = `
    ${monthNav()}
    <section class="strip">
      <div class="glass"><span>Total pay</span><b>${RM(sum.amount)}</b></div>
      <div class="glass"><span>Hours</span><b>${hrs(sum.hours)}</b></div>
      <div class="glass"><span>Entries</span><b>${sum.count}</b></div>
    </section>
    ${entries.length ? `
      <div class="list">${entries.map((e) => entryRow(e, settings, holidays)).join('')}</div>
      <button class="btn ghost block" data-action="csv-month">Export ${monthLabel(state.month)} (CSV)</button>
    ` : emptyState(`No overtime recorded for ${monthLabel(state.month)}.`)}
  `;
}

function renderHolidays() {
  const holidays = store.getHolidays();
  const today = todayISO();
  const years = [...new Set([...holidays.map((h) => Number(h.date.slice(0, 4))), new Date().getFullYear()])].sort();
  if (!years.includes(state.holidayYear)) state.holidayYear = years[years.length - 1];
  const list = holidays.filter((h) => h.date.startsWith(String(state.holidayYear)));

  app.innerHTML = `
    <section class="card">
      <h3>Add a holiday</h3>
      <form class="add-holiday" id="holiday-form">
        <input type="date" name="date" required aria-label="Holiday date" />
        <input type="text" name="hname" placeholder="e.g. Cuti Peristiwa" aria-label="Holiday name" />
        <button class="btn primary" type="submit">Add holiday</button>
      </form>
      <p class="hint">These dates are auto-detected as Public Holiday when you log OT. Islamic holidays can shift by a day after the official announcement, so edit them here when needed.</p>
    </section>
    <section class="card">
      <div class="section-title"><h3>Public Holidays · Selangor</h3></div>
      <div class="year-tabs">
        ${years.map((y) => `<button data-year="${y}" class="${y === state.holidayYear ? 'active' : ''}">${y}</button>`).join('')}
      </div>
      <div class="holiday-list">
        ${list.length ? list.map((h) => {
          const d = parseDate(h.date);
          return `
          <div class="holiday ${h.date < today ? 'past' : ''}">
            <time>${WEEKDAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</time>
            <span>${esc(h.name)}${h.custom ? '<span class="tag">CUSTOM</span>' : ''}</span>
            <button class="x-btn" data-del-holiday="${h.date}" aria-label="Remove ${esc(h.name)}">×</button>
          </div>`;
        }).join('') : '<p class="muted small">No holidays for this year. Add them below.</p>'}
      </div>
    </section>
    <button class="btn ghost block" data-action="reset-holidays">Restore default holiday list</button>
  `;
}

function renderSettings() {
  const { settings } = ctx();
  const r = settings.rates;
  const { orp, hrp } = baseRates(settings);
  const dayOpts = (sel) => WEEKDAYS.map((d, i) => `<option value="${i}" ${Number(sel) === i ? 'selected' : ''}>${d}</option>`).join('');
  const rateRow = (key, label, sub, step = '0.1') => `
    <div class="rate-row">
      <label for="r-${key}">${label}<small>${sub}</small></label>
      <input id="r-${key}" type="number" inputmode="decimal" step="${step}" min="0" data-rate="${key}" value="${r[key]}" />
    </div>`;

  app.innerHTML = `
    <form id="settings-form" class="settings-grid" novalidate>
      <section class="card settings-grid">
        <h3>Pay</h3>
        <label class="field">
          <span>Monthly basic salary</span>
          <div class="input-prefix"><em>RM</em><input type="number" inputmode="decimal" step="0.01" min="0" name="salary" value="${settings.salary || ''}" placeholder="e.g. 2600" /></div>
        </label>
        <div class="row2">
          <label class="field"><span>Normal hours / day</span><input type="number" inputmode="decimal" step="0.5" min="1" name="normalHours" value="${settings.normalHours}" /></label>
          <label class="field"><span>Days divisor</span><input type="number" inputmode="numeric" step="1" min="1" name="daysPerMonth" value="${settings.daysPerMonth}" /></label>
        </div>
        <div class="derived">
          <div><span>Daily rate (ORP)</span><b id="d-orp">${RM(orp)}</b></div>
          <div><span>Hourly rate (HRP)</span><b id="d-hrp">${RM(hrp)}</b></div>
        </div>
        <p class="hint">ORP = salary ÷ ${settings.daysPerMonth}. HRP = ORP ÷ ${settings.normalHours}. Following the Employment Act 1955.</p>
      </section>

      <section class="card settings-grid">
        <h3>Work week</h3>
        <div class="row2">
          <label class="field"><span>Off day</span><select name="offDay">${dayOpts(settings.offDay)}</select></label>
          <label class="field"><span>Rest day</span><select name="restDay">${dayOpts(settings.restDay)}</select></label>
        </div>
        <label class="field"><span>Monthly OT limit (hours)</span><input type="number" inputmode="numeric" min="1" step="1" name="monthlyCapHours" value="${settings.monthlyCapHours}" /></label>
      </section>

      <section class="card settings-grid">
        <div class="section-title" style="margin:0"><h3>OT rates</h3><button type="button" class="btn ghost sm" data-action="reset-rates">Reset</button></div>
        <div class="rate-table">
          ${rateRow('normal', 'Normal day', 'per hour × HRP')}
          ${rateRow('offWithin', 'Off day — first hours', `up to ${settings.normalHours}h, per hour × HRP`)}
          ${rateRow('offBeyond', 'Off day — beyond', `after ${settings.normalHours}h, per hour × HRP`)}
          ${rateRow('restBeyond', 'Rest day — beyond', `after ${settings.normalHours}h, per hour × HRP`)}
          ${rateRow('publicWithinDays', 'Public holiday', `days of ORP, up to ${settings.normalHours}h`, '0.5')}
          ${rateRow('publicBeyond', 'Public holiday — beyond', `after ${settings.normalHours}h, per hour × HRP`)}
        </div>
        <p class="hint">Rest day up to ${settings.normalHours / 2}h = ½ day ORP, more than ${settings.normalHours / 2}h = 1 day ORP (Employment Act 1955, s.60).</p>
      </section>
    </form>

    <section class="card settings-grid">
      <h3>Data</h3>
      <div class="btn-row">
        <button class="btn ghost" data-action="csv-all">Export all (CSV)</button>
        <button class="btn ghost" data-action="backup">Backup (JSON)</button>
      </div>
      <div class="btn-row">
        <label class="btn ghost" style="text-align:center">Restore backup<input type="file" accept="application/json,.json" id="restore-input" hidden /></label>
        <button class="btn ghost danger" data-action="clear">Delete all data</button>
      </div>
      <p class="hint">Your data is stored only on this device. Make a backup regularly.</p>
    </section>
    <p class="hint" style="text-align:center">OT Tracker v1.0 · Pay is an estimate — check with your payslip.</p>
  `;
}

const VIEWS = { home: renderHome, records: renderRecords, holidays: renderHolidays, settings: renderSettings };
const SUBTITLES = { home: 'Overview', records: 'Records', holidays: 'Public holidays', settings: 'Settings' };

function render() {
  VIEWS[state.view]();
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === state.view));
  $('#topbar-sub').textContent = SUBTITLES[state.view];
  app.style.animation = 'none';
  void app.offsetWidth; // restart fade animation
  app.style.animation = '';
}

function go(view) {
  if (!VIEWS[view]) view = 'home';
  state.view = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  render();
  window.scrollTo({ top: 0 });
}

// ---------- CSV ----------
function toCSV(entries) {
  const { settings, holidays } = ctx();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Day', 'Day Type', 'From', 'To', 'Hours', 'Description', 'Amount (RM)']];
  let totalH = 0;
  let totalRM = 0;
  [...entries].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).forEach((e) => {
    const type = entryDayType(e, settings, holidays);
    const h = durationHours(e.start, e.end);
    const pay = calcPay(h, type, settings).amount;
    totalH += h;
    totalRM += pay;
    rows.push([e.date, WEEKDAYS[parseDate(e.date).getDay()], DAY_LABELS[type], e.start, e.end, h, e.description, pay.toFixed(2)]);
  });
  rows.push(['', '', '', '', 'TOTAL', round2(totalH), '', round2(totalRM).toFixed(2)]);
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

// ---------- Entry sheet ----------
const sheet = $('#sheet');
const form = $('#entry-form');

function lastTimes() {
  const all = store.getEntries().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return all[0] ? { start: all[0].start, end: all[0].end } : { start: '18:00', end: '21:00' };
}

function openSheet(entry) {
  const isEdit = Boolean(entry);
  const t = lastTimes();
  const defaultDate = state.month === monthKeyOf(new Date()) ? todayISO() : `${state.month}-01`;
  const e = entry || { date: defaultDate, start: t.start, end: t.end, description: '', dayTypeOverride: '' };
  form.reset();
  form.entryId.value = e.id || '';
  form.date.value = e.date;
  form.start.value = e.start;
  form.end.value = e.end;
  form.description.value = e.description || '';
  form.dayTypeOverride.value = e.dayTypeOverride || '';
  $('#sheet-title').textContent = isEdit ? 'Edit Overtime' : 'Add Overtime';
  $('#f-delete').hidden = !isEdit;
  $('#f-error').hidden = true;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  updatePreview();
}

function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = '';
}

function updatePreview() {
  const { settings, holidays } = ctx();
  const date = form.date.value;
  const auto = detectDayType(date, settings, holidays);
  const override = form.dayTypeOverride.value;
  const type = override || auto;
  const h = durationHours(form.start.value, form.end.value);

  const chip = $('#f-chip');
  chip.className = `chip ${type}`;
  chip.textContent = DAY_LABELS[type];

  const holiday = holidays.find((x) => x.date === date);
  let note = '';
  if (date) note = WEEKDAYS[parseDate(date).getDay()];
  if (holiday) note += ` · ${holiday.name}`;
  note += override ? ` · set manually (auto: ${DAY_LABELS[auto]})` : ' · auto-detected';
  $('#f-daynote').textContent = note;
  form.dayTypeOverride.options[0].textContent = `Auto (${DAY_LABELS[auto]})`;

  $('#f-hours').textContent = hrs(h);
  $('#f-overnight').hidden = !crossesMidnight(form.start.value, form.end.value);

  const pay = calcPay(h, type, settings);
  $('#f-amount').textContent = RM(pay.amount);
  $('#f-lines').innerHTML = settings.salary
    ? pay.lines.map((l) => `<li><span>${esc(l.label)}</span><span>${RM(l.amount)}</span></li>`).join('')
    : '<li class="warn"><span>Set your salary in Settings to calculate pay</span></li>';
}

form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const err = $('#f-error');
  const data = {
    id: form.entryId.value || undefined,
    date: form.date.value,
    start: form.start.value,
    end: form.end.value,
    description: form.description.value.trim(),
    dayTypeOverride: form.dayTypeOverride.value || null,
  };
  if (!data.date || !data.start || !data.end) {
    err.textContent = 'Please fill in the date, start and end time.';
    err.hidden = false;
    return;
  }
  if (data.start === data.end) {
    err.textContent = 'Start and end time cannot be the same.';
    err.hidden = false;
    return;
  }
  store.saveEntry(data);
  state.month = data.date.slice(0, 7);
  closeSheet();
  toast(data.id ? 'Overtime updated' : 'Overtime saved');
  render();
});

$('#f-cancel').addEventListener('click', closeSheet);
$('#f-delete').addEventListener('click', () => {
  const id = form.entryId.value;
  if (id && confirm('Delete this overtime entry?')) {
    store.deleteEntry(id);
    closeSheet();
    toast('Entry deleted');
    render();
  }
});
sheet.addEventListener('click', (ev) => { if (ev.target === sheet) closeSheet(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !sheet.hidden) closeSheet(); });

// ---------- Settings saving ----------
function saveSettingsFromForm(f) {
  const s = store.getSettings();
  const num = (v, fallback) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
  s.salary = num(f.salary.value, 0);
  s.normalHours = num(f.normalHours.value, DEFAULT_SETTINGS.normalHours) || DEFAULT_SETTINGS.normalHours;
  s.daysPerMonth = num(f.daysPerMonth.value, DEFAULT_SETTINGS.daysPerMonth) || DEFAULT_SETTINGS.daysPerMonth;
  s.offDay = Number(f.offDay.value);
  s.restDay = Number(f.restDay.value);
  s.monthlyCapHours = num(f.monthlyCapHours.value, DEFAULT_SETTINGS.monthlyCapHours);
  $$('[data-rate]', f).forEach((i) => { s.rates[i.dataset.rate] = num(i.value, DEFAULT_SETTINGS.rates[i.dataset.rate]); });
  store.saveSettings(s);
  return s;
}

app.addEventListener('input', (ev) => {
  const f = ev.target.closest('#settings-form');
  if (!f) return;
  const s = saveSettingsFromForm(f);
  const { orp, hrp } = baseRates(s);
  $('#d-orp').textContent = RM(orp);
  $('#d-hrp').textContent = RM(hrp);
});
app.addEventListener('change', (ev) => {
  if (ev.target.closest('#settings-form')) {
    saveSettingsFromForm(ev.target.closest('#settings-form'));
    toast('Settings saved');
    if (ev.target.matches('[name="normalHours"], [name="daysPerMonth"]')) render();
  }
  if (ev.target.id === 'restore-input') {
    const file = ev.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        if (!confirm('Restore this backup? Current data will be replaced.')) return;
        store.importBackup(JSON.parse(txt));
        toast('Backup restored');
        render();
      } catch (e) {
        alert(e.message || 'Invalid backup file.');
      }
    });
  }
});

// ---------- Global click handling ----------
app.addEventListener('submit', (ev) => {
  if (ev.target.id === 'holiday-form') {
    ev.preventDefault();
    const f = ev.target;
    if (!f.date.value) return;
    store.addHoliday(f.date.value, f.hname.value.trim());
    state.holidayYear = Number(f.date.value.slice(0, 4));
    toast('Holiday added');
    render();
  }
  if (ev.target.id === 'settings-form') ev.preventDefault();
});

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('button, [data-action]');
  if (!el) return;

  if (el.dataset.month) {
    state.month = shiftMonth(state.month, Number(el.dataset.month));
    render();
  } else if (el.dataset.edit) {
    const entry = store.getEntries().find((e) => e.id === el.dataset.edit);
    if (entry) openSheet(entry);
  } else if (el.dataset.go) {
    go(el.dataset.go);
  } else if (el.dataset.year) {
    state.holidayYear = Number(el.dataset.year);
    render();
  } else if (el.dataset.delHoliday) {
    const h = store.getHolidays().find((x) => x.date === el.dataset.delHoliday);
    if (h && confirm(`Remove "${h.name}" (${fmtDateLong(h.date)})?`)) {
      store.removeHoliday(h.date);
      toast('Holiday removed');
      render();
    }
  } else if (el.dataset.action) {
    handleAction(el.dataset.action);
  }
});

function handleAction(action) {
  switch (action) {
    case 'add':
      openSheet();
      break;
    case 'csv-month':
      download(`ot-${state.month}.csv`, toCSV(monthEntries(state.month)), 'text/csv;charset=utf-8');
      break;
    case 'csv-all':
      download(`ot-all-${todayISO()}.csv`, toCSV(store.getEntries()), 'text/csv;charset=utf-8');
      break;
    case 'backup':
      download(`ot-backup-${todayISO()}.json`, JSON.stringify(store.exportBackup(), null, 2), 'application/json');
      break;
    case 'reset-rates': {
      const s = store.getSettings();
      s.rates = { ...DEFAULT_SETTINGS.rates };
      store.saveSettings(s);
      toast('Rates reset to default');
      render();
      break;
    }
    case 'reset-holidays':
      if (confirm('Restore the default Selangor holiday list? Your custom changes will be removed.')) {
        store.resetHolidays();
        toast('Holidays restored');
        render();
      }
      break;
    case 'clear':
      if (confirm('Delete ALL overtime records, settings and holidays? This cannot be undone.')) {
        store.clearAll();
        toast('All data deleted');
        render();
      }
      break;
    default:
  }
}

// ---------- Navigation ----------
$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
$('#fab').addEventListener('click', () => openSheet());
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

// ---------- PWA ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#install-btn').hidden = false;
});
$('#install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#install-btn').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ---------- Start ----------
go(location.hash.slice(1) || 'home');
