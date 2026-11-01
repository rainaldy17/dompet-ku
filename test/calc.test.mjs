// Jalankan: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { emptyState } = await import('../js/store.js');
const C = await import('../js/calc.js');
const { parseRp, ymAdd } = await import('../js/util.js');

const bankDebt = (paid = 0) => ({
  id: 'b', name: 'Bank', kind: 'bank',
  inst: Array.from({ length: 71 }, (_, i) => ({ due: ymAdd('2026-12', i) + '-12', amount: 3988480, paid: i < paid ? 'x' : null })),
  bank: { principal: 200e6, tenor: 72, cicilan: 3988480, danaBeku: 3988480 },
});

test('parseRp', () => {
  assert.equal(parseRp('1.250.000'), 1250000);
  assert.equal(parseRp('1,25jt'), 1250000);
  assert.equal(parseRp('45rb'), 45000);
});

test('pelunasan bank = sisa pokok + 1x bunga - dana beku', () => {
  const info = C.bankInfo(bankDebt(24));
  assert.equal(Math.round(info.bunga), 1210702);
  assert.ok(Math.abs(info.pelunasan - (200e6 - (200e6 / 72) * 24 + 1210702 - 3988480)) < 2);
  assert.ok(Math.abs(info.bungaFlatTahun - 0.0726) < 0.001);
});

test('tukin Januari 50% dan THR mengikuti bulan per tahun', () => {
  const s = emptyState();
  s.settings.thrMonths = { 2027: 3 };
  s.incomes = [
    { id: 't', name: 'Tukin', cat: 'tukin', amount: 8800000, kind: 'monthly', mult: { 1: 0.5 } },
    { id: 'h', name: 'THR', cat: 'bonus', amount: 1000, kind: 'thr' },
  ];
  assert.equal(C.expectedIncomes(s, '2027-01')[0].amount, 4400000);
  assert.equal(C.expectedIncomes(s, '2027-03').length, 2);
  assert.equal(C.expectedIncomes(s, '2027-04').length, 1);
});

test('proyeksi melunasi bank saat saldo cukup dan menyisakan dana darurat', () => {
  const s = emptyState();
  s.createdAt = '2026-11-01';
  s.settings.horizon = '2031-10';
  s.settings.bufferMin = 5e6;
  s.incomes = [{ id: 'g', name: 'Gaji', cat: 'gaji', amount: 10e6, kind: 'monthly' }];
  s.debts = [bankDebt(0)];
  const r = C.project(s, new Date('2026-11-01T12:00:00'));
  assert.ok(r.payoff, 'harus lunas');
  const row = r.rows.find((x) => x.m === r.payoff.m);
  assert.ok(row.cash >= 5e6);
  assert.equal(r.firstNegative, null);
});

test('saldo, kantong, dan hapus transaksi mengembalikan kantong', async () => {
  const store = await import('../js/store.js');
  store.startEmpty();
  const s = store.getState();
  s.goals.push({ id: 'g', name: 'Dieng', target: 2e6, saved: 1e6 });
  const t = store.addTx({ type: 'out', amount: 600000, cat: 'jalan', goalId: 'g' });
  assert.equal(s.goals[0].saved, 400000);
  assert.equal(C.saldo(s), -600000);
  store.removeTx(t.id);
  assert.equal(s.goals[0].saved, 1e6);
  assert.equal(C.saldo(s), 0);
});
