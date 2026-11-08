import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Tailwind preset — Charte graphique MyKlinTown V3 (novembre 2026)
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
        // --- Marque (charte V3) ------------------------------------------
        brand: {
          // Charte V3 (logo d'octobre 2026) : le dégradé du logo, bleu pixel
          // #2563EB → turquoise #17B8A4 → vert feuille #5DC36C. Les teintes vives
          // sont des ACCENTS (fonds sombres, décor) : sous du texte blanc, le vert
          // et le turquoise du logo tombent à 2,2-2,5:1. Les teintes d'ACTION en
          // sont dérivées, plus sombres, à 4,5:1 au moins avec le texte blanc.
          ink: '#0B1E3B',       // Nuit — barres latérales, fonds sombres (16,6:1 avec le blanc)
          blue: {
            DEFAULT: '#2563EB', // Bleu pixel du logo — actions secondaires, liens (5,2:1)
            hover: '#1D4ED8',
            pixel: '#2563EB',   // alias historique (charte V2)
            clair: '#7FA6F5',   // texte et accents sur fond sombre (6,9:1 sur la nuit)
          },
          green: {
            DEFAULT: '#30823A', // Vert action — bouton principal, succès (4,8:1 avec le blanc)
            hover: '#276C30',
            light: '#5DC36C',   // = vert feuille du logo — badges, pastilles
            pale: '#E3F4E6',    // fonds
          },
          leaf: '#5DC36C',      // Vert feuille du logo — accents sur fond sombre (7,5:1 sur la nuit)
          teal: {
            DEFAULT: '#0E8574', // Turquoise foncé — icônes et graphiques sur fond clair (4,5:1)
            vif: '#17B8A4',     // Turquoise du logo — décor, dégradés
            clair: '#5ED6C3',   // accents sur fond sombre
          },
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
        ring: '#2563EB',

        // shadcn/ui aliases (pour réutiliser les composants directement)
        primary: {
          DEFAULT: '#2563EB',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#30823A',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#5DC36C',
          foreground: '#0B1E3B',
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
          DEFAULT: '#30823A',
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
        elevated: '0 10px 20px -4px rgba(11, 30, 59, 0.12)',
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
        // Dégradé signature du logo : bleu pixel → turquoise → vert feuille
        'brand-gradient': 'linear-gradient(135deg, #2563EB 0%, #17B8A4 55%, #5DC36C 100%)',
        'brand-gradient-ink': 'linear-gradient(160deg, #0B1E3B 0%, #0C3550 58%, #0E4A43 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(93, 195, 108, 0.06) 100%)',
      },
    },
  },
  plugins: [animate],
};

export default preset;
