import * as store from './store.js';
import { getState as S, update, addTx, removeTx, bumpQuick, DEFAULT_CATEGORIES, INCOME_CATEGORIES } from './store.js';
import * as C from './calc.js';
import { rp, rpShort, uid, todayISO, ym, ymAdd, ymDiff, ymLabel, dateLabel, daysBetween, esc, parseRp, BULAN } from './util.js';
import { lineChart, barsChart } from './charts.js';

// ?today=2026-11-20 untuk mencoba tanggal lain
const params = new URLSearchParams(location.search);
const TODAY = params.get('today') || todayISO();
const NOW = new Date(TODAY + 'T12:00:00');
const CUR = ym(TODAY);

const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
let rekapMonth = CUR;
let sim = { pacar: null, rokokCut: 0, modif: 0, extraMonthly: 0 };

// ---------- helper tampilan ----------
const allCats = () => [...S().categories, ...INCOME_CATEGORIES];
const cat = (id) => allCats().find((c) => c.id === id) || { id, name: id, emoji: '•' };
const age = (m) => (S().settings.birth ? Math.floor(ymDiff(S().settings.birth, m) / 12) : null);
const pct = (v) => Math.round(v * 100) + '%';
const bar = (p, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%"></i></div>`;
const dayRange = (i) => (i.dayFrom ? (i.dayTo && i.dayTo !== i.dayFrom ? `tgl ${i.dayFrom}–${i.dayTo}` : `tgl ${i.dayFrom}`) : '');
const bank = () => S().debts.find((d) => C.isBank(d));

function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Batal</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = () => { undo(); el.remove(); };
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Sheet & form generik ----------
function openSheet(html, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  document.body.appendChild(wrap);
  wireMoney(wrap);
  onMount && onMount(wrap.querySelector('.sheet'));
  return wrap;
}
function closeSheet() { document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove()); }

function wireMoney(root) {
  root.querySelectorAll('input[data-money]').forEach((inp) => {
    const f = () => {
      const n = parseRp(inp.value.replace(/\./g, ''));
      inp.value = n ? n.toLocaleString('id-ID') : '';
    };
    inp.addEventListener('input', f);
    if (inp.value) f();
  });
}

function fieldHTML(f) {
  const v = f.value ?? '';
  const name = `name="${f.key}"`;
  let input;
  switch (f.type) {
    case 'money': input = `<input ${name} data-money inputmode="numeric" class="${f.big ? 'amount' : ''}" value="${v ? Number(v).toLocaleString('id-ID') : ''}" placeholder="0">`; break;
    case 'number': input = `<input ${name} type="number" inputmode="decimal" step="${f.step || 1}" value="${esc(v)}">`; break;
    case 'month': input = `<input ${name} type="month" value="${esc(v)}">`; break;
    case 'date': input = `<input ${name} type="date" value="${esc(v)}">`; break;
    case 'select': input = `<select ${name}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`; break;
    case 'check': return `<label class="field row"><input ${name} type="checkbox" ${v ? 'checked' : ''} style="width:auto"> <span style="margin:0;color:var(--text)">${esc(f.label)}</span></label>`;
    case 'textarea': input = `<textarea ${name} rows="2">${esc(v)}</textarea>`; break;
    default: input = `<input ${name} value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`;
  }
  return `<label class="field"><span>${esc(f.label)}</span>${input}${f.hint ? `<div class="tiny muted" style="margin-top:4px">${esc(f.hint)}</div>` : ''}</label>`;
}

function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    if (f.type === 'money') out[f.key] = parseRp(el.value.replace(/\./g, ''));
    else if (f.type === 'number') out[f.key] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'check') out[f.key] = el.checked;
    else out[f.key] = el.value;
  }
  return out;
}

function openForm({ title, intro = '', fields, saveLabel = 'Simpan', onSave, onDelete, extra = '' }) {
  openSheet(
    `<h3>${esc(title)}</h3>${intro}<form>${fields.map(fieldHTML).join('')}${extra}
    <div class="btns" style="margin-top:6px"><button class="btn block" type="submit">${esc(saveLabel)}</button>
    ${onDelete ? '<button class="btn danger block" type="button" data-del>Hapus</button>' : ''}</div></form>`,
    (sh) => {
      sh.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const vals = readForm(sh, fields);
        if (onSave(vals, sh) !== false) { closeSheet(); render(); }
      };
      const del = sh.querySelector('[data-del]');
      if (del) del.onclick = () => { if (confirm('Yakin hapus?')) { onDelete(); closeSheet(); render(); } };
    }
  );
}

const catOptions = (type = 'out') => (type === 'in' ? INCOME_CATEGORIES : S().categories).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));
const goalOptions = () => [{ value: '', label: '— tidak —' }, ...S().goals.filter((g) => g.saved > 0).map((g) => ({ value: g.id, label: `${g.emoji} ${g.name} (${rpShort(g.saved)})` }))];
const monthOptions = () => BULAN.map((b, i) => ({ value: i + 1, label: b }));

// ---------- Aksi ----------
function payInst(debtId, idx) {
  const d = S().debts.find((x) => x.id === debtId);
  const ins = d.inst[idx];
  if (ins.paid) {
    if (!confirm('Batalkan pembayaran cicilan ini?')) return;
    update(() => removeTx(ins.paid));
    return render();
  }
  let txId;
  update(() => {
    const n = idx + 1;
    const t = addTx({ date: TODAY, type: 'out', amount: ins.amount, cat: 'cicilan', note: `${d.name} • cicilan ${n}/${d.inst.length}`, ref: { debt: d.id, idx } });
    ins.paid = t.id; txId = t.id;
    if (d.inst.every((i) => i.paid)) d.closed = true;
  });
  render();
  toast(`${d.name} ${rpShort(ins.amount)} dibayar`, () => { update(() => removeTx(txId)); render(); });
}

function payOffDebt(debtId) {
  const d = S().debts.find((x) => x.id === debtId);
  const isB = C.isBank(d);
  const amount = isB ? C.bankInfo(d).pelunasan : C.debtRemaining(d);
  const payoffGoal = isB ? S().goals.find((g) => g.kind === 'payoff' && g.saved > 0) : null;
  openForm({
    title: `Lunasi ${d.name}`,
    intro: `<p class="muted small">${isB ? 'Sisa pokok + 1x bunga − dana beku. Pastikan angka final sesuai surat dari bank.' : 'Semua cicilan yang tersisa dibayar sekaligus.'}</p>`,
    fields: [
      { key: 'amount', label: 'Jumlah pelunasan', type: 'money', value: Math.round(amount), big: true },
      { key: 'date', label: 'Tanggal', type: 'date', value: TODAY },
      { key: 'goal', label: 'Ambil dari kantong', type: 'select', options: goalOptions(), value: payoffGoal?.id || '' },
    ],
    saveLabel: 'Lunasi',
    onSave: (v) => update(() => {
      const t = addTx({ date: v.date, type: 'out', amount: v.amount, cat: 'cicilan', note: `Pelunasan ${d.name}`, ref: { debt: d.id, payoff: true }, nonOp: true, goalId: v.goal || null });
      d.inst.forEach((i) => { if (!i.paid) i.paid = t.id; });
      d.closed = true; d.closedTx = t.id;
    }),
  });
}

function payAllPinjol() {
  const list = S().debts.filter((d) => !d.closed && (d.kind === 'pinjol' || d.kind === 'kartu'));
  const total = list.reduce((a, d) => a + C.debtRemaining(d), 0);
  if (!list.length) return toast('Tidak ada pinjol/kartu kredit aktif');
  if (!confirm(`Lunasi ${list.length} pinjol & kartu kredit sekaligus: ${rp(total)}?\n\nTanyakan dulu ke tiap aplikasi apakah ada biaya pelunasan.`)) return;
  update(() => {
    for (const d of list) {
      const amt = C.debtRemaining(d);
      const t = addTx({ date: TODAY, type: 'out', amount: amt, cat: 'cicilan', note: `Pelunasan ${d.name}`, ref: { debt: d.id, payoff: true }, nonOp: true });
      d.inst.forEach((i) => { if (!i.paid) i.paid = t.id; });
      d.closed = true; d.closedTx = t.id;
    }
  });
  render();
  toast('Semua pinjol & kartu kredit lunas 🎉');
}

function checkIncome(key) {
  const [id, m] = key.split('|');
  const s = S();
  const e = C.expectedIncomes(s, m).find((x) => x.key === key);
  if (!e) return;
  if (e.done) {
    if (!confirm(`Batalkan centang "${e.inc.name}"?`)) return;
    update(() => {
      const t = s.tx.find((x) => x.id === e.done);
      if (t?.linkedBank) removeTx(t.linkedBank);
      removeTx(e.done);
    });
    return render();
  }
  const b = bank();
  const bi = e.inc.deductBank && b && !b.closed ? b.inst.findIndex((i) => !i.paid && i.due.slice(0, 7) <= m) : -1;
  const fields = [
    { key: 'amount', label: 'Jumlah yang masuk (kotor)', type: 'money', value: e.amount, big: true, hint: 'Ubah kalau cair sebagian, misalnya 50%.' },
    { key: 'date', label: 'Tanggal cair', type: 'date', value: TODAY },
  ];
  if (bi >= 0) fields.push({ key: 'deduct', label: `Cicilan bank ${rp(b.inst[bi].amount)} dipotong dari sini`, type: 'check', value: true });
  openForm({
    title: `✅ ${e.inc.name} masuk`,
    intro: e.inc.note ? `<p class="muted small">${esc(e.inc.note)}</p>` : '',
    fields,
    onSave: (v) => update(() => {
      const t = addTx({ date: v.date, type: 'in', amount: v.amount, cat: e.inc.cat, note: `${e.inc.name} (${ymLabel(m, true)})`, ref: { income: key } });
      s.checks[key] = t.id;
      if (v.deduct && bi >= 0) {
        const ins = b.inst[bi];
        const t2 = addTx({ date: v.date, type: 'out', amount: ins.amount, cat: 'cicilan', note: `${b.name} • cicilan ${bi + 1}/${b.bank.tenor} (potong ${e.inc.name.toLowerCase()})`, ref: { debt: b.id, idx: bi } });
        ins.paid = t2.id;
        t.linkedBank = t2.id;
      }
    }),
  });
}

function payPlan(key) {
  const s = S();
  const [id, m] = key.split('|');
  const p = s.plans.find((x) => x.id === id);
  const done = s.planDone[key];
  if (done) {
    if (!confirm(`Batalkan "${p.name}"?`)) return;
    update(() => removeTx(done));
    return render();
  }
  const g = p.goalId && s.goals.find((x) => x.id === p.goalId && x.saved > 0);
  openForm({
    title: p.name,
    fields: [
      { key: 'amount', label: 'Biaya sebenarnya', type: 'money', value: p.amount, big: true },
      { key: 'date', label: 'Tanggal', type: 'date', value: TODAY },
      { key: 'goal', label: 'Ambil dari kantong', type: 'select', options: goalOptions(), value: g ? g.id : '' },
    ],
    saveLabel: 'Catat sudah dibayar',
    onSave: (v) => update(() => {
      const t = addTx({ date: v.date, type: 'out', amount: v.amount, cat: p.cat, note: p.name, ref: { plan: key }, goalId: v.goal || null });
      if (p.nonOp) t.nonOp = true;
      s.planDone[key] = t.id;
    }),
  });
}

function quickTap(qid) {
  const q = S().quick.find((x) => x.id === qid);
  if (q.ask) return openCatat({ type: 'out', amount: q.price, cat: q.cat, note: q.name, qid });
  let id;
  update(() => { id = addTx({ type: 'out', amount: q.price, cat: q.cat, note: q.name, date: TODAY }).id; bumpQuick(qid); });
  render();
  toast(`${q.emoji} ${q.name} ${rp(q.price)} dicatat`, () => { update(() => { removeTx(id); q.count--; }); render(); });
}

function openCatat(pre = {}) {
  let type = pre.type || 'out';
  const s = S();
  const draw = () => {
    const cats = type === 'in' ? INCOME_CATEGORIES : s.categories;
    const curCat = pre.cat && cats.find((c) => c.id === pre.cat) ? pre.cat : cats[0].id;
    const favs = [...s.quick].sort((a, b) => (b.count || 0) - (a.count || 0));
    openSheet(`
      <h3>Catat ${type === 'in' ? 'pemasukan' : 'pengeluaran'}</h3>
      <div class="seg"><button data-t="out" class="${type === 'out' ? 'on' : ''}">💸 Keluar</button><button data-t="in" class="${type === 'in' ? 'on' : ''}">💰 Masuk</button></div>
      ${type === 'out' ? `<div class="chips" style="margin-bottom:12px">${favs.map((q) => `<button type="button" class="chip" data-fav="${q.id}">${q.emoji} ${esc(q.name)}</button>`).join('')}</div>` : ''}
      <form>
        <label class="field"><span>Jumlah</span><input name="amount" data-money inputmode="numeric" class="amount" value="${pre.amount ? Number(pre.amount).toLocaleString('id-ID') : ''}" placeholder="0" autofocus></label>
        <div class="field"><span>Kategori</span><div class="chips" data-cats>${cats.map((c) => `<button type="button" class="chip ${c.id === curCat ? 'on' : ''}" data-c="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div></div>
        <label class="field"><span>Catatan</span><input name="note" value="${esc(pre.note || '')}" placeholder="misal: rokok, solar, makan siang"></label>
        <div class="grid2">
          <label class="field"><span>Tanggal</span><input name="date" type="date" value="${pre.date || TODAY}"></label>
          ${type === 'out' ? `<label class="field"><span>Ambil dari kantong</span><select name="goal">${goalOptions().map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}</select></label>` : '<div></div>'}
        </div>
        ${type === 'out' && !pre.qid ? '<label class="field row"><input name="fav" type="checkbox" style="width:auto"> <span style="margin:0;color:var(--text)">Jadikan tombol cepat</span></label>' : ''}
        <button class="btn block" type="submit">Simpan</button>
      </form>`, (sh) => {
      let chosen = curCat;
      sh.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { type = b.dataset.t; pre = {}; draw(); }));
      sh.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { chosen = b.dataset.c; sh.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }));
      sh.querySelectorAll('[data-fav]').forEach((b) => (b.onclick = () => {
        const q = s.quick.find((x) => x.id === b.dataset.fav);
        pre = { type: 'out', amount: q.price, cat: q.cat, note: q.name, qid: q.id }; draw();
      }));
      sh.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        const f = e.target;
        const amount = parseRp(f.amount.value.replace(/\./g, ''));
        if (!amount) return toast('Isi jumlahnya dulu');
        update(() => {
          addTx({ type, amount, cat: chosen, note: f.note.value.trim(), date: f.date.value, goalId: f.goal?.value || null });
          if (pre.qid) { const q = s.quick.find((x) => x.id === pre.qid); if (q) { q.count = (q.count || 0) + 1; q.price = amount; } }
          if (f.fav?.checked && f.note.value.trim()) s.quick.push({ id: uid(), name: f.note.value.trim(), emoji: cat(chosen).emoji, cat: chosen, price: amount, count: 1 });
        });
        closeSheet(); render();
        toast(`${type === 'in' ? 'Pemasukan' : 'Pengeluaran'} ${rp(amount)} dicatat`);
      };
    });
  };
  draw();
}

function goalMove(gid, dir) {
  const g = S().goals.find((x) => x.id === gid);
  const bebas = C.saldoBebas(S());
  openForm({
    title: `${dir > 0 ? 'Sisihkan ke' : 'Ambil dari'} ${g.name}`,
    intro: `<p class="muted small">${dir > 0 ? `Saldo bebas sekarang ${rp(bebas)}.` : `Isi kantong ${rp(g.saved)}.`} Ini hanya memindahkan alokasi, total saldo tidak berubah.</p>`,
    fields: [{ key: 'amount', label: 'Jumlah', type: 'money', big: true, value: '' }],
    onSave: (v) => {
      if (!v.amount) return false;
      update(() => { g.saved = Math.max(0, (g.saved || 0) + dir * Math.min(v.amount, dir > 0 ? Infinity : g.saved)); });
    },
  });
}

// ---------- Peringatan ----------
function alerts(proj) {
  const s = S();
  const out = [];
  const bills = C.upcomingBills(s, TODAY, 3);
  const overdue = bills.filter((b) => b.overdue);
  if (overdue.length) out.push(['bad', '⏰', `<b>${overdue.length} tagihan lewat jatuh tempo</b>: ${overdue.map((b) => esc(b.debt.name)).join(', ')}. Bayar segera biar nggak kena denda.`]);
  const soon = bills.filter((b) => !b.overdue);
  if (soon.length) out.push(['warn', '📅', `<b>${soon.length} tagihan jatuh tempo ≤ 3 hari</b> (${rpShort(soon.reduce((a, b) => a + b.inst.amount, 0))}).`]);

  // bulan seret ke depan (Januari)
  for (let k = 0; k <= 2; k++) {
    const m = ymAdd(CUR, k);
    if (!m.endsWith('-01')) continue;
    const f = C.monthPlanFlow(s, m);
    if (f.net < 0) out.push(['warn', '🥶', `<b>${ymLabel(m)} diperkirakan minus ${rp(-f.net)}</b>: gaji biasanya telat dan tukin cuma 50%. Tahan sisa uang Desember untuk Januari.`]);
  }
  // anggaran
  const spent = C.regularSpent(s, CUR);
  const over = Object.keys(s.budgets).filter((c) => s.budgets[c] && (spent[c] || 0) > s.budgets[c]);
  if (over.length) out.push(['warn', '📊', `Anggaran terlampaui: ${over.map((c) => cat(c).emoji + ' ' + esc(cat(c).name)).join(', ')}.`]);
  // siap lunas bank
  const b = bank();
  if (b && !b.closed) {
    const info = C.bankInfo(b);
    if (C.saldo(s) - info.pelunasan >= s.settings.bufferMin) out.push(['good', '🏦', `<b>Uangmu sudah cukup untuk melunasi bank!</b> Pelunasan ±${rp(info.pelunasan)}, hemat bunga ±${rp(info.hematBunga)}.`]);
  }
  if (proj.firstNegative) out.push(['bad', '⚠️', `Proyeksi saldo minus di <b>${ymLabel(proj.firstNegative)}</b>. Cek tab Proyeksi.`]);
  if (C.saldoBebas(s) < 0) out.push(['warn', '🫙', 'Isi kantong melebihi saldo. Ambil sebagian dari kantong supaya saldo bebas tidak minus.']);
  const last = localStorage.getItem('dompetku:lastBackup');
  const since = last ? last.slice(0, 10) : s.tx.reduce((a, t) => (t.date < a ? t.date : a), TODAY);
  if (s.tx.length > 10 && daysBetween(since, TODAY) > 14) out.push(['info', '💾', 'Sudah lebih dari 2 minggu belum backup. Buka ⚙️ Pengaturan → Backup.']);
  return out.map(([c, ic, t]) => `<div class="alert ${c}"><span class="ic">${ic}</span><div>${t}</div></div>`).join('');
}

// ---------- Halaman ----------
function pageBeranda() {
  const s = S();
  const proj = C.project(s, NOW);
  const mode = s.settings.mode;
  const total = C.saldo(s), kantong = C.totalKantong(s);
  const incs = C.expectedIncomes(s, CUR);
  const b = bank();
  const plans = [];
  for (let m = ym(s.createdAt); m <= CUR; m = ymAdd(m, 1)) for (const p of C.plansDue(s, m)) if (m === CUR || !p.done) plans.push({ ...p, m });
  const bills = C.upcomingBills(s, TODAY, 10);
  const favs = [...s.quick].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 6);
  const recent = [...s.tx].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const sumMonth = C.monthSummary(s, CUR);

  return `
  <div class="card hero">
    <button class="mode-chip" data-act="mode">${mode.type === 'pacar' ? '💑 Mode pacar' : '🧘 Mode solitude'}</button>
    <div class="label">Total saldo</div>
    <div class="big num">${rp(total)}</div>
    <div class="split">
      <div>Saldo bebas<b class="num">${rp(total - kantong)}</b></div>
      <div>Di kantong<b class="num">${rp(kantong)}</b></div>
      <div>Bulan ini<b class="num ${sumMonth.sisa >= 0 ? '' : 'bad'}">${sumMonth.sisa >= 0 ? '+' : ''}${rpShort(sumMonth.sisa)}</b></div>
    </div>
  </div>
  ${alerts(proj)}
  <div class="card">
    <h2>💼 Pemasukan ${ymLabel(CUR)}</h2>
    <div class="list">${incs.length ? incs.map((e) => {
      const t = e.done && s.tx.find((x) => x.id === e.done);
      const deduct = e.inc.deductBank && b && !b.closed && b.inst.some((i) => i.due.slice(0, 7) === CUR);
      return `<div class="item">
        <button class="check ${e.done ? 'on' : ''}" data-act="income" data-key="${e.key}">${e.done ? '✓' : ''}</button>
        <div class="grow"><div class="t">${esc(e.inc.name)}</div><div class="s">${e.done ? 'Masuk ' + dateLabel(t.date) : dayRange(e.inc) || 'belum masuk'}${deduct && !e.done ? ' • dipotong cicilan bank' : ''}</div></div>
        <div class="amt num ${e.done ? 'good' : 'muted'}">${rp(t ? t.amount : e.amount)}</div></div>`;
    }).join('') : '<div class="muted small">Belum ada pemasukan terjadwal bulan ini. Tambahkan di ⚙️ Pengaturan.</div>'}</div>
  </div>
  <div class="card">
    <h2>⚡ Catat cepat <span class="sp"></span><button class="link" data-act="catat">+ lainnya</button></h2>
    <div class="quick">${favs.map((q) => `<button data-act="quick" data-id="${q.id}"><span class="e">${q.emoji}</span><span class="n">${esc(q.name)}</span><span class="p">${q.ask ? 'isi nominal' : rpShort(q.price)}</span></button>`).join('')}</div>
    <div class="tiny muted" style="margin-top:8px">Sekali ketuk langsung tercatat. Urutannya mengikuti yang paling sering kamu beli.</div>
  </div>
  ${plans.length ? `<div class="card"><h2>🗓️ Rencana pengeluaran</h2><div class="list">${plans.map((p) => `
    <div class="item"><button class="check ${p.done ? 'on' : ''}" data-act="plan" data-key="${p.key}">${p.done ? '✓' : ''}</button>
    <div class="grow"><div class="t ellipsis">${esc(p.plan.name)}</div><div class="s">${cat(p.plan.cat).emoji} ${ymLabel(p.m, true)}${p.m < CUR && !p.done ? ' • <span class="warn">terlewat</span>' : ''}</div></div>
    <div class="amt num">${rpShort(p.amount)}</div></div>`).join('')}</div></div>` : ''}
  <div class="card">
    <h2>📅 Tagihan 10 hari ke depan <span class="sp"></span><a class="link" href="#utang">semua</a></h2>
    <div class="list">${bills.length ? bills.map(({ debt, inst, overdue }) => {
      const idx = debt.inst.indexOf(inst);
      const auto = C.isBank(debt);
      return `<div class="item"><div class="em">${debt.emoji || '💳'}</div>
      <div class="grow"><div class="t ellipsis">${esc(debt.name)}</div><div class="s ${overdue ? 'bad' : ''}">${dateLabel(inst.due)}${overdue ? ' • lewat' : ` • ${daysBetween(TODAY, inst.due)} hari lagi`}${auto ? ' • dipotong dari tukin' : ''}</div></div>
      <div class="right"><div class="amt num">${rpShort(inst.amount)}</div>${auto ? '' : `<button class="btn sm good" data-act="pay" data-debt="${debt.id}" data-idx="${idx}">Bayar</button>`}</div></div>`;
    }).join('') : '<div class="muted small">Aman, tidak ada tagihan dalam 10 hari. 👌</div>'}</div>
  </div>
  <div class="card">
    <h2>🧾 Transaksi terakhir <span class="sp"></span><a class="link" href="#rekap">rekap</a></h2>
    <div class="list">${recent.length ? recent.map(txItem).join('') : '<div class="muted small">Belum ada transaksi. Ketuk tombol + untuk mulai mencatat.</div>'}</div>
  </div>`;
}

function txItem(t) {
  const c = cat(t.cat);
  return `<div class="item clickable" data-act="tx" data-id="${t.id}"><div class="em">${c.emoji}</div>
  <div class="grow"><div class="t ellipsis">${esc(t.note || c.name)}</div><div class="s">${dateLabel(t.date)} • ${esc(c.name)}${t.fromGoal ? ' • dari kantong' : ''}</div></div>
  <div class="amt num ${t.type === 'in' ? 'good' : ''}">${t.type === 'in' ? '+' : '−'}${rpShort(t.amount)}</div></div>`;
}

function pageUtang() {
  const s = S();
  const proj = C.project(s, NOW);
  const b = bank();
  const active = s.debts.filter((d) => !d.closed);
  const totalSisa = active.reduce((a, d) => a + (C.isBank(d) ? C.bankInfo(d).sisaPokok : C.debtRemaining(d)), 0);
  const pinjol = s.debts.filter((d) => (d.kind === 'pinjol' || d.kind === 'kartu'));
  const pinjolSisa = pinjol.reduce((a, d) => a + C.debtRemaining(d), 0);
  const groups = [
    ['Pinjol & kartu kredit', pinjol],
    ['Keluarga', s.debts.filter((d) => d.kind === 'keluarga')],
    ['Lainnya', s.debts.filter((d) => !C.isBank(d) && !['pinjol', 'kartu', 'keluarga'].includes(d.kind))],
  ];
  let bankCard = '';
  if (b) {
    const info = C.bankInfo(b);
    const paid = b.inst.filter((i) => i.paid).length;
    bankCard = `<div class="card">
      <h2>${b.emoji} ${esc(b.name)} <span class="sp"></span>${b.closed ? '<span class="pill good">LUNAS</span>' : `<span class="pill info">cicilan ${paid}/${b.bank.tenor}</span>`}</h2>
      ${b.closed ? '<div class="good">Pinjaman bank sudah lunas. 🎉</div>' : `
      <div class="grid2" style="margin-bottom:10px">
        <div class="stat"><div class="k">Sisa pokok</div><div class="v num">${rpShort(info.sisaPokok)}</div></div>
        <div class="stat"><div class="k">Pelunasan bulan ini</div><div class="v num">${rpShort(info.pelunasan)}</div></div>
        <div class="stat"><div class="k">Bunga (flat)</div><div class="v">${(info.bungaFlatTahun * 100).toFixed(2)}%<span class="small muted">/thn</span></div></div>
        <div class="stat"><div class="k">Proyeksi lunas</div><div class="v">${proj.payoff ? ymLabel(proj.payoff.m, true) : '—'}</div></div>
      </div>
      ${bar(info.paidCount / b.bank.tenor)}
      <p class="small muted">Cicilan ${rp(b.bank.cicilan)} = pokok ${rp(info.pokok)} + bunga ${rp(info.bunga)}. Kalau jalan penuh, total bunganya ${rp(info.totalBungaPenuh)}. Lunas sekarang menghemat bunga ±${rp(info.hematBunga)}.${proj.payoff ? ` Proyeksi: lunas ${ymLabel(proj.payoff.m)} setelah cicilan ke-${proj.payoff.n}, bayar ±${rp(proj.payoff.amount)}.` : ''}</p>
      <div class="btns"><button class="btn sm" data-act="payoff" data-debt="${b.id}">Lunasi sekarang</button><button class="btn sm ghost" data-act="debt" data-debt="${b.id}">Jadwal cicilan</button><a class="btn sm ghost" href="#proyeksi" style="text-decoration:none">Simulasi</a></div>`}
    </div>`;
  }
  return `
  <div class="card">
    <div class="muted small">Total sisa utang</div>
    <div class="big-number num">${rp(totalSisa)}</div>
    <div class="small muted">${active.length} utang aktif • sudah dibayar ${rp(s.debts.reduce((a, d) => a + C.debtPaid(d), 0))}</div>
  </div>
  ${bankCard}
  ${pinjolSisa > 0 ? `<div class="alert info"><span class="ic">💡</span><div>Sisa pinjol & kartu kredit <b>${rp(pinjolSisa)}</b>. Saranku lunasi sekaligus dari sisa pencairan bank, karena banyak jatuh tempo tanggal 12 sementara tukin baru cair tanggal 10–15.<div style="margin-top:8px"><button class="btn sm" data-act="payall">Lunasi semua pinjol & kartu</button></div></div></div>` : ''}
  ${groups.filter(([, l]) => l.length).map(([title, list]) => `
    <div class="card"><h2>${title}</h2><div class="list">${list.map((d) => {
      const n = C.nextInst(d);
      const tot = C.debtTotal(d), sisa = C.debtRemaining(d);
      return `<div class="item clickable" data-act="debt" data-debt="${d.id}"><div class="em">${d.emoji || '💳'}</div>
        <div class="grow"><div class="row"><div class="t grow ellipsis">${esc(d.name)}</div><div class="amt num">${d.closed ? '<span class="pill good">LUNAS</span>' : rpShort(sisa)}</div></div>
        <div class="s">${d.closed ? 'Selesai' : n ? `Berikutnya ${dateLabel(n.due)} • ${rpShort(n.amount)}` : ''}</div>
        <div style="margin-top:6px">${bar(tot ? 1 - sisa / tot : 1, d.closed ? 'good' : '')}</div></div></div>`;
    }).join('')}</div></div>`).join('')}
  <button class="btn ghost block" data-act="adddebt">+ Tambah utang</button>`;
}

function openDebt(id) {
  const s = S();
  const d = s.debts.find((x) => x.id === id);
  const isB = C.isBank(d);
  openSheet(`
    <h3>${d.emoji || '💳'} ${esc(d.name)}</h3>
    ${d.note ? `<p class="small muted">${esc(d.note)}</p>` : ''}
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><div class="k">Sisa</div><div class="v num">${rpShort(isB ? C.bankInfo(d).sisaPokok : C.debtRemaining(d))}</div></div>
      <div class="stat"><div class="k">Sudah dibayar</div><div class="v num">${rpShort(C.debtPaid(d))}</div></div>
    </div>
    <div class="list" style="max-height:45vh;overflow:auto">${d.inst.map((i, k) => `
      <div class="item"><button class="check ${i.paid ? 'on' : ''}" data-pay="${k}">${i.paid ? '✓' : ''}</button>
      <div class="grow"><div class="t">Cicilan ${k + 1}</div><div class="s ${!i.paid && i.due < TODAY ? 'bad' : ''}">${dateLabel(i.due)}</div></div>
      <div class="amt num">${rp(i.amount)}</div></div>`).join('')}</div>
    <div class="btns" style="margin-top:12px">
      ${d.closed ? '' : `<button class="btn" data-off>Lunasi sisa</button>`}
      <button class="btn ghost" data-edit>Ubah</button>
      <button class="btn ghost" data-addi>+ Cicilan</button>
    </div>`, (sh) => {
    sh.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => { closeSheet(); payInst(d.id, Number(b.dataset.pay)); openDebt(d.id); }));
    sh.querySelector('[data-off]')?.addEventListener('click', () => payOffDebt(d.id));
    sh.querySelector('[data-addi]').onclick = () => openForm({
      title: 'Tambah cicilan', fields: [
        { key: 'due', label: 'Jatuh tempo', type: 'date', value: TODAY },
        { key: 'amount', label: 'Jumlah', type: 'money' },
      ],
      onSave: (v) => update(() => { d.inst.push({ due: v.due, amount: v.amount, paid: null }); d.inst.sort((a, b) => (a.due < b.due ? -1 : 1)); d.closed = false; }),
    });
    sh.querySelector('[data-edit]').onclick = () => openForm({
      title: 'Ubah utang', fields: [
        { key: 'name', label: 'Nama', value: d.name },
        { key: 'emoji', label: 'Emoji', value: d.emoji },
        { key: 'kind', label: 'Jenis', type: 'select', value: d.kind, options: kindOptions },
        { key: 'note', label: 'Catatan', type: 'textarea', value: d.note || '' },
        ...(isB ? [{ key: 'danaBeku', label: 'Dana beku (mengurangi pelunasan)', type: 'money', value: d.bank.danaBeku }] : []),
      ],
      onSave: (v) => update(() => { Object.assign(d, { name: v.name, emoji: v.emoji, kind: v.kind, note: v.note }); if (isB) d.bank.danaBeku = v.danaBeku; }),
      onDelete: () => update(() => { s.debts = s.debts.filter((x) => x !== d); }),
    });
  });
}

const kindOptions = [
  { value: 'pinjol', label: 'Pinjol / paylater' }, { value: 'kartu', label: 'Kartu kredit' },
  { value: 'keluarga', label: 'Keluarga' }, { value: 'bank', label: 'Bank' }, { value: 'lain', label: 'Lainnya' },
];

function addDebt() {
  openForm({
    title: 'Tambah utang',
    fields: [
      { key: 'name', label: 'Nama', placeholder: 'misal: Shopee PayLater' },
      { key: 'emoji', label: 'Emoji', value: '💳' },
      { key: 'kind', label: 'Jenis', type: 'select', value: 'pinjol', options: kindOptions.filter((k) => k.value !== 'bank') },
      { key: 'amount', label: 'Cicilan per bulan', type: 'money' },
      { key: 'count', label: 'Jumlah cicilan tersisa', type: 'number', value: 1 },
      { key: 'first', label: 'Jatuh tempo pertama', type: 'date', value: TODAY },
      { key: 'note', label: 'Catatan', type: 'textarea' },
    ],
    onSave: (v) => {
      if (!v.name || !v.amount) return false;
      const inst = Array.from({ length: Math.max(1, v.count || 1) }, (_, i) => ({ due: ymAdd(v.first.slice(0, 7), i) + v.first.slice(7), amount: v.amount, paid: null }));
      update((s) => s.debts.push({ id: uid(), name: v.name, emoji: v.emoji, kind: v.kind, note: v.note, inst }));
    },
  });
}

function pageTarget() {
  const s = S();
  const proj = C.project(s, NOW);
  const bebas = C.saldoBebas(s);
  const b = bank();
  return `
  <div class="card"><div class="row"><div class="grow"><div class="muted small">Saldo bebas (belum dialokasikan)</div><div class="big-number num ${bebas < 0 ? 'bad' : ''}">${rp(bebas)}</div></div><div class="right small muted">Di kantong<br><b class="num" style="color:var(--text)">${rp(C.totalKantong(s))}</b></div></div>
  <p class="tiny muted" style="margin:8px 0 0">Kantong itu alokasi: uangnya tetap di saldo, hanya "dipesan" untuk tujuan tertentu supaya tidak terpakai.</p></div>
  ${s.goals.map((g) => {
    let target = g.target, est = null, sub = '';
    if (g.kind === 'payoff' && b) {
      target = b.closed ? 0 : C.bankInfo(b).pelunasan;
      est = proj.payoff?.m;
      sub = b.closed ? 'Bank sudah lunas 🎉' : `Target = biaya pelunasan bulan ini (turun tiap bulan). Proyeksi lunas ${est ? ymLabel(est) : '—'}.`;
    } else if (g.kind === 'nikah') {
      est = proj.weddingHit;
      sub = `Proyeksi tercapai: <b>${est ? ymLabel(est) : 'belum tercapai sebelum ' + ymLabel(s.settings.horizon)}</b>${est && age(est) != null ? ` (umur ${age(est)})` : ''}. Dihitung setelah bank lunas.`;
    }
    const p = target ? Math.min(1, (g.saved || 0) / target) : 1;
    const months = g.deadline ? Math.max(1, ymDiff(CUR, g.deadline) + 1) : null;
    const need = target > g.saved && months ? (target - g.saved) / months : 0;
    return `<div class="card">
      <h2>${g.emoji} ${esc(g.name)} <span class="sp"></span><button class="link" data-act="editgoal" data-id="${g.id}">ubah</button></h2>
      <div class="row" style="margin-bottom:6px"><div class="grow num"><b>${rp(g.saved || 0)}</b> <span class="muted">/ ${rp(target)}</span></div><span class="pill ${p >= 1 ? 'good' : 'info'}">${pct(p)}</span></div>
      ${bar(p, p >= 1 ? 'good' : '')}
      <div class="small muted" style="margin-top:8px">${g.deadline ? `Tenggat ${ymLabel(g.deadline)}` : ''}${need ? ` • perlu ±${rp(need)}/bulan` : ''}</div>
      ${sub ? `<div class="small" style="margin-top:4px">${sub}</div>` : ''}
      <div class="btns" style="margin-top:10px"><button class="btn sm" data-act="goal+" data-id="${g.id}">+ Sisihkan</button><button class="btn sm ghost" data-act="goal-" data-id="${g.id}">− Ambil</button></div>
    </div>`;
  }).join('')}
  <button class="btn ghost block" data-act="addgoal">+ Tambah kantong</button>`;
}

function editGoal(id) {
  const s = S();
  const g = id ? s.goals.find((x) => x.id === id) : null;
  openForm({
    title: g ? 'Ubah kantong' : 'Kantong baru',
    fields: [
      { key: 'name', label: 'Nama', value: g?.name || '' },
      { key: 'emoji', label: 'Emoji', value: g?.emoji || '🎯' },
      ...(g?.kind === 'payoff' ? [] : [{ key: 'target', label: 'Target', type: 'money', value: g?.target || '' }]),
      { key: 'deadline', label: 'Tenggat', type: 'month', value: g?.deadline || ymAdd(CUR, 6) },
    ],
    onSave: (v) => update(() => {
      if (g) { Object.assign(g, v); if (g.kind === 'nikah') { s.settings.wedding.target = g.target; s.settings.wedding.deadline = g.deadline; } }
      else s.goals.push({ id: uid(), saved: 0, kind: 'custom', ...v });
    }),
    onDelete: g && !['payoff', 'nikah'].includes(g.kind) ? () => update(() => { s.goals = s.goals.filter((x) => x !== g); }) : null,
  });
}

function pageProyeksi() {
  const s = S();
  const base = C.project(s, NOW);
  const hasSim = sim.pacar != null || sim.rokokCut || sim.modif || sim.extraMonthly;
  const alt = hasSim ? C.project(s, NOW, sim) : null;
  const P = alt || base;
  const b = bank();
  const w = s.settings.wedding;
  const pacarNow = C.pacarMonthly(s.settings.mode);
  const simPacar = sim.pacar ?? (s.settings.mode.type === 'pacar' ? pacarNow : 0);
  const delta = (a, bb) => {
    if (!a || !bb) return '';
    const d = ymDiff(bb, a);
    return d === 0 ? '<span class="pill">sama</span>' : `<span class="pill ${d < 0 ? 'good' : 'bad'}">${d < 0 ? '' : '+'}${d} bln</span>`;
  };
  const deadlineOk = P.weddingHit && P.weddingHit <= w.deadline;

  // tabel pelunasan
  const payRows = P.rows.filter((r) => r.bankOpen || r.ev.includes('lunas')).slice(0, 48);

  return `
  <div class="grid2">
    <div class="card" style="margin:0"><div class="muted small">🏦 Bank lunas</div><div class="big-number">${P.payoff ? ymLabel(P.payoff.m, true) : '—'}</div>
      <div class="small muted">${P.payoff ? `cicilan ke-${P.payoff.n} • ${rpShort(P.payoff.amount)}` : 'tidak ada / belum'} ${alt ? delta(alt.payoff?.m, base.payoff?.m) : ''}</div></div>
    <div class="card" style="margin:0"><div class="muted small">💍 ${rpShort(w.target)} tercapai</div><div class="big-number ${deadlineOk ? '' : 'bad'}">${P.weddingHit ? ymLabel(P.weddingHit, true) : 'belum'}</div>
      <div class="small muted">${P.weddingHit && age(P.weddingHit) != null ? `umur ${age(P.weddingHit)} • ` : ''}tenggat ${ymLabel(w.deadline, true)} ${alt ? delta(alt.weddingHit, base.weddingHit) : ''}</div></div>
  </div>
  <div style="height:12px"></div>
  <div class="card">
    <h2>📈 Proyeksi saldo ${alt ? '<span class="pill info">simulasi</span>' : ''}</h2>
    ${lineChart(P.rows, { compare: alt ? base.rows : null, target: w.target })}
    <div class="legend"><span><i style="background:#5b8cff"></i>${alt ? 'Simulasi' : 'Rencana sekarang'}</span>${alt ? '<span><i style="background:#8d97b8"></i>Rencana sekarang</span>' : ''}<span><i style="background:#f472b6"></i>Target nikah</span></div>
    <p class="small muted">Saldo terendah ${rp(P.minCash.cash)} (${ymLabel(P.minCash.m, true)}). Strategi: cicilan bank jalan normal, uang lebih dikumpulkan, lalu bank dilunasi sekaligus begitu cukup dan masih tersisa dana darurat ${rpShort(s.settings.bufferMin)}.</p>
  </div>
  <div class="card">
    <h2>🧪 Simulator "kalau..." <span class="sp"></span>${hasSim ? '<button class="link" data-act="simreset">reset</button>' : ''}</h2>
    ${slider('pacar', '💑 Budget pacaran per bulan', simPacar, 0, 3000000, 100000, (v) => (v ? rp(v) : 'solitude'))}
    <div class="chips" style="margin:-4px 0 12px">${[[0, 'Solitude'], [500000, 'Hemat 500rb'], [1000000, 'Sedang 1jt'], [1500000, 'Royal 1,5jt']].map(([v, l]) => `<button class="chip ${simPacar === v ? 'on' : ''}" data-act="simset" data-k="pacar" data-v="${v}">${l}</button>`).join('')}</div>
    ${slider('rokokCut', '🚬 Kurangi rokok', sim.rokokCut, 0, 1, 0.1, (v) => (v ? `${Math.round(v * 100)}% (hemat ${rpShort((s.budgets.rokok || 0) * v)}/bln)` : 'tidak'))}
    ${slider('modif', '🛠️ Modif mobil bulan ini', sim.modif, 0, 25000000, 1000000, (v) => (v ? rp(v) : 'tidak'))}
    ${slider('extraMonthly', '💪 Hemat tambahan per bulan', sim.extraMonthly, 0, 2000000, 100000, (v) => (v ? rp(v) : 'tidak'))}
    ${alt ? `<div class="alert ${alt.firstNegative ? 'bad' : alt.weddingHit && alt.weddingHit <= w.deadline ? 'good' : 'warn'}"><span class="ic">${alt.firstNegative ? '⚠️' : '🔮'}</span><div>
      Bank lunas <b>${alt.payoff ? ymLabel(alt.payoff.m) : '—'}</b> ${delta(alt.payoff?.m, base.payoff?.m)} • dana nikah <b>${alt.weddingHit ? ymLabel(alt.weddingHit) : 'belum tercapai'}</b> ${delta(alt.weddingHit, base.weddingHit)}
      ${alt.firstNegative ? `<br>Saldo minus di ${ymLabel(alt.firstNegative)}!` : `<br>Saldo terendah ${rp(alt.minCash.cash)}.`}</div></div>
      ${sim.pacar != null ? `<button class="btn sm" data-act="applypacar">Terapkan budget pacaran ini ke mode</button>` : ''}` : '<p class="tiny muted">Geser untuk melihat efeknya ke tanggal lunas dan dana nikah.</p>'}
  </div>
  ${b && !b.closed ? `<div class="card">
    <h2>🏦 Kalau lunas bulan X, butuh berapa?</h2>
    <div class="scroll-x" style="max-height:340px;overflow:auto"><table class="tbl num"><thead><tr><th>Bulan</th><th>Cicilan ke</th><th>Biaya lunas</th><th>Proyeksi saldo</th><th></th></tr></thead><tbody>
    ${payRows.map((r) => {
      const paidN = b.inst.filter((i) => i.paid).length + P.rows.slice(0, P.rows.indexOf(r) + 1).reduce((a, x) => a + (b.inst.some((i) => !i.paid && i.due.slice(0, 7) === x.m) ? 1 : 0), 0);
      const cost = r.ev.includes('lunas') ? P.payoff.amount : r.pelunasan;
      const ok = r.ev.includes('lunas') || r.cash - cost >= s.settings.bufferMin;
      return `<tr class="${r.ev.includes('lunas') ? 'hl' : ''}"><td>${ymLabel(r.m, true)}</td><td>${paidN}</td><td>${rpShort(cost)}</td><td>${rpShort(r.ev.includes('lunas') ? r.cash + cost : r.cash)}</td><td>${ok ? '✅' : ''}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    <p class="tiny muted">Biaya lunas = sisa pokok + 1x bunga − dana beku. Pelunasan sebagian tidak mengurangi bunga flat, jadi lebih baik dikumpulkan lalu dilunasi sekaligus.</p>
  </div>` : ''}
  <div class="card"><details><summary>Lihat tabel bulanan lengkap</summary>
    <div class="scroll-x" style="margin-top:10px"><table class="tbl num"><thead><tr><th>Bulan</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr></thead><tbody>
    ${P.rows.map((r) => `<tr class="${r.ev.length ? 'hl' : ''}"><td>${ymLabel(r.m, true)} ${r.ev.includes('lunas') ? '🏦' : ''}${r.ev.includes('nikah') ? '💍' : ''}</td><td>${rpShort(r.inc)}</td><td>${rpShort(r.out)}</td><td class="${r.cash < 0 ? 'bad' : ''}">${rpShort(r.cash)}</td></tr>`).join('')}
    </tbody></table></div></details>
    <p class="tiny muted">Asumsi: pemasukan sesuai jadwal di Pengaturan, pengeluaran sesuai anggaran per kategori, rencana pengeluaran, dan jadwal cicilan. Untuk bulan ini dihitung dari yang belum terjadi saja. Kenaikan gaji tidak dihitung.</p>
  </div>`;
}

function slider(k, label, v, min, max, step, show) {
  return `<label class="field"><div class="row small muted" style="margin-bottom:5px"><span class="grow">${label}</span><b style="color:var(--text)">${show(v)}</b></div>
  <input type="range" data-sim="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
}

function pageRekap() {
  const s = S();
  const m = rekapMonth;
  const sum = C.monthSummary(s, m);
  const spent = C.regularSpent(s, m);
  const txs = C.txInMonth(s, m).sort((a, b) => (a.date < b.date ? 1 : -1));
  const cats = [...new Set([...Object.keys(s.budgets).filter((c) => s.budgets[c]), ...Object.keys(sum.byCat), ...(s.settings.mode.type === 'pacar' ? ['pacar'] : [])])];
  const trend = Array.from({ length: 6 }, (_, i) => ymAdd(m, i - 5)).map((mm) => { const x = C.monthSummary(s, mm); return { label: ymLabel(mm, true).split(' ')[0], a: x.inOp, b: x.outOp }; });
  const prev = C.monthSummary(s, ymAdd(m, -1));
  const rokok = sum.byCat.rokok || 0;
  const insights = [];
  if (rokok) insights.push(`🚬 Rokok bulan ini ${rp(rokok)}. Kalau segini terus, setahun ${rp(rokok * 12)}, setara ${pct((rokok * 12) / s.settings.wedding.target)} target dana nikah.`);
  const top = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1])[0];
  if (top) insights.push(`${cat(top[0]).emoji} Pengeluaran terbesar: ${esc(cat(top[0]).name)} ${rp(top[1])} (${pct(top[1] / (sum.outOp || 1))}).`);
  if (prev.outOp && sum.outOp) {
    const d = (sum.outOp - prev.outOp) / prev.outOp;
    insights.push(`${d > 0 ? '📈' : '📉'} Pengeluaran rutin ${d > 0 ? 'naik' : 'turun'} ${pct(Math.abs(d))} dibanding bulan lalu.`);
  }
  if (sum.inOp) insights.push(sum.dsr > 0.35 ? `💳 Rasio cicilan ${pct(sum.dsr)} dari pemasukan, di atas batas aman 30–35%.` : `💳 Rasio cicilan ${pct(sum.dsr)} dari pemasukan, masih aman (≤ 35%).`);

  return `
  <div class="card row" style="padding:10px 12px"><button class="icon-btn" data-act="rm" data-d="-1">‹</button><div class="grow" style="text-align:center;font-weight:700">${ymLabel(m)}</div><button class="icon-btn" data-act="rm" data-d="1">›</button></div>
  <div class="grid2">
    <div class="stat"><div class="k">Pemasukan rutin</div><div class="v num good">${rpShort(sum.inOp)}</div></div>
    <div class="stat"><div class="k">Pengeluaran rutin</div><div class="v num">${rpShort(sum.outOp)}</div></div>
    <div class="stat"><div class="k">Sisa</div><div class="v num ${sum.sisa < 0 ? 'bad' : ''}">${rpShort(sum.sisa)}</div></div>
    <div class="stat"><div class="k">Rasio nabung</div><div class="v ${sum.savingRate >= 0.2 ? 'good' : sum.savingRate < 0 ? 'bad' : 'warn'}">${sum.inOp ? pct(sum.savingRate) : '—'}</div></div>
  </div>
  <div style="height:12px"></div>
  ${sum.inBig || sum.outBig ? `<div class="alert info"><span class="ic">🏦</span><div>Transaksi besar non-rutin (tidak dihitung di performa): masuk ${rp(sum.inBig)}, keluar ${rp(sum.outBig)}.</div></div>` : ''}
  ${insights.length ? `<div class="card"><h2>💡 Insight</h2>${insights.map((t) => `<p class="small" style="margin:6px 0">${t}</p>`).join('')}</div>` : ''}
  <div class="card"><h2>📊 Anggaran vs pengeluaran</h2>
    ${cats.length ? cats.map((c) => {
      const bud = C.budgetFor(s, c, m), sp = spent[c] || 0, allSp = sum.byCat[c] || 0;
      const p = bud ? sp / bud : 0;
      return `<div style="margin-bottom:12px"><div class="row small"><span class="grow">${cat(c).emoji} ${esc(cat(c).name)}</span><span class="num"><b>${rpShort(sp)}</b>${bud ? ` / ${rpShort(bud)}` : ''}</span></div>
      ${bud ? bar(p, p > 1 ? 'bad' : p > 0.8 ? 'warn' : 'good') : ''}${allSp > sp ? `<div class="tiny muted">+ ${rpShort(allSp - sp)} dari rencana/cicilan</div>` : ''}</div>`;
    }).join('') : '<div class="muted small">Belum ada data.</div>'}
  </div>
  <div class="card"><h2>📉 Tren 6 bulan</h2>${barsChart(trend)}</div>
  <div class="card"><h2>🧾 Transaksi (${txs.length}) <span class="sp"></span><button class="link" data-act="csv">Ekspor Excel</button></h2>
    <div class="list">${txs.length ? txs.map(txItem).join('') : '<div class="muted small">Belum ada transaksi bulan ini.</div>'}</div></div>`;
}

function openTx(id) {
  const s = S();
  const t = s.tx.find((x) => x.id === id);
  const linked = !!t.ref;
  openForm({
    title: 'Transaksi',
    intro: linked ? '<p class="small muted">Transaksi ini tertaut ke checklist/cicilan/rencana. Kalau dihapus, centangnya ikut batal.</p>' : '',
    fields: [
      { key: 'amount', label: 'Jumlah', type: 'money', value: t.amount, big: true },
      { key: 'cat', label: 'Kategori', type: 'select', options: catOptions(t.type), value: t.cat },
      { key: 'note', label: 'Catatan', value: t.note },
      { key: 'date', label: 'Tanggal', type: 'date', value: t.date },
    ],
    onSave: (v) => update(() => Object.assign(t, v)),
    onDelete: () => update(() => removeTx(id)),
  });
}

function pageAtur() {
  const s = S();
  const st = s.settings;
  const mode = st.mode;
  const years = Array.from({ length: 6 }, (_, i) => Number(CUR.slice(0, 4)) + i);
  return `
  <div class="card"><h2>${mode.type === 'pacar' ? '💑' : '🧘'} Mode hidup</h2>
    <div class="seg"><button data-act="setmode" data-v="solitude" class="${mode.type === 'solitude' ? 'on' : ''}">🧘 Solitude</button><button data-act="setmode" data-v="pacar" class="${mode.type === 'pacar' ? 'on' : ''}">💑 Pacar</button></div>
    <p class="small muted">${mode.type === 'pacar' ? `Budget pacaran ${rp(C.pacarMonthly(mode))}/bulan mulai ${ymLabel(mode.start)}. Semua proyeksi ikut dihitung ulang.` : 'Belum ada budget pacaran. Kalau nanti punya pacar, ganti ke mode Pacar dan semua proyeksi langsung dihitung ulang.'}</p>
    <button class="btn sm ghost" data-act="mode">Atur budget pacaran</button></div>

  <div class="card"><h2>⚙️ Umum</h2><div class="list">
    ${setRow('startSaldo', 'Saldo awal', rp(st.startSaldo), 'Uang yang kamu pegang saat mulai mencatat')}
    ${setRow('bufferMin', 'Dana darurat minimal', rp(st.bufferMin), 'Saldo yang selalu disisakan saat melunasi bank')}
    ${setRow('wedding', 'Target dana nikah', `${rp(st.wedding.target)} • ${ymLabel(st.wedding.deadline, true)}`, 'Dihitung setelah bank lunas')}
    ${setRow('birth', 'Bulan lahir', st.birth ? ymLabel(st.birth) : '—', 'Untuk menampilkan umur di proyeksi')}
    ${setRow('horizon', 'Proyeksi sampai', ymLabel(st.horizon), '')}
  </div></div>

  <div class="card"><h2>🎁 Bulan cair THR / gaji 13</h2><p class="small muted" style="margin-top:0">Cair sebelum Lebaran, dan Lebaran maju sekitar 11 hari tiap tahun.</p>
    <div class="grid3">${years.map((y) => `<label class="field" style="margin:0"><span>${y}</span><select data-thr="${y}"><option value="">—</option>${monthOptions().map((o) => `<option value="${o.value}" ${Number(st.thrMonths[y]) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>`).join('')}</div></div>

  <div class="card"><h2>💼 Pemasukan terjadwal <span class="sp"></span><button class="link" data-act="income-edit">+ tambah</button></h2><div class="list">
    ${s.incomes.map((i) => `<div class="item clickable" data-act="income-edit" data-id="${i.id}"><div class="em">${cat(i.cat).emoji}</div><div class="grow"><div class="t ellipsis">${esc(i.name)}</div><div class="s">${{ monthly: 'Tiap bulan', yearly: 'Tiap ' + (BULAN[i.month - 1] || ''), thr: 'Sebelum Lebaran', once: 'Sekali ' + ymLabel(i.date, true) }[i.kind]} ${dayRange(i)}${i.deductBank ? ' • potong cicilan bank' : ''}</div></div><div class="amt num">${rpShort(i.amount)}</div></div>`).join('')}
  </div></div>

  <div class="card"><h2>📊 Anggaran bulanan</h2><p class="small muted" style="margin-top:0">Dipakai untuk peringatan dan proyeksi. Total ${rp(Object.values(s.budgets).reduce((a, b) => a + (b || 0), 0))}/bulan.</p><div class="list">
    ${s.categories.filter((c) => c.id !== 'pacar' && c.id !== 'cicilan').map((c) => `<div class="item clickable" data-act="budget" data-id="${c.id}"><div class="em">${c.emoji}</div><div class="grow t">${esc(c.name)}</div><div class="amt num ${s.budgets[c.id] ? '' : 'muted'}">${s.budgets[c.id] ? rp(s.budgets[c.id]) : '—'}</div></div>`).join('')}
  </div></div>

  <div class="card"><h2>🗓️ Rencana pengeluaran <span class="sp"></span><button class="link" data-act="plan-edit">+ tambah</button></h2><div class="list">
    ${s.plans.map((p) => `<div class="item clickable" data-act="plan-edit" data-id="${p.id}"><div class="em">${cat(p.cat).emoji}</div><div class="grow"><div class="t ellipsis">${esc(p.name)}</div><div class="s">${p.every ? `Tiap ${p.every} bulan mulai ${ymLabel(p.month, true)}` : ymLabel(p.month)}</div></div><div class="amt num">${rpShort(p.amount)}</div></div>`).join('')}
  </div></div>

  <div class="card"><h2>⚡ Tombol catat cepat <span class="sp"></span><button class="link" data-act="quick-edit">+ tambah</button></h2><div class="list">
    ${[...s.quick].sort((a, b) => (b.count || 0) - (a.count || 0)).map((q) => `<div class="item clickable" data-act="quick-edit" data-id="${q.id}"><div class="em">${q.emoji}</div><div class="grow"><div class="t">${esc(q.name)}</div><div class="s">${esc(cat(q.cat).name)} • dipakai ${q.count || 0}x${q.ask ? ' • tanya nominal' : ''}</div></div><div class="amt num">${rpShort(q.price)}</div></div>`).join('')}
  </div></div>

  <div class="card"><h2>💾 Data</h2>
    <p class="small muted" style="margin-top:0">Semua data hanya tersimpan di HP ini. Kalau aplikasi dihapus atau ganti HP, data hilang, jadi rutinlah backup (simpan filenya di Google Drive atau WhatsApp ke diri sendiri).</p>
    <div class="btns"><button class="btn sm" data-act="backup">Backup (unduh file)</button><button class="btn sm ghost" data-act="restore">Pulihkan dari file</button><button class="btn sm ghost" data-act="csv">Ekspor Excel (CSV)</button></div>
    <hr class="sep"><button class="btn sm danger" data-act="wipe">Hapus semua data</button>
    <p class="tiny muted">Terakhir backup: ${localStorage.getItem('dompetku:lastBackup') ? dateLabel(localStorage.getItem('dompetku:lastBackup').slice(0, 10)) : 'belum pernah'}</p>
  </div>
  <p class="tiny muted" style="text-align:center">Dompet-ku • data lokal, offline</p>`;
}
const setRow = (k, t, v, s) => `<div class="item clickable" data-act="set" data-k="${k}"><div class="grow"><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div><div class="amt small">${v}</div></div>`;

function editSetting(k) {
  const s = S(), st = s.settings;
  const forms = {
    startSaldo: [{ key: 'v', label: 'Saldo awal', type: 'money', value: st.startSaldo }],
    bufferMin: [{ key: 'v', label: 'Dana darurat minimal', type: 'money', value: st.bufferMin }],
    birth: [{ key: 'v', label: 'Bulan lahir', type: 'month', value: st.birth || '' }],
    horizon: [{ key: 'v', label: 'Proyeksi sampai', type: 'month', value: st.horizon }],
    wedding: [{ key: 'target', label: 'Target dana nikah', type: 'money', value: st.wedding.target }, { key: 'deadline', label: 'Tenggat', type: 'month', value: st.wedding.deadline }],
  };
  openForm({
    title: 'Pengaturan', fields: forms[k],
    onSave: (v) => update(() => {
      if (k === 'wedding') { st.wedding = { ...v }; const g = s.goals.find((x) => x.kind === 'nikah'); if (g) Object.assign(g, v); }
      else st[k] = v.v;
    }),
  });
}

function editMode() {
  const s = S(), mode = s.settings.mode;
  openForm({
    title: '💑 Budget pacaran',
    intro: '<p class="small muted">Patokan: hemat ±100rb/ketemu (ngopi, makan sederhana), sedang ±200rb (makan + nonton), royal ±300rb+. Ekstra = ulang tahun, anniversary, hadiah, dirata-rata per bulan.</p>',
    fields: [
      { key: 'type', label: 'Mode', type: 'select', value: mode.type, options: [{ value: 'solitude', label: '🧘 Solitude (belum ada pacar)' }, { value: 'pacar', label: '💑 Pacar' }] },
      { key: 'start', label: 'Mulai bulan', type: 'month', value: mode.start },
      { key: 'perMeet', label: 'Biaya per ketemu', type: 'money', value: mode.perMeet },
      { key: 'meetsPerMonth', label: 'Ketemu berapa kali per bulan', type: 'number', value: mode.meetsPerMonth },
      { key: 'extra', label: 'Ekstra per bulan (hadiah, ultah)', type: 'money', value: mode.extra },
    ],
    onSave: (v) => update(() => { s.settings.mode = { ...mode, ...v }; }),
  });
}

function editIncome(id) {
  const s = S();
  const i = id ? s.incomes.find((x) => x.id === id) : null;
  openForm({
    title: i ? 'Ubah pemasukan' : 'Pemasukan baru',
    intro: i?.mult ? '<p class="small muted">Catatan: bulan Januari hanya 50% (sisa tukin Desember).</p>' : '',
    fields: [
      { key: 'name', label: 'Nama', value: i?.name || '' },
      { key: 'cat', label: 'Kategori', type: 'select', options: catOptions('in'), value: i?.cat || 'masuk_lain' },
      { key: 'amount', label: 'Jumlah', type: 'money', value: i?.amount || '' },
      { key: 'kind', label: 'Jadwal', type: 'select', value: i?.kind || 'monthly', options: [{ value: 'monthly', label: 'Tiap bulan' }, { value: 'yearly', label: 'Setahun sekali' }, { value: 'thr', label: 'THR (bulan diatur per tahun)' }, { value: 'once', label: 'Sekali saja' }] },
      { key: 'month', label: 'Bulan (kalau setahun sekali)', type: 'select', options: monthOptions(), value: i?.month || 7 },
      { key: 'date', label: 'Bulan (kalau sekali saja)', type: 'month', value: i?.date || CUR },
      { key: 'dayFrom', label: 'Biasanya cair dari tanggal', type: 'number', value: i?.dayFrom || 1 },
      { key: 'dayTo', label: 'sampai tanggal', type: 'number', value: i?.dayTo || '' },
      { key: 'deductBank', label: 'Cicilan bank dipotong dari pemasukan ini', type: 'check', value: !!i?.deductBank },
      { key: 'note', label: 'Catatan', type: 'textarea', value: i?.note || '' },
    ],
    onSave: (v) => update(() => {
      v.month = Number(v.month);
      if (i) Object.assign(i, v); else s.incomes.push({ id: uid(), from: CUR, ...v });
    }),
    onDelete: i ? () => update(() => { s.incomes = s.incomes.filter((x) => x !== i); }) : null,
  });
}

function editPlan(id) {
  const s = S();
  const p = id ? s.plans.find((x) => x.id === id) : null;
  openForm({
    title: p ? 'Ubah rencana' : 'Rencana pengeluaran baru',
    fields: [
      { key: 'name', label: 'Nama', value: p?.name || '', placeholder: 'misal: Modif velg' },
      { key: 'cat', label: 'Kategori', type: 'select', options: catOptions(), value: p?.cat || 'lain' },
      { key: 'amount', label: 'Perkiraan biaya', type: 'money', value: p?.amount || '' },
      { key: 'month', label: 'Bulan (mulai)', type: 'month', value: p?.month || CUR },
      { key: 'every', label: 'Berulang', type: 'select', value: p?.every || 0, options: [{ value: 0, label: 'Sekali saja' }, { value: 1, label: 'Tiap bulan' }, { value: 3, label: 'Tiap 3 bulan' }, { value: 6, label: 'Tiap 6 bulan' }, { value: 12, label: 'Tiap tahun' }] },
      { key: 'goalId', label: 'Dibayar dari kantong', type: 'select', value: p?.goalId || '', options: [{ value: '', label: '— tidak —' }, ...s.goals.map((g) => ({ value: g.id, label: g.emoji + ' ' + g.name }))] },
    ],
    onSave: (v) => update(() => { v.every = Number(v.every); if (p) Object.assign(p, v); else s.plans.push({ id: uid(), ...v }); }),
    onDelete: p ? () => update(() => { s.plans = s.plans.filter((x) => x !== p); }) : null,
  });
}

function editQuick(id) {
  const s = S();
  const q = id ? s.quick.find((x) => x.id === id) : null;
  openForm({
    title: q ? 'Ubah tombol cepat' : 'Tombol cepat baru',
    fields: [
      { key: 'name', label: 'Nama', value: q?.name || '' },
      { key: 'emoji', label: 'Emoji', value: q?.emoji || '🛒' },
      { key: 'cat', label: 'Kategori', type: 'select', options: catOptions(), value: q?.cat || 'lain' },
      { key: 'price', label: 'Harga biasa', type: 'money', value: q?.price || '' },
      { key: 'ask', label: 'Tanya nominal tiap kali (misal solar)', type: 'check', value: !!q?.ask },
    ],
    onSave: (v) => update(() => { if (q) Object.assign(q, v); else s.quick.push({ id: uid(), count: 0, ...v }); }),
    onDelete: q ? () => update(() => { s.quick = s.quick.filter((x) => x !== q); }) : null,
  });
}

function editBudget(c) {
  const s = S();
  openForm({
    title: `${cat(c).emoji} Anggaran ${cat(c).name}`,
    fields: [{ key: 'v', label: 'Per bulan', type: 'money', value: s.budgets[c] || '', big: true }],
    onSave: (v) => update(() => { if (v.v) s.budgets[c] = v.v; else delete s.budgets[c]; }),
  });
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportCSV() {
  const s = S();
  const rows = [['Tanggal', 'Jenis', 'Kategori', 'Catatan', 'Jumlah']];
  for (const t of [...s.tx].sort((a, b) => (a.date < b.date ? -1 : 1))) rows.push([t.date, t.type === 'in' ? 'Masuk' : 'Keluar', cat(t.cat).name, t.note || '', t.type === 'in' ? t.amount : -t.amount]);
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`dompet-ku-transaksi-${TODAY}.csv`, csv, 'text/csv');
}

function restore() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (store.hasData() && S().tx.length && !confirm('Data yang ada sekarang akan diganti dengan isi file. Lanjut?')) return;
      store.importJSON(text);
      toast('Data berhasil dipulihkan ✅');
      render();
    } catch (e) { alert('Gagal membaca file: ' + e.message); }
  };
  inp.click();
}

// ---------- Router & render ----------
const PAGES = {
  beranda: ['Beranda', '🏠', pageBeranda],
  utang: ['Utang', '💳', pageUtang],
  target: ['Target', '🎯', pageTarget],
  proyeksi: ['Proyeksi', '🔮', pageProyeksi],
  rekap: ['Rekap', '📊', pageRekap],
  atur: ['Pengaturan', '⚙️', pageAtur],
};

function pageWelcome() {
  return `<div class="welcome"><div class="logo">👛</div><h2>Dompet-ku</h2>
  <p class="muted">Catat gaji, tukin, dan pengeluaran, kejar pelunasan, dan pantau target dana nikah. Semua data tersimpan di HP ini saja.</p>
  <div class="btns" style="flex-direction:column;margin-top:24px">
    <button class="btn block" data-act="restore">📂 Pulihkan dari file data / backup</button>
    <button class="btn ghost block" data-act="startempty">Mulai dari kosong</button>
  </div></div>`;
}

function render() {
  const has = store.hasData();
  const page = (location.hash.slice(1) || 'beranda').split('?')[0];
  const [title, , fn] = PAGES[page] || PAGES.beranda;
  $('#title').innerHTML = has ? `${title}<small>${dateLabel(TODAY)}</small>` : 'Dompet-ku';
  $('#gear').style.display = has ? '' : 'none';
  $('nav.tabs').style.display = has ? '' : 'none';
  $('.fab').style.display = has ? '' : 'none';
  view.innerHTML = has ? fn() : pageWelcome();
  document.querySelectorAll('nav.tabs a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + page));
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = el.dataset;
  const acts = {
    income: () => checkIncome(d.key),
    plan: () => payPlan(d.key),
    quick: () => quickTap(d.id),
    catat: () => openCatat(),
    pay: () => payInst(d.debt, Number(d.idx)),
    payoff: () => payOffDebt(d.debt),
    payall: payAllPinjol,
    debt: () => openDebt(d.debt),
    adddebt: addDebt,
    tx: () => openTx(d.id),
    'goal+': () => goalMove(d.id, 1),
    'goal-': () => goalMove(d.id, -1),
    editgoal: () => editGoal(d.id),
    addgoal: () => editGoal(null),
    mode: editMode,
    setmode: () => { update((s) => { s.settings.mode.type = d.v; }); render(); if (d.v === 'pacar') editMode(); },
    set: () => editSetting(d.k),
    'income-edit': () => editIncome(d.id),
    'plan-edit': () => editPlan(d.id),
    'quick-edit': () => editQuick(d.id),
    budget: () => editBudget(d.id),
    rm: () => { rekapMonth = ymAdd(rekapMonth, Number(d.d)); render(); },
    simreset: () => { sim = { pacar: null, rokokCut: 0, modif: 0, extraMonthly: 0 }; render(); },
    simset: () => { sim[d.k] = Number(d.v); render(); },
    applypacar: () => {
      update((s) => {
        const m = s.settings.mode;
        if (sim.pacar > 0) { m.type = 'pacar'; m.perMeet = Math.round((sim.pacar - (m.extra || 0)) / Math.max(1, m.meetsPerMonth || 4)); }
        else m.type = 'solitude';
      });
      sim.pacar = null; render(); toast('Mode diperbarui');
    },
    backup: () => { download(`dompet-ku-backup-${TODAY}.json`, store.exportJSON(), 'application/json'); localStorage.setItem('dompetku:lastBackup', new Date().toISOString()); render(); },
    restore,
    csv: exportCSV,
    startempty: () => { store.startEmpty(); render(); },
    wipe: () => { if (confirm('Hapus SEMUA data? Pastikan sudah backup.') && confirm('Benar-benar hapus?')) { store.resetAll(); render(); } },
  };
  acts[d.act]?.();
});

// slider simulator: hitung ulang saat dilepas
document.addEventListener('change', (e) => {
  const k = e.target.dataset?.sim;
  if (k) { sim[k] = Number(e.target.value); const y = scrollY; render(); scrollTo(0, y); return; }
  const y = e.target.dataset?.thr;
  if (y) { update((s) => { if (e.target.value) s.settings.thrMonths[y] = Number(e.target.value); else delete s.settings.thrMonths[y]; }); toast('Bulan THR disimpan'); }
});

$('.fab').onclick = () => openCatat();
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
