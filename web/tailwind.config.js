/** @type {import('tailwindcss').Config} */
// Los colores salen de variables CSS (canales RGB) definidas en src/styles.css: así `bg-brand-ice/70`
// y el resto de modificadores de opacidad funcionan igual en modo claro y oscuro.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: c('canvas'),
        surface: c('surface'),
        track: c('track'),
        brand: { DEFAULT: c('brand'), deep: c('brand-deep'), ice: c('brand-ice'), light: c('brand-light'), 50: c('brand-50'), 600: c('brand-600') },
        ink: { DEFAULT: c('ink'), soft: c('ink-soft'), faint: c('ink-faint') },
        line: c('line'),
        ok: { DEFAULT: c('ok'), soft: c('ok-soft'), ink: c('ok-ink') },
        warn: { DEFAULT: c('warn'), ink: c('warn-ink'), soft: c('warn-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft'), ink: c('danger-ink') },
        violet: { DEFAULT: c('violet'), soft: c('violet-soft'), ink: c('violet-ink') },
        mute: { DEFAULT: c('mute'), soft: c('mute-soft') },
        series: { collected: '#2563EB', pending: '#D97706', expenses: '#8067E8', profit: '#0D9488' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { card: '22px', panel: '26px', field: '14px' },
      boxShadow: {
        glass: '0 1px 1px rgba(23,32,51,0.03), 0 8px 24px -8px rgba(23,59,114,0.10), inset 0 1px 0 rgb(var(--c-hi) / 0.8)',
        'glass-lg': '0 2px 4px rgba(23,32,51,0.04), 0 18px 40px -12px rgba(23,59,114,0.18), inset 0 1px 0 rgb(var(--c-hi) / 0.9)',
        float: '0 24px 60px -20px rgba(23,59,114,0.35), 0 2px 6px rgba(23,32,51,0.06)',
        focus: '0 0 0 4px rgb(var(--c-brand) / 0.14)',
      },
      transitionDuration: { 250: '250ms' },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        pulsering: { '0%': { transform: 'scale(.8)', opacity: '.6' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
        pulsering: 'pulsering 2s cubic-bezier(.2,.6,.3,1) infinite',
      },
    },
  },
  plugins: [],
};
