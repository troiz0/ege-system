/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn-токены (obsidian + acid lime)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        // OBSIDIAN — глубокий космический черный (legacy-ключи сохранены,
        // чтобы старые экраны автоматически переехали на новую палитру)
        navy: {
          950: '#09090b',
          900: '#0a0a0e',
          800: '#121218',
        },
        graphite: {
          950: '#09090b',
          900: '#0a0a0e',
          800: '#121218',
        },
        slate: {
          950: '#09090b',
          900: '#0a0a0c', // поверхность карточек
          800: '#121217', // инпуты, повышенный слой
          700: '#1d1d23',
          600: '#3a3a44',
          500: '#6b6b78',
          400: '#9c9ca8', // приглушённый body-текст
          300: '#c9c9d2',
          200: '#e4e4ea',
          100: '#f2f2f0', // основной текст
        },
        // ЕДИНСТВЕННЫЙ акцент — acid lime #d4ff00 (legacy cyan-ключи маппятся на лайм)
        cyan: {
          200: '#f0ffb8',
          300: '#e4ff70',
          400: '#d4ff00',
          500: '#d4ff00',
          600: '#a8cc00',
          700: '#7d9900',
        },
        electric: {
          cyan: '#d4ff00',
          sky: '#e4ff70',
          teal: '#d4ff00',
        },
        lime: {
          acid: '#d4ff00',
        },
        warm: {
          orange: '#d4ff00',
          brass: '#C9A24B',
          gold: '#d4ff00',
        },
      },
      fontFamily: {
        // Display — Syne (акцидентный гигант)
        display: ['Syne', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        // Technical HUD — JetBrains Mono
        mono: ['JetBrains Mono', 'Space Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'card': '0px',
        'button': '0px',
        'input': '0px',
      },
      spacing: {
        '18': '4.5rem',
      },
      boxShadow: {
        'card': 'none',
        'glow': 'none',
        'rim': 'none',
        'none': 'none',
      },
      keyframes: {
        'alert-in': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.96)' },
          '60%': { opacity: '1', transform: 'translateY(-2px) scale(1.01)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'alert-out': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-8px) scale(0.97)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'alert-in': 'alert-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'alert-out': 'alert-out 0.3s ease-in both',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        marquee: 'marquee 28s linear infinite',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
      },
    },
  },
  plugins: [],
}
