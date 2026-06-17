import type { Config } from 'tailwindcss'

// Mirrors the desktop app's tailwind.config.ts (root of the repo) token-for-token, so this
// web dashboard looks like the same product, not a separate generic admin theme. If the
// desktop theme changes, copy the `theme.extend` block over here too.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#004f96',
        'on-primary': '#ffffff',
        'primary-container': '#0067c0',
        'on-primary-container': '#dbe7ff',
        'primary-fixed': '#d5e3ff',
        'primary-fixed-dim': '#a6c8ff',
        'on-primary-fixed': '#001c3b',
        'on-primary-fixed-variant': '#004787',
        'inverse-primary': '#a6c8ff',
        secondary: '#735c00',
        'on-secondary': '#ffffff',
        'secondary-container': '#fed65b',
        'on-secondary-container': '#745c00',
        'secondary-fixed': '#ffe088',
        'secondary-fixed-dim': '#e9c349',
        'on-secondary-fixed': '#241a00',
        'on-secondary-fixed-variant': '#574500',
        tertiary: '#17575c',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#357075',
        'on-tertiary-container': '#b6f1f7',
        'tertiary-fixed': '#b1edf2',
        'tertiary-fixed-dim': '#96d1d6',
        'on-tertiary-fixed': '#002022',
        'on-tertiary-fixed-variant': '#074f54',
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        surface: '#f8f9ff',
        'surface-dim': '#cbdbf5',
        'surface-bright': '#f8f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#eff4ff',
        'surface-container': '#e5eeff',
        'surface-container-high': '#dce9ff',
        'surface-container-highest': '#d3e4fe',
        'on-surface': '#0b1c30',
        'on-surface-variant': '#414752',
        'inverse-surface': '#213145',
        'inverse-on-surface': '#eaf1ff',
        'surface-variant': '#d3e4fe',
        'surface-tint': '#005eb1',
        outline: '#717783',
        'outline-variant': '#c1c6d4',
        background: '#f8f9ff',
        'on-background': '#0b1c30',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
        full: '0.75rem',
      },
      spacing: {
        'sidebar-width': '260px',
        'container-padding': '2rem',
        gutter: '1rem',
        'card-gap': '1.5rem',
        'compact-row': '0.5rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['44px', { lineHeight: '52px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        'tabular-nums': ['16px', { lineHeight: '24px', fontWeight: '500' }],
      },
      boxShadow: {
        glass: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
        'glass-hover': '0 10px 15px -3px rgba(0,0,0,0.08)',
        'glass-elevated': '0 10px 15px -3px rgba(0,0,0,0.1)',
        primary: '0 4px 14px rgba(0,79,150,0.2)',
      },
      backgroundImage: {
        mica: 'radial-gradient(at 0% 0%, rgba(213,227,255,0.4) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(254,214,91,0.15) 0px, transparent 50%)',
        'gold-gradient': 'linear-gradient(135deg, #D4AF37 0%, #F1D279 100%)',
      },
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}

export default config
