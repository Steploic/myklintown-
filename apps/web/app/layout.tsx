import type { Metadata, Viewport } from 'next';
import { Barlow } from 'next/font/google';
import './globals.css';
import { BarreNavigation } from '@/components/ui/barre-navigation';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MyKlinTown — La collecte des déchets, enfin simple et fiable',
    template: '%s · MyKlinTown',
  },
  description:
    "La plateforme qui réunit précollecteurs de déchets et abonnés : demandes de devis, tournées, factures, relances et preuves de passage. Lancement officiel en décembre 2026.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'MyKlinTown',
    description: 'La collecte des déchets, enfin simple et fiable pour tous.',
    images: ['/brand/icon-512.png'],
    type: 'website',
    locale: 'fr_FR',
  },
  icons: {
    icon: [{ url: '/brand/favicon-48.png', sizes: '48x48' }, { url: '/brand/icon-192.png', sizes: '192x192' }],
    apple: '/brand/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0B1E3B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={barlow.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <BarreNavigation />
        {children}
      </body>
    </html>
  );
}
