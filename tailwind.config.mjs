/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');
const defaultTheme = require('tailwindcss/defaultTheme');
const fs = require('fs');

const noiseBitmap = fs.readFileSync('./src/assets/noise.png', { encoding: 'base64' });
const noiseDataUri = 'data:image/png;base64,' + noiseBitmap;

export default {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: {
            backgroundImage: {
                // A faint workshop texture over the base colour, rather than a flat fill.
                'workshop-grain': `radial-gradient(120% 90% at 50% 0%, rgba(245,165,36,0.10), rgba(15,19,24,0) 60%), url('${noiseDataUri}')`
            },
            colors: {
                neutral: colors.neutral,
                brass: {
                    50: '#FEF6E7',
                    100: '#FDEBC6',
                    200: '#FBD68C',
                    300: '#F8BF4F',
                    400: '#F5A524',
                    500: '#DC8709',
                    600: '#B06806',
                    700: '#7E4A08',
                    800: '#54320B',
                    900: '#2E1C07'
                },
                graphite: {
                    50: '#F3F5F7',
                    100: '#E2E6EB',
                    200: '#C3CAD4',
                    300: '#97A2B1',
                    400: '#69768A',
                    500: '#4A5668',
                    600: '#333D4C',
                    700: '#242C38',
                    800: '#171D26',
                    900: '#0F1318',
                    950: '#0A0D11'
                }
            },
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans]
            },
            maxWidth: {
                prose: '68ch'
            }
        }
    },
    daisyui: {
        themes: [
            {
                kakas: {
                    primary: '#F5A524',
                    'primary-content': '#241503',
                    secondary: '#2DD4BF',
                    'secondary-content': '#04231F',
                    accent: '#F97316',
                    'accent-content': '#2A1103',
                    neutral: '#1F2630',
                    'neutral-content': '#E6E9EE',
                    'base-100': '#0F1318',
                    'base-200': '#161B22',
                    'base-300': '#242C38',
                    'base-content': '#E6E9EE',
                    info: '#38BDF8',
                    'info-content': '#04212F',
                    success: '#34D399',
                    'success-content': '#042A1D',
                    warning: '#FBBF24',
                    'warning-content': '#2A1E03',
                    error: '#F87171',
                    'error-content': '#2C0808',
                    '--rounded-box': '0.75rem',
                    '--rounded-btn': '0.5rem'
                }
            }
        ]
    },
    plugins: [require('daisyui')]
};
