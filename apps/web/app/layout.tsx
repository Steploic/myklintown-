import type { Metadata, Viewport } from 'next';
import { Barlow } from 'next/font/google';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MyKlinTown — Le logiciel des précollecteurs de déchets',
    template: '%s · MyKlinTown',
  },
  description:
    "Clients, abonnements, factures, relances, tournées et preuves de passage : l'outil des précollecteurs de déchets, pour les ménages et les mairies de Yaoundé.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'MyKlinTown',
    description: 'Le logiciel des précollecteurs de déchets — Yaoundé',
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
  themeColor: '#0D2438',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={barlow.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
