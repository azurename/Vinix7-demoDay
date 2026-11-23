# Vinix7

Panduan preferensi sistem kerja berbasis survei Gen Z. Form individu dan Excel memakai skema dan model Logistic Regression tiga kelas yang sama. Pilihan `Any` tidak dimodelkan. Skor bukan dasar seleksi kerja. File Excel diproses di browser, tidak dikirim ke server.

Form individu tidak menonjolkan Hybrid jika skor modelnya di bawah 80%. Jika hasil modelnya Hybrid di bawah batas itu, form menawarkan Onsite atau Remote sebagai alternatif, tanpa mengubah skor asli atau hasil Excel. Alasan di form berasal dari pilihan yang paling mendukung saran relatif terhadap opsi pembanding, bukan kesimpulan sebab-akibat atau uji signifikansi statistik.

## Jalankan lokal

Buka `index.html` di Chromium modern, atau jalankan `python -m http.server 8000` dari folder hasil `node scripts/build.cjs` (`dist/`). Unduh template dari tab Excel: isi 16 kolom pada lembar pertama dengan kode di lembar panduan. Hapus baris contoh sintetis jika hendak menganalisis data sendiri. Kode angka mengikuti kuesioner asli (misalnya `IPK` bukan angka IPK langsung).

## Perbarui model

Hanya perlu untuk melatih ulang, bukan untuk menjalankan website. Pakai Python 3.14 dan Node, jalankan `python -m venv .venv`, lalu pada Windows jalankan:

```sh
.venv/Scripts/python.exe -m pip install -r scripts/requirements-train.txt
.venv/Scripts/python.exe scripts/export_model.py "C:/path/ke/workbook-lokal.xlsx"
```

Ekspor memperbarui `model-data.js` (koefisien, bias, pengali keputusan, dan kode fitur yang diizinkan) serta `templat-vinix7.xlsx` (contoh sintetis). Ekspor mengecek kesetaraan skor Python dengan JavaScript sebelum menulis artefak. Dataset dan notebook asli tidak dibutuhkan oleh hosting. Pisahkan data uji baru untuk klaim performa; evaluasi dari ekspor ini hanya pada workbook yang sebelumnya sudah digunakan.

## Tes dan update di Vercel

```sh
node --test tests/model.test.cjs
.venv/Scripts/python.exe tests/browser_smoke.py
node scripts/build.cjs
```

`vercel.json` memakai output `dist/` yang dibangun dari allowlist; jangan mengunggah folder riset atau notebook secara manual. Untuk preview pertama via CLI, gunakan `vercel deploy` tanpa `--prod` dari worktree yang sudah diverifikasi. Cek URL dengan form dan template sintetis. Setelah integrasi GitHub terhubung, buat branch untuk pembaruan; gunakan Preview untuk uji, lalu gabungkan ke production branch jika sudah disetujui.

Inter di-host bersama situs; lisensinya ada di `fonts/OFL-Inter.txt`.
