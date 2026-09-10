# Pembayaran dan lesen

---

## Model

Tiada kata laluan dan tiada akaun. Pembayaran mengeluarkan kunci lesen (`KKS-XXXX-…`) yang
disimpan dalam Netlify Blobs. Kunci itulah akaunnya.

| Pelan | Harga | Yang dibuka |
| :-- | :-- | :-- |
| Bayar Sekali | RM 15.00 | Satu kredit reka bentuk |
| Langganan Bulanan | RM 29.00 / bulan | STL tanpa had, mod senarai, mod plat |

Setiap reka bentuk dicincang secara kanonik. Memuat turun semula reka bentuk yang **sama** tidak
menggunakan kredit lagi; menukar walau satu huruf menghasilkan reka bentuk baharu.

**Hanya cincangan disimpan — teks nama tidak pernah ditulis ke storan.** Ini keputusan privasi,
dan ia bermakna kebocoran pangkalan data tidak mendedahkan nama sesiapa.

---

## Storan

`src/lib/billing/store.ts` menggunakan Netlify Blobs di pengeluaran. Bila `astro dev` berjalan
sendirian tanpa konteks Netlify, ia jatuh balik kepada fail JSON di bawah `.kakas-dev-data/` —
jadi keseluruhan aliran beli → lesen → muat turun boleh diuji tanpa akaun Stripe atau Netlify.

---

## Konfigurasi

Salin `.env.example` kepada `.env`:

| Pemboleh ubah | Fungsi |
| :-- | :-- |
| `STRIPE_SECRET_KEY` | Kunci rahsia Stripe. Tanpa ini, tapak berjalan dalam mod demo. |
| `STRIPE_WEBHOOK_SECRET` | Rahsia penandatanganan webhook (`whsec_…`). |
| `URL` | Asal tapak, untuk membina URL kembali. Ditetapkan sendiri oleh Netlify. |

Arahkan webhook Stripe ke `https://<tapak-anda>/api/billing/webhook` dan langgan
`checkout.session.completed`, `customer.subscription.*` dan `invoice.*`.

Harga ditetapkan dalam `src/lib/billing/plans.ts` sebagai sen (`1500` = RM 15.00), dan Stripe
Checkout dibuat menggunakan `price_data` — tiada objek Price perlu dicipta terlebih dahulu.

---

## Keselamatan

Tiga lapisan berbeza, semuanya perlu:

- **Pengesahan input.** `parseSpec()` mengapit setiap nombor kepada julat munasabah, jadi
  permintaan yang dibuat sendiri tidak boleh meminta plat 900 mm atau teks 500 baris.
- **Had kadar.** `DAILY_LIMIT = 400` penjanaan setiap lesen setiap hari.
- **Pengesahan kriptografi.** Tandatangan webhook Stripe disemak dengan HMAC-SHA256 dan
  dibandingkan menggunakan `timingSafeEqual` — tanpa itu, sesiapa boleh menghantar webhook palsu
  dan memberi diri mereka langganan percuma.

---

## Mod demo

Tanpa `STRIPE_SECRET_KEY`, `/api/billing/checkout` memulangkan pautan kembali ke halaman kejayaan
dan lesen dikeluarkan tanpa wang bertukar tangan. Lesen sedemikian ditanda `demo: true` dan
dilabel dengan jelas di setiap tempat ia dipaparkan.

Ini untuk pembangunan dan demonstrasi sahaja — **jangan sekali-kali menghantar tapak ke pengeluaran
tanpa kunci sebenar.**

---

## Menambah gerbang pembayaran Malaysia

FPX (toyyibPay, Billplz, Chip) lebih lazim daripada kad di Malaysia.

Titik sambungannya ialah `startCheckout()` dan `claim*()` dalam `src/lib/billing/checkout.ts`.
Kedua-duanya sudah berasingan daripada logik lesen, jadi gerbang baharu hanya perlu:

1. memulangkan URL pembayaran daripada `startCheckout()`, dan
2. apabila selesai, memanggil laluan pengeluaran lesen yang sama.

Langganan berulang masih memerlukan gerbang yang menyokongnya.
