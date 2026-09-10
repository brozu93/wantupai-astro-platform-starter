import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
    integrations: [
        react(),
        tailwind({
            applyBaseStyles: false
        })
    ],
    output: 'hybrid',
    adapter: netlify(),
    // Malay is served from the root and English from /en/, which needs no domain and gives each
    // language a URL that can be shared. src/i18n/index.ts holds the ms<->en route table.
    i18n: {
        defaultLocale: 'ms',
        locales: ['ms', 'en'],
        routing: { prefixDefaultLocale: false }
    }
});
