import type { Metadata } from 'next';
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
    default: 'MyKlinTown — Digitalisation de la gestion des déchets',
    template: '%s · MyKlinTown',
  },
  description:
    "Plateforme de digitalisation de la chaîne de valeur de gestion des déchets pour la Mairie de Yaoundé III : suivi des ménages, optimisation des tournées, marketplace recycleurs.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'MyKlinTown',
    description: 'Digitalisation de la gestion des déchets — Yaoundé III',
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={barlow.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
