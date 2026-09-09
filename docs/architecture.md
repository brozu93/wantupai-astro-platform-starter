# Seni bina

Bagaimana KAKAS disusun, dan sebab ia disusun begitu.

---

## Susunan folder

```
kakas/
├─ docs/                      Dokumentasi ini
├─ public/                    Aset statik dihidangkan apa adanya
├─ scripts/                   Alat masa binaan
│  └─ build-font-data.mjs     TTF → JSON glif yang dikomit
├─ tests/
│  └─ geometry.ts             Semakan mesh — jalankan dengan `npm test`
└─ src/
   ├─ assets/                 Imej yang melalui saluran binaan
   ├─ components/
   │  ├─ layout/              Rangka tapak: Header, Footer
   │  ├─ ui/                  Primitif tanpa pengetahuan domain: Logo, controls
   │  ├─ billing/             Komponen ciri pembayaran
   │  └─ nametag/             Komponen ciri penjana
   ├─ layouts/                Rangka halaman Astro
   ├─ lib/                    Logik domain — tiada JSX di sini
   │  ├─ api/                 Pembantu respons HTTP
   │  ├─ billing/             Pelan, lesen, storan, Stripe
   │  └─ nametag/             Teras penjana
   │     ├─ fonts/            Data glif yang dikomit
   │     └─ geometry/         Poligon, mesh, triangulasi, union
   ├─ pages/                  Laluan — fail di sini menjadi URL
   │  └─ api/                 Laluan pelayan
   ├─ styles/
   └─ types/                  Pengisytiharan ambien
```

Peraturan yang menentukan di mana sesuatu fail duduk:

- **`components/ui/`** tidak tahu apa itu nametag. Kalau komponen itu boleh dipindahkan ke
  projek lain tanpa diubah, ia milik sini.
- **`components/<ciri>/`** tahu tentang satu ciri sahaja.
- **`lib/`** tiada JSX langsung. Ia logik tulen, boleh diuji tanpa pelayar.
- **`pages/`** setipis mungkin: baca permintaan, panggil `lib/`, bentuk respons.

---

## Tiga tempat kod berjalan

| Bila | Apa | Contoh |
| :-- | :-- | :-- |
| Masa binaan | Halaman jadi HTML sekali sahaja | 8 daripada 10 halaman |
| Pelayar | React yang perlu berinteraksi | 4 tempat `client:load` |
| Pelayan | Setiap permintaan | `src/pages/api/**` (`prerender = false`) |
| Edge / CDN | Jawapan disimpan berhampiran pengguna | STL contoh, `Netlify-CDN-Cache-Control` |

---

## Susun atur dikongsi, bukan disalin

Susun atur teks (`src/lib/nametag/layout.ts`) berjalan di kedua-dua belah: pelayar menggunakannya
untuk melukis pratonton SVG, pelayan menggunakannya untuk membina mesh. Sebab itu pratonton bukan
anggaran — ia bentuk huruf yang sama, pada kedudukan yang sama. `plate.ts` berkelakuan sama untuk
susunan atas dandang.

Yang **tidak** dihantar ke pelayar ialah pembinaan mesh (`src/lib/nametag/model.ts`) dan penulis
STL. Itu bahagian yang dibayar, jadi ia hidup di belakang semakan lesen sahaja.

---

## Mesh tertutup, bukan longgokan pepejal bertindih

Teks dan bingkai dijahit terus ke dalam permukaan plat, bukan diletak di atasnya: muka plat
membawa lubang bagi setiap garis luar relief, dan kaunter huruf seperti O dan A kekal pada
ketinggian muka sebagai pulau tersendiri. Hasilnya satu permukaan tertutup, bukan beberapa
pepejal bertindih yang bergantung pada penghiris untuk mencantumkannya.

Tiga perkara yang perlu ditangani untuk itu berjaya:

1. **Sarang mengikut kandungan, bukan arah putaran.** Bingkai mengandungi teks, huruf mengandungi
   kaunternya sendiri. `nestRings()` mengira kedalaman sarang supaya sebarang susunan berlapis
   keluar dengan betul.
2. **Triangulasi disahkan.** earcut menyambung setiap lubang dengan titi mendatar. Teks duduk pada
   garis dasar yang sama, jadi titi antara huruf menjadi kolinear tepat dan bucu tercicir — yang
   mengoyakkan permukaan. `triangulate()` menyemak sempadan hasil terhadap gelung asal dan mencuba
   semula pada salinan yang diputar sehingga ia sepadan. Hanya indeks digunakan, jadi koordinat
   yang dipancarkan kekal sama tepat.
3. **Garis luar bertindih disatukan.** Huruf seperti Ç melukis tanda cedilla sebagai kontur
   berasingan yang bertindih dengan badan huruf. Kelompok yang bertindih sahaja melalui operasi
   union boolean; teks biasa tidak membayar kosnya.

`npm test` mengesahkannya: ia membina setiap preset, beberapa kes sukar dan beberapa plat
berbilang tag, dan gagal jika ada tepi terbuka, permukaan berulang, triangulasi tidak lengkap,
atau isipadu negatif (normal terbalik).

---

## Mod plat — seluruh senarai sebagai satu cetakan

Mod senarai boleh pulangkan satu STL setiap nama, tetapi itu jarang yang dimahukan oleh orang yang
mencetak senarai staf: mereka mahu buka satu fail, tekan cetak sekali, dan kembali kepada dulang
penuh tag siap. `src/lib/nametag/plate.ts` mengira kedudukan setiap tag atas dandang.

Pengepak memilih bilangan lajur dengan meletakkan seberapa banyak tag yang muat, kemudian mengambil
kotak sempadan paling padat antara susunan yang meletakkan jumlah sama. Enam belas tag 76 × 25 mm
pada jarak 5 mm mendarat pada 2 lajur × 8 baris, kerana 157 × 235 mm membazir kurang ruang dandang
berbanding 235 × 175 mm yang diperlukan oleh tiga lajur.

Senarai yang melebihi satu dandang dipecahkan kepada beberapa plat dan dipulangkan sebagai ZIP.
Setiap tag dibina sekali sahaja dan dicap ke tempatnya, jadi nama yang diulang pada baris lain —
cara meminta salinan tambahan — hanya menambah satu salinan memori, bukan triangulasi kedua.

**Jarak antara tag tidak boleh sifar.** Rapatkan dua plat bucu tajam sehingga bersentuhan dan
dinding sisinya jatuh pada bucu yang sama, meninggalkan permukaan berulang yang tiada penghiris
patut diminta mentafsir — diukur 30 tepi berulang untuk plat 2 × 2. `MIN_SPACING` menguatkuasakan
1 mm, dan `tests/geometry.ts` menyimpan kes yang meminta sifar supaya had itu tidak boleh hilang
tanpa disedari.

---

## Data fon

`scripts/build-font-data.mjs` mengekstrak garis luar glif Roboto dan Roboto Condensed menjadi JSON
padat yang dikomit ke dalam repo. Hasilnya tiada penghurai fon diperlukan semasa jalanan — tidak di
pelayar, tidak di fungsi pelayan.

```bash
npm run build:fonts
```

Fon sumber (Apache-2.0) dimuat turun ke `.fonts-cache/` secara automatik jika tiada. Lihat
`src/lib/nametag/fonts/LICENSE-FONTS.md`.
