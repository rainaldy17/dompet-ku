# Dompet-ku 👛

Aplikasi web untuk mengatur keuangan pribadi. Bisa di-install ke layar utama HP dan jalan offline.

## Fitur
- **Checklist pemasukan**: gaji, tukin, THR/gaji 13, gaji 14. Centang saat cair, saldo langsung terupdate. Bisa cair sebagian (misalnya tukin 50% di Desember), dan cicilan bank otomatis terpotong dari tukin.
- **Catat cepat sekali ketuk**: rokok, solar, makan siang, dll. Urutannya mengikuti yang paling sering dibeli. Solar bisa diatur supaya selalu menanyakan nominal.
- **Utang**: pinjaman bank (biaya pelunasan dipercepat = sisa pokok + 1x bunga − dana beku), pinjol, kartu kredit, dan utang keluarga, lengkap dengan jadwal, tombol bayar, dan "lunasi semua".
- **Target / kantong**: dana darurat, jalan-jalan, modif mobil, pelunasan bank, dana nikah.
- **Proyeksi sampai target nikah**: grafik saldo per bulan, perkiraan kapan bank lunas dan kapan dana nikah tercapai, plus tabel "kalau lunas bulan X butuh berapa".
- **Simulator**: budget pacaran, kurangi rokok, modif mobil, hemat tambahan. Efeknya langsung terlihat ke tanggal lunas dan dana nikah.
- **Mode Solitude / Pacar**: semua proyeksi otomatis dihitung ulang.
- **Rekap bulanan**: anggaran vs pengeluaran, rasio nabung, rasio cicilan, tren 6 bulan, insight, ekspor ke Excel (CSV).
- **Peringatan**: tagihan jatuh tempo, bulan seret (Januari), anggaran terlampaui, uang sudah cukup untuk melunasi bank, pengingat backup.
- **Backup & pulihkan** lewat file JSON.

## Privasi
Semua data hanya tersimpan di HP (localStorage browser), tidak dikirim ke server mana pun. Repo ini cuma berisi kode, tanpa data keuangan. Rutinlah backup lewat ⚙️ Pengaturan → Backup.

## Menjalankan
Tidak perlu build. Cukup sajikan foldernya sebagai situs statis:
```
python3 -m http.server 8000   # lalu buka http://localhost:8000
node --test                   # tes perhitungan
```
Untuk mencoba tanggal lain: `index.html?today=2026-12-20`.

## Pasang di HP
1. Online-kan lewat GitHub Pages (Settings → Pages → Deploy from branch `main`, folder `/root`), Netlify, atau Cloudflare Pages.
2. Buka link-nya di Chrome Android, menu ⋮, lalu **Tambahkan ke layar utama / Install aplikasi**.
3. Buka aplikasinya, pilih **Pulihkan dari file**, lalu pilih file data awal atau backup.
