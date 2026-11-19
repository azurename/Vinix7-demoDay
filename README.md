# Vinix7

Draft web preferensi lokasi kerja Gen Z. Form individu menampilkan contoh hasil. Unggah Excel memvalidasi lembar pertama di browser. Dataset dan model tidak disertakan.

## Jalankan lokal

Gunakan server HTTP statis. Misalnya, dengan Python, jalankan `python -m http.server 8000` dari folder proyek lalu buka http://localhost:8000. Browser perlu mendukung DecompressionStream untuk membaca workbook.

## Deploy

Dorong kode ke GitHub, lalu impor repo dari Vercel. Gunakan preset Other, direktori root repo, dan biarkan Build Command serta Output Directory kosong. Setelah terhubung, push ke main memicu deploy produksi dan branch lain mendapat preview.
