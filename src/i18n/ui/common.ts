/** Site chrome: navigation, footer, and the handful of labels that recur everywhere. */

const ms = {
    'meta.description': 'KAKAS membina perkakas digital untuk kerja tangan. Penjana STL nametag kerajaan, sekolah dan korporat untuk pencetak 3D.',
    'meta.homeTitle': 'KAKAS — Perkakas digital untuk pencetak 3D',

    'nav.aria': 'Utama',
    'nav.home': 'Laman utama',
    'nav.apps': 'Apps',
    'nav.nametag': 'Penjana Nametag',
    'nav.pricing': 'Harga',
    'nav.guide': 'Panduan',
    'nav.account': 'Akaun',
    'nav.openStudio': 'Buka Studio',
    'nav.logoAria': 'KAKAS, ke laman utama',

    'lang.aria': 'Pilih bahasa',
    'lang.switchTo': 'Tukar ke {name}',

    'footer.tagline': 'Perkakas digital untuk kerja tangan — direka di Malaysia untuk pengguna pencetak 3D dan mesin ukir.',
    'footer.tools': 'Perkakas',
    'footer.allApps': 'Semua apps',
    'footer.printGuide': 'Panduan cetakan',
    'footer.account': 'Akaun',
    'footer.checkLicence': 'Semak lesen',
    'footer.official': 'Rasmi',
    'footer.terms': 'Terma & bayaran balik',
    'footer.privacy': 'Privasi',
    'footer.disclaimerBefore': 'KAKAS ialah perkhidmatan swasta dan ',
    'footer.disclaimerStrong': 'tiada kaitan dengan mana-mana agensi kerajaan',
    'footer.disclaimerAfter': '. Reka bentuk yang dijana perlu mematuhi garis panduan pemakaian jabatan anda sendiri.',
    'footer.fonts': 'Bentuk huruf menggunakan Roboto dan Roboto Condensed (Apache License 2.0). © {year} KAKAS.',

    'cta.openStudio': 'Buka Studio Nametag',
    'cta.seePricing': 'Lihat harga',
    'cta.readGuide': 'Panduan cetakan'
} as const;

export type CommonKey = keyof typeof ms;

const en: Record<CommonKey, string> = {
    'meta.description': 'KAKAS builds digital tools for hands-on work. An STL generator for government, school and corporate name tags, made for 3D printers.',
    'meta.homeTitle': 'KAKAS — Digital tools for 3D printers',

    'nav.aria': 'Main',
    'nav.home': 'Home',
    'nav.apps': 'Apps',
    'nav.nametag': 'Nametag Generator',
    'nav.pricing': 'Pricing',
    'nav.guide': 'Guide',
    'nav.account': 'Account',
    'nav.openStudio': 'Open Studio',
    'nav.logoAria': 'KAKAS, back to home',

    'lang.aria': 'Choose language',
    'lang.switchTo': 'Switch to {name}',

    'footer.tagline': 'Digital tools for hands-on work — made in Malaysia for people with 3D printers and engravers.',
    'footer.tools': 'Tools',
    'footer.allApps': 'All apps',
    'footer.printGuide': 'Printing guide',
    'footer.account': 'Account',
    'footer.checkLicence': 'Check licence',
    'footer.official': 'Official',
    'footer.terms': 'Terms & refunds',
    'footer.privacy': 'Privacy',
    'footer.disclaimerBefore': 'KAKAS is a private service and is ',
    'footer.disclaimerStrong': 'not affiliated with any government agency',
    'footer.disclaimerAfter': '. Designs you generate must follow your own department’s dress and conduct guidelines.',
    'footer.fonts': 'Letterforms from Roboto and Roboto Condensed (Apache License 2.0). © {year} KAKAS.',

    'cta.openStudio': 'Open the Nametag Studio',
    'cta.seePricing': 'See pricing',
    'cta.readGuide': 'Printing guide'
};

export const common = { ms, en };
