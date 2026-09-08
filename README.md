# KAKAS

Perkakas digital untuk kerja tangan. Aplikasi pertama ialah **Penjana Nametag**: taip nama dan
jawatan, dan dapat fail STL siap cetak untuk tag nama guru, penjawat awam atau baju korporat —
lengkap dengan poket magnet, teks timbul atau ukir, dan bucu bulat.

Dibina dengan Astro, React, Tailwind + daisyUI, dan dihoskan di Netlify.

---

## Apa yang ada di dalam

| Laluan | Fungsi |
| :-- | :-- |
| `/` | Laman utama |
| `/apps` | Senarai perkakas |
| `/apps/nametag` | Studio Nametag (editor + pratonton langsung) |
| `/harga` | Harga dan pembelian |
| `/panduan` | Panduan cetakan, magnet dan dua warna |
| `/akaun` | Semak kunci lesen |
| `/bayaran/berjaya`, `/bayaran/batal` | Hasil pembayaran |
| `/terma`, `/privasi` | Halaman rasmi |

### API

| Endpoint | Keterangan |
| :-- | :-- |
| `POST /api/nametag/generate` | Menjana satu STL. Perlukan kunci lesen. |
| `POST /api/nametag/batch` | Menjana banyak STL sebagai ZIP. Perlukan langganan aktif. |
| `GET /api/nametag/sample` | STL contoh percuma dengan teks tetap. |
| `POST /api/billing/checkout` | Memulakan pembelian. |
| `POST /api/billing/claim` | Menukar pembayaran selesai kepada kunci lesen. |
| `POST /api/billing/status` | Menyemak baki kredit dan langganan. |
| `POST /api/billing/webhook` | Webhook Stripe (pembaharuan, pembatalan). |

---

## Cara ia berfungsi

### Geometri dijana di pelayan

Susun atur teks (`src/lib/nametag/layout.ts`) berjalan di kedua-dua belah: pelayar
menggunakannya untuk melukis pratonton SVG, pelayan menggunakannya untuk membina mesh. Sebab itu
pratonton bukan anggaran — ia bentuk huruf yang sama, pada kedudukan yang sama.

Yang **tidak** dihantar ke pelayar ialah pembinaan mesh (`src/lib/nametag/model.ts`) dan penulis
STL. Itu bahagian yang dibayar, jadi ia hidup di belakang semakan lesen sahaja.

### Mesh tertutup, bukan longgokan pepejal bertindih

Teks dan bingkai dijahit terus ke dalam permukaan plat, bukan diletak di atasnya: muka plat
membawa lubang bagi setiap garis luar relief, dan kaunter huruf seperti O dan A kekal pada
ketinggian muka sebagai pulau tersendiri. Hasilnya satu permukaan tertutup, bukan beberapa
pepejal bertindih yang bergantung pada penghiris untuk mencantumkannya.

Tiga perkara yang perlu ditangani untuk itu berjaya, dan setiap satunya ada dalam kod:

1. **Sarang mengikut kandungan, bukan arah putaran.** Bingkai mengandungi teks, huruf
   mengandungi kaunternya sendiri. `nestRings()` mengira kedalaman sarang supaya sebarang
   susunan berlapis keluar dengan betul.
2. **Triangulasi disahkan.** earcut menyambung setiap lubang dengan titi mendatar. Teks duduk
   pada garis dasar yang sama, jadi titi antara huruf menjadi kolinear tepat dan bucu tercicir —
   yang mengoyakkan permukaan. `triangulate()` menyemak sempadan hasil terhadap gelung asal dan
   mencuba semula pada salinan yang diputar sehingga ia sepadan. Hanya indeks digunakan, jadi
   koordinat yang dipancarkan kekal sama tepat.
3. **Garis luar bertindih disatukan.** Huruf seperti Ç melukis tanda cedilla sebagai kontur
   berasingan yang bertindih dengan badan huruf. Kelompok yang bertindih sahaja melalui operasi
   union boolean; teks biasa tidak membayar kosnya.

Jalankan `npm run check:geometry` untuk mengesahkan: ia membina setiap preset serta beberapa kes
sukar, dan gagal jika ada tepi terbuka, permukaan berulang, triangulasi tidak lengkap, atau
isipadu negatif (normal terbalik).

### Data fon

`scripts/build-font-data.mjs` mengekstrak garis luar glif Roboto dan Roboto Condensed menjadi
JSON padat yang dikomit ke dalam repo. Hasilnya tiada penghurai fon diperlukan semasa jalanan —
tidak di pelayar, tidak di fungsi pelayan. Jalankan semula dengan:

```bash
npm run build:fonts
```

Fon sumber (Apache-2.0) dimuat turun ke `.fonts-cache/` secara automatik jika tiada. Lihat
`src/lib/nametag/fonts/LICENSE-FONTS.md`.

### Lesen dan kredit

Tiada kata laluan. Pembayaran mengeluarkan kunci lesen (`KKS-XXXX-…`) yang disimpan dalam Netlify
Blobs.

- **Bayar Sekali** memberi satu kredit reka bentuk.
- **Langganan Bulanan** membenarkan penjanaan tanpa had dan membuka mod senarai.

Setiap reka bentuk dicincang secara kanonik. Memuat turun semula reka bentuk yang **sama** tidak
menggunakan kredit lagi; menukar walau satu huruf menghasilkan reka bentuk baharu. Hanya cincangan
yang disimpan — teks nama tidak pernah ditulis ke storan.

---

## Menjalankan secara setempat

```bash
npm install
npm run dev            # http://localhost:4321
```

Tanpa konteks Netlify, storan lesen jatuh balik kepada fail JSON di bawah `.kakas-dev-data/`,
jadi keseluruhan aliran beli → lesen → muat turun boleh diuji terus dengan `astro dev`.

Untuk menguji dengan Netlify Blobs sebenar:

```bash
npm install netlify-cli@latest -g
netlify link
netlify dev           # http://localhost:8888
```

### Skrip

| Perintah | Fungsi |
| :-- | :-- |
| `npm run dev` | Pelayan pembangunan |
| `npm run build` | Bina untuk pengeluaran |
| `npm run check:geometry` | Sahkan mesh setiap preset tertutup rapat; tulis STL contoh ke `.stl-samples/` |
| `npm run build:fonts` | Jana semula data glif daripada fail TTF |

### Pemeriksaan automatik

`.github/workflows/ci.yml` menjalankan `astro check`, `npm run build` dan `npm run check:geometry`
pada setiap pull request dan setiap tolakan ke `main`. Kesemua 16 fail STL — lima preset dan
sebelas kes sukar — dilampirkan pada setiap larian, lulus atau gagal, jadi pengulas boleh
membukanya sendiri dalam penghiris.

---

## Pembayaran

Salin `.env.example` kepada `.env` dan isi kunci Stripe:

| Pemboleh ubah | Fungsi |
| :-- | :-- |
| `STRIPE_SECRET_KEY` | Kunci rahsia Stripe. Tanpa ini, tapak berjalan dalam mod demo. |
| `STRIPE_WEBHOOK_SECRET` | Rahsia penandatanganan webhook (`whsec_…`). |
| `URL` | Asal tapak, untuk membina URL kembali. Ditetapkan sendiri oleh Netlify. |

Arahkan webhook Stripe ke `https://<tapak-anda>/api/billing/webhook` dan langgan
`checkout.session.completed`, `customer.subscription.*` dan `invoice.*`.

Harga ditetapkan dalam `src/lib/billing/plans.ts` sebagai sen (`1500` = RM 15.00), dan Stripe
Checkout dibuat menggunakan `price_data` — tiada objek Price perlu dicipta terlebih dahulu.

### Mod demo

Tanpa `STRIPE_SECRET_KEY`, `/api/billing/checkout` memulangkan pautan kembali ke halaman
kejayaan dan lesen dikeluarkan tanpa wang bertukar tangan. Lesen sedemikian ditanda `demo: true`
dan dilabel dengan jelas di setiap tempat ia dipaparkan. Ini untuk pembangunan dan demonstrasi
sahaja — jangan sekali-kali menghantar tapak ke pengeluaran tanpa kunci sebenar.

### Menambah gerbang pembayaran Malaysia

FPX (toyyibPay, Billplz, Chip) lebih lazim daripada kad di Malaysia. Titik sambungannya ialah
`startCheckout()` dan `claim*()` dalam `src/lib/billing/checkout.ts`: kedua-duanya sudah
berasingan daripada logik lesen, jadi gerbang baharu hanya perlu memulangkan URL pembayaran dan,
apabila selesai, memanggil laluan pengeluaran lesen yang sama. Langganan berulang masih memerlukan
gerbang yang menyokongnya.

---

## Nota

KAKAS ialah perkhidmatan swasta dan tiada kaitan dengan mana-mana agensi kerajaan. Reka bentuk
yang dijana perlu mematuhi garis panduan pemakaian jabatan masing-masing.
