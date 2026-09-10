/**
 * Messages produced on the server: API errors, the print advice returned alongside a file, and
 * the warnings the layout raises when text had to be squeezed.
 *
 * These reach the customer in a download header or an error toast, so they follow the language
 * the caller asked for rather than the server's own default.
 */

const ms = {
    // ── API ───────────────────────────────────────────────────────────────
    'api.licence.invalid': 'Kunci lesen tidak sah.',
    'api.licence.invalidBuy': 'Kunci lesen tidak sah. Semak semula atau beli lesen di /harga.',
    'api.licence.notFound': 'Kunci lesen tidak dijumpai. Semak ejaan atau semak e-mel resit anda.',
    'api.spec.invalid': 'Spesifikasi tag tidak sah.',
    'api.spec.needLine': 'Isi sekurang-kurangnya satu baris teks.',
    'api.batch.subOnly': 'Mod senarai hanya untuk langganan bulanan yang aktif.',
    'api.plate.subOnly': 'Mod plat hanya untuk langganan bulanan yang aktif.',
    'api.list.empty': 'Senarai kosong. Tambah sekurang-kurangnya satu baris.',
    'api.list.max': 'Maksimum {max} tag setiap muat turun.',
    'api.list.none': 'Tiada tag yang boleh dijana. {problems}',
    'api.row.problem': 'Baris {row}: {message}',
    'api.sample.failed': 'Gagal menjana fail contoh: {message}',
    'api.checkout.failed': 'Gagal memulakan pembayaran: {message}',
    'api.claim.failed': 'Gagal mengesahkan pembayaran: {message}',
    'api.method.batch': 'Gunakan POST untuk mod senarai.',
    'api.method.plate': 'Gunakan POST untuk mod plat.',
    'api.plate.noFit': 'Tag tidak muat pada dandang.',

    // ── Checkout ──────────────────────────────────────────────────────────
    'checkout.emailInvalid': 'Alamat e-mel tidak sah.',
    'checkout.planUnknown': 'Pelan tidak dikenali.',
    'checkout.notComplete': 'Pembayaran ini belum selesai. Cuba semula selepas beberapa saat.',
    'checkout.demoNotFound': 'Rujukan pembayaran demo tidak dijumpai atau sudah luput.',
    'checkout.sessionNoPlan': 'Sesi pembayaran tiada maklumat pelan.',
    'checkout.noUrl': 'Stripe tidak memulangkan pautan pembayaran.',
    'checkout.productName': 'KAKAS — {plan}',
    'checkout.descSubscription': '{price} sebulan — STL nametag tanpa had',
    'checkout.descOnce': '{price} — 1 kredit reka bentuk STL',

    // ── Print advice returned with a file ─────────────────────────────────
    'note.twoColour': 'Untuk dua warna, tukar filamen (M600) pada ketinggian {height} mm supaya teks berbeza warna daripada plat.',
    'note.magnetPocket': 'Poket magnet dipotong Ø{pocket} mm × {depth} mm dalam — muat magnet Ø{diameter} × {thickness} mm.',
    'note.pinRecess': 'Lekuk peniti {length} × {width} × {depth} mm — lekatkan bar peniti dengan gam.',
    'note.magnetTooBig': 'Magnet terlalu besar untuk plat ini. Besarkan plat atau kecilkan magnet.',
    'note.thinBackWall': 'Dinding antara poket dan muka hadapan sangat nipis. Tambah ketebalan plat untuk hasil lebih kukuh.',
    'note.engraveLimited': 'Kedalaman ukiran dihadkan kepada {depth} mm supaya plat tidak tertebuk oleh poket di belakang.',

    // ── Layout warnings ───────────────────────────────────────────────────
    'warn.verticalShrink': 'Teks dikecilkan supaya muat pada ketinggian plat. Pertimbang plat yang lebih tinggi.',
    'warn.lineShrunkHard': 'Baris "{label}" terpaksa dikecilkan banyak. Cuba fon "Sempit Tebal" atau plat yang lebih lebar.',
    'warn.lineShrunkSlight': 'Baris "{label}" dikecilkan sedikit supaya muat pada lebar plat.',

    // ── Plate arrangement ─────────────────────────────────────────────────
    'plate.tooBig': 'Tag {tagWidth} × {tagHeight} mm tidak muat pada dandang {bedWidth} × {bedHeight} mm dengan jidar {margin} mm.',
    'plate.columnsReduced': 'Hanya {max} lajur muat pada lebar dandang, jadi {asked} lajur dikurangkan.',
    'plate.overflow': '{overflow} tag lagi tidak muat pada satu dandang — muat turun akan beri {plates} plat, satu fail untuk setiap kali cetak.'
} as const;

export type ServerKey = keyof typeof ms;

const en: Record<ServerKey, string> = {
    // ── API ───────────────────────────────────────────────────────────────
    'api.licence.invalid': 'That licence key is not valid.',
    'api.licence.invalidBuy': 'That licence key is not valid. Check it again, or buy a licence at /en/pricing.',
    'api.licence.notFound': 'No licence found for that key. Check the spelling, or check your receipt email.',
    'api.spec.invalid': 'The tag specification is not valid.',
    'api.spec.needLine': 'Fill in at least one line of text.',
    'api.batch.subOnly': 'List mode needs an active monthly subscription.',
    'api.plate.subOnly': 'Plate mode needs an active monthly subscription.',
    'api.list.empty': 'The list is empty. Add at least one row.',
    'api.list.max': 'Maximum {max} tags per download.',
    'api.list.none': 'No tags could be generated. {problems}',
    'api.row.problem': 'Row {row}: {message}',
    'api.sample.failed': 'Could not generate the sample file: {message}',
    'api.checkout.failed': 'Could not start the payment: {message}',
    'api.claim.failed': 'Could not confirm the payment: {message}',
    'api.method.batch': 'Use POST for list mode.',
    'api.method.plate': 'Use POST for plate mode.',
    'api.plate.noFit': 'The tag does not fit on the build plate.',

    // ── Checkout ──────────────────────────────────────────────────────────
    'checkout.emailInvalid': 'That email address is not valid.',
    'checkout.planUnknown': 'Unknown plan.',
    'checkout.notComplete': 'This payment has not completed yet. Try again in a few seconds.',
    'checkout.demoNotFound': 'That demo payment reference was not found, or it has expired.',
    'checkout.sessionNoPlan': 'The payment session carries no plan information.',
    'checkout.noUrl': 'Stripe did not return a payment link.',
    'checkout.productName': 'KAKAS — {plan}',
    'checkout.descSubscription': '{price} a month — unlimited name tag STLs',
    'checkout.descOnce': '{price} — 1 STL design credit',

    // ── Print advice returned with a file ─────────────────────────────────
    'note.twoColour': 'For two colours, change filament (M600) at {height} mm so the lettering comes out a different colour from the plate.',
    'note.magnetPocket': 'Magnet pockets cut Ø{pocket} mm × {depth} mm deep — sized for Ø{diameter} × {thickness} mm magnets.',
    'note.pinRecess': 'Pin bar recess {length} × {width} × {depth} mm — glue the pin bar in.',
    'note.magnetTooBig': 'The magnets are too big for this plate. Make the plate larger, or use smaller magnets.',
    'note.thinBackWall': 'The wall between the pocket and the front face is very thin. Increase the plate thickness for a sturdier tag.',
    'note.engraveLimited': 'Engraving depth limited to {depth} mm so the pockets behind do not break through the plate.',

    // ── Layout warnings ───────────────────────────────────────────────────
    'warn.verticalShrink': 'The text was shrunk to fit the plate height. Consider a taller plate.',
    'warn.lineShrunkHard': 'The line "{label}" had to shrink a lot. Try the "Condensed Bold" font, or a wider plate.',
    'warn.lineShrunkSlight': 'The line "{label}" was shrunk slightly to fit the plate width.',

    // ── Plate arrangement ─────────────────────────────────────────────────
    'plate.tooBig': 'A {tagWidth} × {tagHeight} mm tag does not fit a {bedWidth} × {bedHeight} mm bed with a {margin} mm margin.',
    'plate.columnsReduced': 'Only {max} columns fit the bed width, so {asked} columns were reduced.',
    'plate.overflow': '{overflow} more tags do not fit on one bed — the download gives you {plates} plates, one file per print.'
};

export const server = { ms, en };
