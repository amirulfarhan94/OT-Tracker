// Pure calculation logic — no DOM, no storage. Unit-tested in tests/calc.test.mjs.

export const DAY_TYPES = ['normal', 'off', 'rest', 'public'];

export const DAY_LABELS = {
  normal: 'Normal Day',
  off: 'Off Day',
  rest: 'Rest Day',
  public: 'Public Holiday',
};

export const DEFAULT_SETTINGS = {
  salary: 0,            // monthly basic salary (RM)
  normalHours: 8,       // normal working hours per day
  daysPerMonth: 26,     // ORP divisor (Employment Act 1955)
  offDay: 6,            // 0 = Sunday … 6 = Saturday
  restDay: 0,
  monthlyCapHours: 104, // OT limit per month
  cutoffDay: 0,         // salary cut-off day (1–28); 0 = end of month
  rates: {
    normal: 1.5,        // × HRP per hour
    offWithin: 1.0,     // × HRP per hour, up to normalHours
    offBeyond: 1.5,     // × HRP per hour, beyond normalHours
    restBeyond: 2.0,    // × HRP per hour, beyond normalHours
    publicWithinDays: 2, // × ORP for working up to normalHours
    publicBeyond: 3.0,  // × HRP per hour, beyond normalHours
  },
};

export function mergeSettings(saved) {
  const s = saved || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates || {}) },
  };
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function toMinutes(hhmm) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Hours between start and end. If end <= start, the shift crosses midnight. */
export function durationHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60;
  return round2(diff / 60);
}

export function crossesMidnight(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s !== null && e !== null && e <= s;
}

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Pay period named by its pay month (key 'YYYY-MM').
 * cutoffDay 0 → calendar month. cutoffDay 20 → 21st of previous month to 20th of this month.
 */
export function periodRange(key, cutoffDay = 0) {
  const [y, m] = key.split('-').map(Number);
  const c = Number(cutoffDay) || 0;
  if (!c) return { start: isoOf(new Date(y, m - 1, 1)), end: isoOf(new Date(y, m, 0)) };
  return { start: isoOf(new Date(y, m - 2, c + 1)), end: isoOf(new Date(y, m - 1, c)) };
}

/** Pay period key ('YYYY-MM') that a date belongs to. */
export function periodKeyOf(dateStr, cutoffDay = 0) {
  const c = Number(cutoffDay) || 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!c || d <= c) return `${y}-${pad2(m)}`;
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
}

/** holidays: array of { date: 'YYYY-MM-DD', name } */
export function detectDayType(dateStr, settings, holidays = []) {
  if (!dateStr) return 'normal';
  if (holidays.some((h) => h.date === dateStr)) return 'public';
  const dow = parseDate(dateStr).getDay();
  if (dow === Number(settings.restDay)) return 'rest';
  if (dow === Number(settings.offDay)) return 'off';
  return 'normal';
}

export function baseRates(settings) {
  const salary = Number(settings.salary) || 0;
  const days = Number(settings.daysPerMonth) || 26;
  const hours = Number(settings.normalHours) || 8;
  const orp = salary / days;
  const hrp = orp / hours;
  return { orp, hrp };
}

const fmtRate = (n) => `${Number(n).toFixed(2)}×`;
const fmtH = (n) => `${round2(n)}h`;

/**
 * Pay for one OT entry.
 * Returns { amount, lines: [{ label, amount }] }.
 */
export function calcPay(hours, dayType, settings) {
  const s = mergeSettings(settings);
  const { orp, hrp } = baseRates(s);
  const r = s.rates;
  const N = Number(s.normalHours) || 8;
  const h = Math.max(0, Number(hours) || 0);
  const lines = [];

  if (h === 0) return { amount: 0, lines };

  const within = Math.min(h, N);
  const beyond = Math.max(h - N, 0);

  switch (dayType) {
    case 'off': {
      lines.push({ label: `${fmtH(within)} × HRP × ${fmtRate(r.offWithin)}`, amount: within * hrp * r.offWithin });
      if (beyond > 0) lines.push({ label: `${fmtH(beyond)} × HRP × ${fmtRate(r.offBeyond)}`, amount: beyond * hrp * r.offBeyond });
      break;
    }
    case 'rest': {
      if (h <= N / 2) lines.push({ label: `≤ ${fmtH(N / 2)} worked → ½ day ORP`, amount: 0.5 * orp });
      else lines.push({ label: `> ${fmtH(N / 2)} worked → 1 day ORP`, amount: orp });
      if (beyond > 0) lines.push({ label: `${fmtH(beyond)} × HRP × ${fmtRate(r.restBeyond)}`, amount: beyond * hrp * r.restBeyond });
      break;
    }
    case 'public': {
      lines.push({ label: `Worked on holiday → ${r.publicWithinDays} days ORP`, amount: r.publicWithinDays * orp });
      if (beyond > 0) lines.push({ label: `${fmtH(beyond)} × HRP × ${fmtRate(r.publicBeyond)}`, amount: beyond * hrp * r.publicBeyond });
      break;
    }
    default: {
      lines.push({ label: `${fmtH(h)} × HRP × ${fmtRate(r.normal)}`, amount: h * hrp * r.normal });
    }
  }

  const rounded = lines.map((l) => ({ ...l, amount: round2(l.amount) }));
  const amount = round2(rounded.reduce((sum, l) => sum + l.amount, 0));
  return { amount, lines: rounded };
}

/** Resolve the effective day type of a saved entry. */
export function entryDayType(entry, settings, holidays) {
  return entry.dayTypeOverride || detectDayType(entry.date, settings, holidays);
}

/** Summary for a list of entries. */
export function summarize(entries, settings, holidays) {
  const byType = Object.fromEntries(DAY_TYPES.map((t) => [t, { hours: 0, amount: 0, count: 0 }]));
  let hours = 0;
  let amount = 0;
  for (const e of entries) {
    const type = entryDayType(e, settings, holidays);
    const h = durationHours(e.start, e.end);
    const pay = calcPay(h, type, settings).amount;
    hours += h;
    amount += pay;
    byType[type].hours += h;
    byType[type].amount += pay;
    byType[type].count += 1;
  }
  for (const t of DAY_TYPES) {
    byType[t].hours = round2(byType[t].hours);
    byType[t].amount = round2(byType[t].amount);
  }
  return { hours: round2(hours), amount: round2(amount), count: entries.length, byType };
}
