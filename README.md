# APK Random Store

Website katalog APK responsif, gaya bersih seperti Play Store. Frontend statis dapat di-host gratis di GitHub Pages. Database, login admin, dan file APK memakai Supabase.

## Penting sebelum mulai
- Upload hanya APK yang kamu punya hak untuk membagikannya.
- Jangan mengunggah APK bajakan, aplikasi berbahaya, atau file yang kamu tidak punya izin untuk distribusikan.
- APK yang diunggah bisa diunduh siapa pun jika bucket disetel Public.
- Paket gratis punya batas penyimpanan, bandwidth, dan ukuran file. Cek kuota Supabase sebelum mengunggah banyak file.
- Jangan pernah memasukkan `service_role` key ke `app.js`. Gunakan hanya project URL dan anon/publishable key.

## A. Buat backend gratis di Supabase
1. Buka https://supabase.com dan buat akun/project.
2. Di **Project Settings → API**, salin Project URL dan anon/publishable key.
3. Buka **SQL Editor** dan jalankan SQL berikut:

```sql
create table public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text default '1.0',
  category text not null default 'Lainnya',
  description text default '',
  file_path text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

alter table public.apps enable row level security;

create policy "Public can read app catalog"
on public.apps for select
to anon, authenticated
using (true);

create policy "Authenticated admins can add catalog entries"
on public.apps for insert
to authenticated
with check (auth.uid() is not null);
```

**Keamanan admin yang disarankan:** Untuk produksi, jangan mengandalkan `authenticated` saja bila orang lain dapat membuat akun. Nonaktifkan sign-up publik di **Authentication → Settings**, lalu buat akun admin sendiri melalui **Authentication → Users → Add user**. Dengan sign-up publik dimatikan, hanya akun yang kamu buat yang dapat login.

4. Buka **Storage**, buat bucket bernama `apks`, lalu atur bucket sebagai **Public** supaya tombol unduh bekerja.
5. Tambahkan policy Storage untuk hanya mengizinkan pengguna yang login mengunggah file ke bucket `apks`. Jalankan di SQL Editor:

```sql
create policy "Authenticated admins can upload APK files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'apks' and auth.uid() is not null);

create policy "Public can read APK files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'apks');

create policy "Authenticated admins can delete APK files"
on storage.objects for delete
to authenticated
using (bucket_id = 'apks' and auth.uid() is not null);
```

Jika hanya kamu yang memiliki akun, akses upload terbatas ke akun itu. Untuk keamanan lebih kuat, gunakan tabel daftar admin dan policy yang memeriksa UID admin secara eksplisit.

6. Di file `app.js`, ganti:
   - `ISI_SUPABASE_PROJECT_URL` dengan Project URL.
   - `ISI_SUPABASE_ANON_KEY` dengan anon/publishable key.
7. Simpan file. Jangan pernah membagikan password admin.

## B. Hosting gratis dengan GitHub Pages
1. Buat akun di https://github.com jika belum punya.
2. Buat repository baru, misalnya `apk-random-store`.
3. Upload `index.html`, `style.css`, `app.js`, dan `README.md` ke root repository.
4. Buka **Settings → Pages**.
5. Di **Build and deployment**, pilih **Deploy from a branch**, pilih branch `main` dan folder `/ (root)`, lalu tekan **Save**.
6. Tunggu proses selesai. GitHub akan menampilkan URL website Pages kamu di halaman Pages.

## C. Cara menambahkan APK
1. Buka website dan tekan **Admin**.
2. Login menggunakan email/password admin Supabase yang kamu buat.
3. Isi nama, versi, kategori, deskripsi/sumber, lalu pilih file `.apk`.
4. Tekan **Upload APK** dan tunggu notifikasi berhasil.
5. APK akan tampil di katalog untuk semua pengunjung.

## D. Uji sebelum dibagikan
- Buka URL website dalam mode incognito; katalog harus bisa dilihat tanpa login.
- Coba login admin dan unggah APK kecil yang kamu punya hak untuk distribusikan.
- Pastikan unduhan berhasil dari perangkat lain.
- Jangan mengunggah APK sensitif/pribadi. Katalog ini tidak memindai file untuk malware; pindai file sebelum dibagikan.

## Batasan versi ini
- Frontend memakai CDN Supabase JS, jadi butuh koneksi internet.
- Tidak ada gambar ikon APK otomatis; kartu memakai ikon kategori.
- Tidak ada fitur hapus dari UI admin. Hapus metadata/file melalui dashboard Supabase.
- Batas 100 MB di UI adalah pengaman sederhana, bukan jaminan batas paket. Upload besar mungkin butuh resumable upload atau penyimpanan lain.
