# Bekerja pada KAKAS

Nota untuk sesiapa yang menyentuh kod ini — termasuk diri sendiri enam bulan dari sekarang.

## Mula

```bash
nvm use              # Node 20, ikut .nvmrc
npm install
npm run dev          # http://localhost:4321
```

Tanpa konteks Netlify, storan lesen jatuh balik kepada fail JSON di bawah `.kakas-dev-data/`,
jadi keseluruhan aliran beli → lesen → muat turun boleh diuji tanpa akaun Stripe.

## Sebelum setiap commit

```bash
npm run typecheck    # astro check
npm test             # mesh setiap preset dan plat mesti tertutup rapat
npm run build
```

CI menjalankan ketiga-tiganya. Menjalankannya dahulu lebih murah daripada menunggu larian merah.

## Peraturan yang bukan gaya, tetapi kebenaran

**Pratonton mesti guna susun atur yang sama dengan pembina mesh.** `layout.ts` dan `plate.ts`
berjalan di kedua-dua belah dengan sengaja. Kalau kau ubah cara teks diletak, ubah di situ —
jangan tampal pembetulan dalam komponen pratonton sahaja, kerana itu memisahkan apa yang
pelanggan nampak daripada apa yang dia dapat.

**Pembina mesh tidak boleh sampai ke pelayar.** `model.ts`, `geometry/` dan `billing/` hanya
diimport oleh kod pelayan. Import mana-mana daripadanya ke dalam komponen React akan menghantar
bahagian berbayar produk ini kepada sesiapa yang membuka DevTools.

**Setiap perubahan geometri mesti lulus `npm test`.** Mesh yang tidak tertutup rapat tetap
kelihatan betul dalam pratonton dan tetap membuka dalam kebanyakan penghiris — kemudian mencetak
dengan dinding hilang. Semakan itu wujud kerana mata tidak boleh mengesannya.

**Jangan simpan teks nama.** Hanya cincangan reka bentuk disimpan. Ini keputusan privasi, bukan
pengoptimuman.

## Gaya

Prettier menentukan format (`.prettierrc`); `.editorconfig` memastikan editor yang tidak
menjalankan Prettier pun bersetuju. Import disusun: modul Node, kemudian pustaka dalaman
mengikut abjad, kemudian import setempat.

Komen menjelaskan **sebab**, bukan **apa**. Kod sudah kata apa yang berlaku.

## Susunan folder

Lihat [`docs/architecture.md`](docs/architecture.md).
