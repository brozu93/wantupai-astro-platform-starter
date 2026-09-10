# KAKAS

Perkakas digital untuk kerja tangan. Aplikasi pertama ialah **Penjana Nametag**: taip nama dan
jawatan, dan dapat fail STL siap cetak untuk tag nama guru, penjawat awam atau baju korporat —
lengkap dengan poket magnet, teks timbul atau ukir, dan bucu bulat. Mod plat menyusun seluruh
senarai staf atas dandang pencetak sebagai satu fail.

Dwibahasa: Bahasa Malaysia di akar (`/`), English di bawah `/en/`, dengan pemilih bahasa pada
setiap halaman.

Dibina dengan Astro, React, Tailwind + daisyUI, dan dihoskan di Netlify.

---

## Mula

```bash
nvm use          # Node 20
npm install
npm run dev      # http://localhost:4321
```

Tanpa konteks Netlify, storan lesen jatuh balik kepada fail JSON di bawah `.kakas-dev-data/`, jadi
keseluruhan aliran beli → lesen → muat turun boleh diuji terus dengan `astro dev`.

Untuk menguji dengan Netlify Blobs sebenar:

```bash
npm install netlify-cli@latest -g
netlify link
netlify dev      # http://localhost:8888
```

### Skrip

| Perintah | Fungsi |
| :-- | :-- |
| `npm run dev` | Pelayan pembangunan |
| `npm run build` | Bina untuk pengeluaran |
| `npm run typecheck` | `astro check` |
| `npm test` | Sahkan mesh setiap preset dan plat tertutup rapat |
| `npm run build:fonts` | Jana semula data glif daripada fail TTF |

### Menghantar ke internet

Tapak ini belum dihoskan di mana-mana. `netlify.toml` sudah menetapkan segalanya, jadi tiada
konfigurasi lagi diperlukan — dan tiada domain perlu dibeli, kerana Netlify memberi alamat
`*.netlify.app` percuma:

```bash
npm install netlify-cli@latest -g
netlify login
netlify init        # sambungkan repo ini kepada tapak Netlify baharu
netlify deploy --build --prod
```

Atau tanpa terminal: buka [app.netlify.com](https://app.netlify.com) → **Add new site** →
**Import an existing project** → pilih repo ini. Netlify membaca `netlify.toml` dan membina
sendiri pada setiap tolakan.

Tanpa kunci Stripe, tapak berjalan dalam mod demo — lihat [`docs/billing.md`](docs/billing.md).

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
| `POST /api/nametag/plate` | Menyusun seluruh senarai atas dandang dan memulangkan satu STL. Perlukan langganan aktif. |
| `GET /api/nametag/sample` | STL contoh percuma dengan teks tetap. |
| `POST /api/billing/checkout` | Memulakan pembelian. |
| `POST /api/billing/claim` | Menukar pembayaran selesai kepada kunci lesen. |
| `POST /api/billing/status` | Menyemak baki kredit dan langganan. |
| `POST /api/billing/webhook` | Webhook Stripe (pembaharuan, pembatalan). |

---

## Dokumentasi

| Dokumen | Isi |
| :-- | :-- |
| [`docs/architecture.md`](docs/architecture.md) | Susunan folder, di mana kod berjalan, cara mesh tertutup dibina, mod plat, data fon |
| [`docs/i18n.md`](docs/i18n.md) | Cara dwibahasa berfungsi: jadual laluan, kamus, dan cara menambah bahasa ketiga |
| [`docs/billing.md`](docs/billing.md) | Lesen dan kredit, konfigurasi Stripe, keselamatan, mod demo, menambah gerbang FPX |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Cara bekerja pada kod ini, dan peraturan yang bukan sekadar gaya |
| [`CHANGELOG.md`](CHANGELOG.md) | Apa yang berubah |

---

## Pemeriksaan automatik

`.github/workflows/ci.yml` menjalankan `npm run typecheck`, `npm run build` dan `npm test` pada
setiap pull request dan setiap tolakan ke `main`. Kesemua 21 fail STL — lima preset, sebelas kes
sukar dan lima plat berbilang tag — dilampirkan pada setiap larian, lulus atau gagal, jadi pengulas
boleh membukanya sendiri dalam penghiris.

---

## Nota

KAKAS ialah perkhidmatan swasta dan tiada kaitan dengan mana-mana agensi kerajaan. Reka bentuk yang
dijana perlu mematuhi garis panduan pemakaian jabatan masing-masing.

Lesen: proprietari — lihat [`LICENSE`](LICENSE).
