// Helper umum: format rupiah, tanggal, id.

const fmt = new Intl.NumberFormat('id-ID');

export const rp = (n) => (n < 0 ? '-' : '') + 'Rp' + fmt.format(Math.round(Math.abs(n || 0)));

// Ringkas: 1.250.000 -> "1,25 jt"
export const rpShort = (n) => {
  const a = Math.abs(n || 0);
  const s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M';
  if (a >= 1e6) return s + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + ' rb';
  return s + Math.round(a);
};

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const pad = (n) => String(n).padStart(2, '0');

export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "YYYY-MM"
export const ym = (d = new Date()) => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);

export const ymAdd = (s, n) => {
  let [y, m] = s.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${y}-${pad(m)}`;
};

export const ymDiff = (a, b) => {
  // jumlah bulan dari a ke b
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const ymLabel = (s, short = false) => {
  if (!s) return '-';
  const [y, m] = s.split('-').map(Number);
  return (short ? BLN : BULAN)[m - 1] + ' ' + y;
};

export const dateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${BLN[m - 1]} ${y}`;
};

export const daysBetween = (aISO, bISO) => Math.round((new Date(bISO) - new Date(aISO)) / 86400000);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "1.250.000" / "1,25jt" / "450rb" -> angka
export const parseRp = (v) => {
  if (typeof v === 'number') return v;
  let s = String(v || '').toLowerCase().replace(/\s|rp/g, '');
  let mult = 1;
  if (/jt|juta$/.test(s)) { mult = 1e6; s = s.replace(/jt|juta/, ''); s = s.replace(',', '.'); }
  else if (/rb|k$/.test(s)) { mult = 1e3; s = s.replace(/rb|k/, ''); s = s.replace(',', '.'); }
  else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * mult);
};
