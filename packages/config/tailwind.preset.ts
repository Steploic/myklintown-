import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Tailwind preset — Charte Graphique MyKlinTown V1.0
 *
 * Importé par chaque app/package qui consomme Tailwind.
 * Toute évolution de la charte se reflète automatiquement partout.
 */
const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // --- Brand (charte V1.0) -----------------------------------------
        brand: {
          // Charte V2 (pivot précollecteurs, sept. 2026) — tirée du dégradé du
          // logo : bleu « pixels » → sarcelle → vert feuille.
          ink: '#0D2438',       // Nuit — barres latérales, fonds sombres
          blue: {
            DEFAULT: '#1B3F63', // Bleu Primaire — Confiance
            hover: '#1F4F7A',   // Bleu Secondaire — hover
            pixel: '#2B6CB0',   // Bleu des pixels du logo — accents
          },
          green: {
            DEFAULT: '#3E9A5E', // Vert Primaire — action, succès (AA sur blanc en gras)
            light: '#7BC28A',   // Vert Clair — badges
            pale: '#DDF0E2',    // Vert Très Clair — fonds
          },
          leaf: '#79C267',      // Vert feuille du logo — accents sur fond sombre
          teal: '#2E7F8E',      // Sarcelle — graphiques secondaires
        },

        // Code terrain, lisible au soleil : servir / relancer / ne pas servir.
        terrain: {
          ok: '#1F8A4C',
          relance: '#B86E00',
          stop: '#C8372D',
        },

        // --- Interface ----------------------------------------------------
        // Le token "background" et "foreground" suivent la convention shadcn/ui
        // pour rester compatible avec ses composants out-of-the-box.
        background: '#F4F7F5',
        foreground: '#1A2330',
        muted: {
          DEFAULT: '#EDF1EF',
          foreground: '#5B6673',
        },
        surface: '#FFFFFF',
        border: '#DDE4E1',
        input: '#CBD5D1',
        ring: '#1B3F63',

        // shadcn/ui aliases (pour réutiliser les composants directement)
        primary: {
          DEFAULT: '#1B3F63',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#4FA36A',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#7BC28A',
          foreground: '#222222',
        },
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#222222',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#222222',
        },

        // --- Sémantique ---------------------------------------------------
        danger: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        destructive: {
          // alias shadcn
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        warning: {
          DEFAULT: '#F59E0B',
          foreground: '#222222',
        },
        success: {
          DEFAULT: '#3E9A5E',
          foreground: '#FFFFFF',
        },
      },

      fontFamily: {
        // Barlow est la police unique du projet — chargée via next/font/google
        // dans apps/web/app/layout.tsx et exposée via la variable CSS --font-barlow.
        sans: ['var(--font-barlow)', 'Barlow', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        // Hiérarchie typographique de la charte
        'h1': ['2rem', { lineHeight: '2.5rem', fontWeight: '700' }],       // 32px Bold
        'h1-sm': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],    // 24px Bold
        'h2': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],   // 20px SemiBold
        'h2-sm': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],// 18px SemiBold
        'body': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],     // 16px Regular
        'body-sm': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }], // 14px Regular
        'small': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],   // 12px Medium
      },

      borderRadius: {
        // Charte : cartes 12-16px (xl), boutons 8px (md)
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },

      boxShadow: {
        // Ombre douce de la charte : les cartes "lévitent légèrement"
        soft: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        elevated: '0 10px 20px -4px rgba(27, 63, 99, 0.12)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },

      backgroundImage: {
        // Dégradé signature du logo : bleu profond → vert clair
        'brand-gradient': 'linear-gradient(135deg, #1B3F63 0%, #2E7F8E 55%, #3E9A5E 100%)',
        'brand-gradient-ink': 'linear-gradient(160deg, #0D2438 0%, #123A4F 60%, #15503F 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(27, 63, 99, 0.06) 0%, rgba(79, 163, 106, 0.06) 100%)',
      },
    },
  },
  plugins: [animate],
};

export default preset;
