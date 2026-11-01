// Grafik SVG sederhana tanpa library.
import { rpShort, ymLabel, esc } from './util.js';

export function lineChart(rows, { compare = null, target = 0, height = 220 } = {}) {
  if (!rows.length) return '';
  const W = 600, H = height, pl = 46, pr = 10, pt = 14, pb = 26;
  const all = rows.map((r) => r.cash).concat(compare ? compare.map((r) => r.cash) : [], [target, 0]);
  const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
  const x = (i) => pl + (i / Math.max(1, rows.length - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
  const path = (rs) => rs.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.cash).toFixed(1)}`).join('');
  let g = '';
  // grid
  const steps = 4;
  for (let k = 0; k <= steps; k++) {
    const v = min + ((max - min) * k) / steps;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#26325a" stroke-width="1"/>`;
    g += `<text x="${pl - 6}" y="${y(v) + 4}" fill="#8d97b8" font-size="11" text-anchor="end">${rpShort(v)}</text>`;
  }
  // label tahun
  rows.forEach((r, i) => {
    if (r.m.endsWith('-01') || (i === 0 && Number(r.m.slice(5)) <= 9)) g += `<text x="${x(i)}" y="${H - 8}" fill="#8d97b8" font-size="11" text-anchor="middle">${r.m.slice(0, 4)}</text>`;
  });
  if (min < 0) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#ef4444" stroke-dasharray="4 4"/>`;
  if (target) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(target)}" y2="${y(target)}" stroke="#f472b6" stroke-dasharray="6 5"/><text x="${W - pr}" y="${y(target) - 5}" fill="#f472b6" font-size="11" text-anchor="end">target ${rpShort(target)}</text>`;
  if (compare) g += `<path d="${path(compare)}" fill="none" stroke="#8d97b8" stroke-width="2" stroke-dasharray="5 5" opacity=".7"/>`;
  const area = path(rows) + `L${x(rows.length - 1)},${y(Math.max(min, 0))}L${x(0)},${y(Math.max(min, 0))}Z`;
  g += `<defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity=".35"/><stop offset="1" stop-color="#5b8cff" stop-opacity="0"/></linearGradient></defs>`;
  g += `<path d="${area}" fill="url(#ga)"/>`;
  g += `<path d="${path(rows)}" fill="none" stroke="#5b8cff" stroke-width="3" stroke-linejoin="round"/>`;
  rows.forEach((r, i) => {
    if (r.ev.includes('lunas')) g += marker(x(i), y(r.cash), '#22c55e', '🏦 lunas ' + ymLabel(r.m, true));
    if (r.ev.includes('nikah')) g += marker(x(i), y(r.cash), '#f472b6', '💍 ' + ymLabel(r.m, true));
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg></div>`;
}

function marker(cx, cy, color, label) {
  const anchor = cx > 420 ? 'end' : 'start';
  const dx = anchor === 'end' ? -8 : 8;
  return `<circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="#0b1020" stroke-width="2"/>
  <text x="${cx + dx}" y="${cy - 10}" fill="${color}" font-size="12" font-weight="700" text-anchor="${anchor}">${esc(label)}</text>`;
}

export function barsChart(items, { height = 160 } = {}) {
  // items: [{label, a (pemasukan), b (pengeluaran)}]
  const W = 600, H = height, pb = 22, pt = 8;
  const max = Math.max(1, ...items.flatMap((i) => [i.a, i.b]));
  const bw = (W / items.length) * 0.32;
  let g = '';
  items.forEach((it, k) => {
    const cx = (W / items.length) * (k + 0.5);
    const ha = ((H - pb - pt) * it.a) / max, hb = ((H - pb - pt) * it.b) / max;
    g += `<rect x="${cx - bw - 2}" y="${H - pb - ha}" width="${bw}" height="${ha}" rx="4" fill="#22c55e"/>`;
    g += `<rect x="${cx + 2}" y="${H - pb - hb}" width="${bw}" height="${hb}" rx="4" fill="#f59e0b"/>`;
    g += `<text x="${cx}" y="${H - 6}" fill="#8d97b8" font-size="12" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>
  <div class="legend"><span><i style="background:#22c55e"></i>Pemasukan rutin</span><span><i style="background:#f59e0b"></i>Pengeluaran rutin</span></div>`;
}
