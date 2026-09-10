# Changelog

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Belum dikeluarkan]

### Ditambah

- **Dwibahasa.** Bahasa Malaysia di akar, English di bawah `/en/`, dengan slug diterjemah
  (`/harga` ↔ `/en/pricing`) dan pemilih bahasa pada setiap halaman. Setiap halaman
  mengisytiharkan pasangannya melalui `hreflang`.
- Mesej pelayan mengikut bahasa pemanggil: ralat API, nota cetakan yang dipulangkan bersama
  fail, amaran susun atur, dan nama produk pada resit Stripe.

- **Mod plat.** Seluruh senarai nama disusun atas dandang pencetak dan dipulangkan sebagai satu
  STL, bukan satu fail bagi setiap nama. `POST /api/nametag/plate`. Senarai yang melebihi satu
  dandang dipecahkan kepada beberapa plat dan dihantar sebagai ZIP.
- Pemilih dandang pencetak (Ender 3, Bambu, Prusa, Voron 250/350, atau tersuai), kawalan jarak
  antara tag, dan bilangan lajur automatik atau tetap.
- Pratonton "Plat" dalam studio: seluruh susunan dilukis daripada susun atur yang sama seperti
  fail akhir, dengan garis dandang dan kapasiti setiap kali cetak.

### Dibetulkan

- Jarak sifar antara tag menghasilkan dinding sisi bertindih pada bucu yang sama — 30 tepi
  berulang pada plat 2 × 2. `MIN_SPACING` kini menguatkuasakan 1 mm.

### Diubah

- Projek disusun semula: komponen dipisahkan kepada `layout/`, `ui/` dan folder ciri; semakan
  geometri dipindahkan ke `tests/` dan dijalankan dengan `npm test`; dokumentasi dalam dan
  panjang dipindahkan daripada README ke `docs/`.
- `Alert.astro` yang tidak digunakan dibuang.
