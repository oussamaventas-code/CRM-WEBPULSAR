/** Tokens copiados del CRM (web/tailwind.config.js) para que la web y el CRM sean un mismo sistema. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F8FC',
        brand: { DEFAULT: '#2563EB', deep: '#173B72', ice: '#EAF3FF', light: '#60A5FA', 50: '#F3F8FF', 600: '#1D4FD7' },
        ink: { DEFAULT: '#172033', soft: '#718096', faint: '#A0AEC0' },
        line: '#E4EAF2',
        ok: { DEFAULT: '#16A36A', soft: '#E7F6EF' },
        warn: { DEFAULT: '#F59E0B', ink: '#B45309', soft: '#FEF5E3' },
        danger: { DEFAULT: '#E5484D', soft: '#FDECEC' },
        violet: { DEFAULT: '#8067E8', soft: '#F0EDFD' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { card: '22px', panel: '26px', field: '14px', section: '32px' },
      boxShadow: {
        glass: '0 1px 1px rgba(23,32,51,0.03), 0 8px 24px -8px rgba(23,59,114,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
        'glass-lg': '0 2px 4px rgba(23,32,51,0.04), 0 18px 40px -12px rgba(23,59,114,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
        float: '0 24px 60px -20px rgba(23,59,114,0.35), 0 2px 6px rgba(23,32,51,0.06)',
        focus: '0 0 0 4px rgba(37,99,235,0.14)',
      },
      maxWidth: { site: '1200px' },
      keyframes: {
        pulsering: { '0%': { transform: 'scale(.8)', opacity: '.6' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
      },
      animation: {
        pulsering: 'pulsering 2s cubic-bezier(.2,.6,.3,1) infinite',
      },
    },
  },
  plugins: [],
};
