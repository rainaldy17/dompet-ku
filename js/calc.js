// Semua perhitungan: saldo, jadwal, utang, proyeksi sampai target nikah.
import { ym, ymAdd, ymDiff } from './util.js';

// ---------- Saldo ----------
export function saldo(s) {
  let v = s.settings.startSaldo || 0;
  for (const t of s.tx) v += t.type === 'in' ? t.amount : -t.amount;
  return v;
}
export const totalKantong = (s) => s.goals.reduce((a, g) => a + (g.saved || 0), 0);
export const saldoBebas = (s) => saldo(s) - totalKantong(s);

// ---------- Pemasukan ----------
export function expectedIncomes(s, m) {
  const [y, mo] = m.split('-').map(Number);
  const out = [];
  for (const inc of s.incomes) {
    if (inc.archived) continue;
    if (inc.from && m < inc.from) continue;
    if (inc.until && m > inc.until) continue;
    let amount = 0;
    if (inc.kind === 'monthly') amount = inc.amount * (inc.mult?.[mo] ?? 1);
    else if (inc.kind === 'yearly' && Number(inc.month) === mo) amount = inc.amount;
    else if (inc.kind === 'thr' && Number(s.settings.thrMonths?.[y]) === mo) amount = inc.amount;
    else if (inc.kind === 'once' && inc.date === m) amount = inc.amount;
    if (amount > 0) out.push({ inc, key: `${inc.id}|${m}`, amount: Math.round(amount), done: s.checks[`${inc.id}|${m}`] || null });
  }
  return out.sort((a, b) => (a.inc.dayFrom || 1) - (b.inc.dayFrom || 1));
}

// ---------- Rencana pengeluaran ----------
export function plansDue(s, m) {
  const out = [];
  for (const p of s.plans) {
    if (p.archived) continue;
    let hit = false;
    if (!p.every) hit = p.month === m;
    else hit = m >= p.month && ymDiff(p.month, m) % p.every === 0 && (!p.until || m <= p.until);
    if (hit) out.push({ plan: p, key: `${p.id}|${m}`, amount: p.amount, done: s.planDone[`${p.id}|${m}`] || null });
  }
  return out;
}

// ---------- Utang ----------
export const isBank = (d) => d.kind === 'bank' && d.bank;
export const debtRemaining = (d) => (d.closed ? 0 : d.inst.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0));
export const debtPaid = (d) => d.inst.filter((i) => i.paid).reduce((a, i) => a + i.amount, 0);
export const debtTotal = (d) => d.inst.reduce((a, i) => a + i.amount, 0);
export const nextInst = (d) => (d.closed ? null : d.inst.filter((i) => !i.paid).sort((a, b) => (a.due < b.due ? -1 : 1))[0] || null);

export function bankInfo(d, paidCount = d.inst.filter((i) => i.paid).length) {
  const b = d.bank;
  const pokok = b.principal / b.tenor;
  const bunga = b.cicilan - pokok;
  const sisaPokok = Math.max(0, b.principal - pokok * paidCount);
  const pelunasan = Math.max(0, sisaPokok + bunga - (b.danaBeku || 0));
  return {
    pokok, bunga, sisaPokok, pelunasan, paidCount,
    bungaFlatTahun: (bunga * 12) / b.principal,
    totalBungaPenuh: bunga * b.tenor,
    hematBunga: Math.max(0, bunga * (b.tenor - paidCount - 1)),
  };
}

export function upcomingBills(s, fromISO, days = 10) {
  const end = new Date(fromISO);
  end.setDate(end.getDate() + days);
  const endISO = end.toISOString().slice(0, 10);
  const list = [];
  for (const d of s.debts) {
    if (d.closed) continue;
    for (const i of d.inst) if (!i.paid && i.due <= endISO) list.push({ debt: d, inst: i, overdue: i.due < fromISO });
  }
  return list.sort((a, b) => (a.inst.due < b.inst.due ? -1 : 1));
}

// ---------- Mode pacar ----------
export function pacarMonthly(mode) {
  if (!mode || mode.type !== 'pacar') return 0;
  return Math.round((mode.perMeet || 0) * (mode.meetsPerMonth || 0) + (mode.extra || 0));
}

// ---------- Rekap ----------
export function txInMonth(s, m) {
  return s.tx.filter((t) => t.date.slice(0, 7) === m);
}

export function monthSummary(s, m) {
  const txs = txInMonth(s, m);
  let inOp = 0, outOp = 0, inBig = 0, outBig = 0, cicilan = 0;
  const byCat = {};
  for (const t of txs) {
    const big = t.nonOp || (t.type === 'in' && t.cat === 'pinjaman');
    if (t.type === 'in') { big ? (inBig += t.amount) : (inOp += t.amount); continue; }
    if (big) { outBig += t.amount; continue; }
    outOp += t.amount;
    byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    if (t.cat === 'cicilan') cicilan += t.amount;
  }
  return {
    inOp, outOp, inBig, outBig, byCat, cicilan,
    sisa: inOp - outOp,
    savingRate: inOp > 0 ? (inOp - outOp) / inOp : 0,
    dsr: inOp > 0 ? cicilan / inOp : 0,
    count: txs.length,
  };
}

// pengeluaran rutin (tanpa tautan ke rencana/utang) per kategori, buat dibandingkan dengan anggaran
export function regularSpent(s, m) {
  const by = {};
  for (const t of txInMonth(s, m)) {
    if (t.type !== 'out' || t.ref || t.nonOp) continue;
    by[t.cat] = (by[t.cat] || 0) + t.amount;
  }
  return by;
}

export function budgetFor(s, cat, m) {
  if (cat === 'pacar') {
    const mode = s.settings.mode;
    return mode.type === 'pacar' && m >= mode.start ? pacarMonthly(mode) : s.budgets.pacar || 0;
  }
  return s.budgets[cat] || 0;
}

// ---------- Proyeksi ----------
/**
 * Simulasi bulan demi bulan dari bulan ini sampai horizon.
 * Strategi: cicilan bank jalan normal, uang lebih dikumpulkan, lalu bank dilunasi sekaligus
 * (sisa pokok + 1x bunga - dana beku) begitu saldo cukup dan masih menyisakan dana darurat.
 * overrides: { pacar, rokokCut (0-1), modif (sekali di bulan ini), extraMonthly, noPayoff }
 */
export function project(s, today = new Date(), ov = {}) {
  const cur = ym(today);
  const horizon = s.settings.horizon;
  const buffer = s.settings.bufferMin || 0;
  const target = s.settings.wedding.target || 0;
  const mode = ov.pacar != null ? { ...s.settings.mode, type: ov.pacar > 0 ? 'pacar' : 'solitude', perMeet: ov.pacar, meetsPerMonth: 1, extra: 0 } : s.settings.mode;
  const pacar = pacarMonthly(mode);

  let cash = saldo(s);
  const bank = s.debts.find((d) => isBank(d) && !d.closed);
  let bankOpen = !!bank;
  let paidCount = bank ? bank.inst.filter((i) => i.paid).length : 0;
  const spentNow = regularSpent(s, cur);
  const cats = Object.keys(s.budgets).filter((c) => c !== 'pacar');

  const rows = [];
  let payoff = null, weddingHit = null, minCash = null, firstNegative = null;

  for (let m = cur; m <= horizon; m = ymAdd(m, 1)) {
    const isCur = m === cur;
    const ev = [];
    let inc = 0, out = 0;

    // pemasukan
    for (const e of expectedIncomes(s, m)) {
      if (isCur && e.done) continue;
      inc += e.amount;
    }
    // anggaran rutin
    for (const c of cats) {
      let b = s.budgets[c] || 0;
      if (c === 'rokok' && ov.rokokCut) b *= 1 - ov.rokokCut;
      out += isCur ? Math.max(0, b - (spentNow[c] || 0)) : b;
    }
    if (mode.type === 'pacar' && m >= mode.start) out += isCur ? Math.max(0, pacar - (spentNow.pacar || 0)) : pacar;
    if (ov.extraMonthly) out -= ov.extraMonthly;
    if (isCur && ov.modif) { out += ov.modif; ev.push('modif'); }

    // rencana pengeluaran (bulan ini termasuk yang terlewat dan belum dibayar)
    const planMonths = isCur ? overdueMonths(s, cur) : [m];
    for (const pm of planMonths) for (const p of plansDue(s, pm)) if (!p.done) out += p.amount;

    // cicilan utang non-bank
    for (const d of s.debts) {
      if (d.closed || d === bank) continue;
      for (const i of d.inst) {
        if (i.paid) continue;
        const im = i.due.slice(0, 7);
        if (im === m || (isCur && im < cur)) out += i.amount;
      }
    }
    // cicilan bank
    if (bankOpen) {
      for (const i of bank.inst) {
        if (i.paid) continue;
        const im = i.due.slice(0, 7);
        if (im === m || (isCur && im < cur)) { out += i.amount; paidCount++; }
      }
    }

    cash += inc - out;

    if (bankOpen && !ov.noPayoff) {
      const info = bankInfo(bank, paidCount);
      if (bank.inst.every((i) => i.paid) || paidCount >= bank.inst.length) {
        bankOpen = false;
        payoff = { m, amount: 0, n: paidCount, natural: true };
        ev.push('lunas');
      } else if (cash - info.pelunasan >= buffer) {
        cash -= info.pelunasan;
        bankOpen = false;
        payoff = { m, amount: info.pelunasan, n: paidCount, hemat: info.hematBunga };
        ev.push('lunas');
      }
    }
    if (!bankOpen && !weddingHit && cash >= target) { weddingHit = m; ev.push('nikah'); }

    const pelunasanNow = bankOpen ? bankInfo(bank, paidCount).pelunasan : 0;
    rows.push({ m, inc, out, cash, ev, pelunasan: pelunasanNow, bankOpen });
    if (!minCash || cash < minCash.cash) minCash = { m, cash };
    if (cash < 0 && !firstNegative) firstNegative = m;
  }
  return { rows, payoff, weddingHit, minCash, firstNegative, pacar };
}

function overdueMonths(s, cur) {
  // bulan-bulan dari awal pencatatan sampai bulan ini
  const start = ym(s.createdAt || cur);
  const list = [];
  for (let m = start; m <= cur; m = ymAdd(m, 1)) list.push(m);
  return list.length ? list : [cur];
}

// ringkasan arus kas bulan tertentu (tanpa saldo awal), untuk peringatan "bulan seret"
export function monthPlanFlow(s, m) {
  let inc = 0, out = 0;
  for (const e of expectedIncomes(s, m)) inc += e.amount;
  for (const c of Object.keys(s.budgets)) if (c !== 'pacar') out += s.budgets[c] || 0;
  const mode = s.settings.mode;
  if (mode.type === 'pacar' && m >= mode.start) out += pacarMonthly(mode);
  for (const p of plansDue(s, m)) out += p.amount;
  for (const d of s.debts) if (!d.closed) for (const i of d.inst) if (!i.paid && i.due.slice(0, 7) === m) out += i.amount;
  return { inc, out, net: inc - out };
}
