// Local persistence (localStorage). All data stays on the device.
import { mergeSettings } from './calc.js';
import { DEFAULT_HOLIDAYS } from './holidays.js';

const K = {
  entries: 'ot.entries.v1',
  settings: 'ot.settings.v1',
  holidays: 'ot.holidays.v1', // { added: [{date,name}], removed: [date] }
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- Entries ----------
export function getEntries() {
  return read(K.entries, []);
}

export function saveEntry(entry) {
  const entries = getEntries();
  const now = new Date().toISOString();
  if (entry.id) {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) entries[i] = { ...entries[i], ...entry, updatedAt: now };
    else entries.push({ ...entry, createdAt: now, updatedAt: now });
  } else {
    entries.push({ ...entry, id: uid(), createdAt: now, updatedAt: now });
  }
  write(K.entries, entries);
}

export function deleteEntry(id) {
  write(K.entries, getEntries().filter((e) => e.id !== id));
}

// ---------- Settings ----------
export function getSettings() {
  return mergeSettings(read(K.settings, {}));
}

export function saveSettings(settings) {
  write(K.settings, mergeSettings(settings));
}

// ---------- Holidays ----------
function holidayState() {
  return read(K.holidays, { added: [], removed: [] });
}

export function getHolidays() {
  const { added, removed } = holidayState();
  const map = new Map();
  for (const h of DEFAULT_HOLIDAYS) if (!removed.includes(h.date)) map.set(h.date, { ...h, custom: false });
  for (const h of added) map.set(h.date, { ...h, custom: true });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function addHoliday(date, name) {
  const st = holidayState();
  st.added = st.added.filter((h) => h.date !== date);
  st.added.push({ date, name: name || 'Public Holiday' });
  st.removed = st.removed.filter((d) => d !== date);
  write(K.holidays, st);
}

export function removeHoliday(date) {
  const st = holidayState();
  st.added = st.added.filter((h) => h.date !== date);
  if (DEFAULT_HOLIDAYS.some((h) => h.date === date) && !st.removed.includes(date)) st.removed.push(date);
  write(K.holidays, st);
}

export function resetHolidays() {
  localStorage.removeItem(K.holidays);
}

// ---------- Backup ----------
export function exportBackup() {
  return {
    app: 'ot-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: getEntries(),
    settings: getSettings(),
    holidays: holidayState(),
  };
}

export function importBackup(data) {
  if (!data || data.app !== 'ot-tracker' || !Array.isArray(data.entries)) {
    throw new Error('Not a valid OT Tracker backup file.');
  }
  write(K.entries, data.entries);
  if (data.settings) saveSettings(data.settings);
  if (data.holidays) write(K.holidays, data.holidays);
}

export function clearAll() {
  Object.values(K).forEach((k) => localStorage.removeItem(k));
}
