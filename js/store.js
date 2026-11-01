// Penyimpanan data: semua tersimpan di HP (localStorage), tidak dikirim ke mana pun.
import { uid, todayISO, ym, ymAdd } from './util.js';

const KEY = 'dompetku:v1';

export const DEFAULT_CATEGORIES = [
  { id: 'rokok', name: 'Rokok', emoji: '🚬' },
  { id: 'bbm', name: 'BBM / Solar', emoji: '⛽' },
  { id: 'makan', name: 'Makan', emoji: '🍱' },
  { id: 'ortu', name: 'Orang tua', emoji: '🏠' },
  { id: 'mobil', name: 'Mobil (cuci/servis)', emoji: '🚗' },
  { id: 'modif', name: 'Modif mobil', emoji: '🛠️' },
  { id: 'internet', name: 'Internet & pulsa', emoji: '📶' },
  { id: 'nongkrong', name: 'Nongkrong', emoji: '☕' },
  { id: 'diri', name: 'Perawatan diri', emoji: '🧴' },
  { id: 'jalan', name: 'Jalan-jalan', emoji: '🏔️' },
  { id: 'pacar', name: 'Pacar', emoji: '💑' },
  { id: 'pajak', name: 'Pajak & surat', emoji: '🧾' },
  { id: 'cicilan', name: 'Cicilan / utang', emoji: '💳' },
  { id: 'keluarga', name: 'Keluarga', emoji: '👨‍👩‍👦' },
  { id: 'lain', name: 'Lain-lain / tak terduga', emoji: '📦' },
];

export const INCOME_CATEGORIES = [
  { id: 'gaji', name: 'Gaji', emoji: '💼' },
  { id: 'tukin', name: 'Tukin', emoji: '🏅' },
  { id: 'bonus', name: 'Gaji 13/14 & THR', emoji: '🎁' },
  { id: 'pinjaman', name: 'Pencairan pinjaman', emoji: '🏦' },
  { id: 'masuk_lain', name: 'Pemasukan lain', emoji: '💰' },
];

export function emptyState() {
  const now = ym();
  return {
    version: 1,
    createdAt: todayISO(),
    settings: {
      name: '',
      startSaldo: 0,
      bufferMin: 5000000,
      horizon: ymAdd(now, 60),
      thrMonths: {},
      mode: { type: 'solitude', start: ymAdd(now, 1), perMeet: 200000, meetsPerMonth: 4, extra: 100000 },
      wedding: { target: 150000000, deadline: ymAdd(now, 48) },
    },
    categories: DEFAULT_CATEGORIES,
    budgets: {},
    incomes: [],
    checks: {},
    plans: [],
    planDone: {},
    quick: [
      { id: uid(), name: 'Rokok', emoji: '🚬', cat: 'rokok', price: 45000, count: 0 },
      { id: uid(), name: 'Solar', emoji: '⛽', cat: 'bbm', price: 250000, count: 0 },
      { id: uid(), name: 'Makan siang', emoji: '🍱', cat: 'makan', price: 35000, count: 0 },
      { id: uid(), name: 'Cuci mobil', emoji: '🚿', cat: 'mobil', price: 35000, count: 0 },
      { id: uid(), name: 'Nongkrong', emoji: '☕', cat: 'nongkrong', price: 75000, count: 0 },
    ],
    debts: [],
    goals: [],
    tx: [],
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Gagal membaca data', e);
  }
  return null; // belum ada data -> layar sambutan
}

function migrate(s) {
  const base = emptyState();
  s.settings = { ...base.settings, ...s.settings, mode: { ...base.settings.mode, ...(s.settings?.mode || {}) }, wedding: { ...base.settings.wedding, ...(s.settings?.wedding || {}) } };
  for (const k of ['categories', 'budgets', 'incomes', 'checks', 'plans', 'planDone', 'quick', 'debts', 'goals', 'tx']) {
    if (s[k] == null) s[k] = base[k];
  }
  // pastikan kategori bawaan baru ikut muncul
  for (const c of DEFAULT_CATEGORIES) if (!s.categories.find((x) => x.id === c.id)) s.categories.push(c);
  return s;
}

export const getState = () => state;
export const hasData = () => state != null;

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(KEY + ':savedAt', new Date().toISOString());
  listeners.forEach((fn) => fn(state));
}

export function update(fn) {
  fn(state);
  save();
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function startEmpty() {
  state = emptyState();
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  state = null;
  listeners.forEach((fn) => fn(state));
}

export const subscribe = (fn) => listeners.add(fn);

export function exportJSON() {
  return JSON.stringify({ app: 'dompet-ku', exportedAt: new Date().toISOString(), data: state }, null, 1);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  const data = obj.data || obj;
  if (!data.settings || !Array.isArray(data.tx)) throw new Error('File bukan backup Dompet-ku');
  replaceState(data);
}

// ===== Aksi =====

export function addTx({ date = todayISO(), type, amount, cat, note = '', ref = null, goalId = null, nonOp = false }) {
  const t = { id: uid(), date, type, amount: Math.round(amount), cat, note, ref };
  if (nonOp) t.nonOp = true;
  state.tx.push(t);
  if (goalId) {
    const g = state.goals.find((x) => x.id === goalId);
    if (g) {
      const take = Math.min(g.saved, t.amount);
      g.saved -= take;
      t.fromGoal = { id: goalId, amount: take };
    }
  }
  return t;
}

export function removeTx(id) {
  const i = state.tx.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = state.tx[i];
  // lepaskan tautan
  for (const k of Object.keys(state.checks)) if (state.checks[k] === id) delete state.checks[k];
  for (const k of Object.keys(state.planDone)) if (state.planDone[k] === id) delete state.planDone[k];
  for (const d of state.debts) {
    for (const ins of d.inst) if (ins.paid === id) ins.paid = null;
    if (d.closedTx === id) { d.closed = false; d.closedTx = null; }
  }
  if (t.fromGoal) {
    const g = state.goals.find((x) => x.id === t.fromGoal.id);
    if (g) g.saved += t.fromGoal.amount;
  }
  state.tx.splice(i, 1);
}

export function bumpQuick(id) {
  const q = state.quick.find((x) => x.id === id);
  if (q) q.count = (q.count || 0) + 1;
}
