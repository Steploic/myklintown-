/**
 * En-têtes de sécurité, sur toutes les pages.
 *   • Aucune page ne s'affiche dans le cadre d'un autre site (« clickjacking » :
 *     un site piège superpose un faux bouton sur « Encaisser » ou « Valider »).
 *   • Le navigateur ne devine pas le type d'un fichier (un « .jpg » qui
 *     contiendrait du HTML n'est jamais exécuté comme une page).
 *   • Caméra, micro (vidéo de preuve) et position : seulement pour ce site.
 *   • HTTPS imposé pendant deux ans.
 * Pas de Content-Security-Policy complète sur les scripts : Next.js injecte des
 * scripts en ligne, il faudrait un nonce par requête (chantier à part).
 */
const ENTETES_SECURITE = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Les tests navigateur construisent l'appli branchée sur la base de TEST dans
  // un dossier à part : le build habituel (.next) n'est jamais écrasé.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Ne pas annoncer « Next.js » dans chaque réponse.
  poweredByHeader: false,
  // Le lint ne doit pas bloquer le déploiement (Vercel installe sans build scripts).
  // Le type-checking TypeScript reste actif et bloque en cas de vraie erreur.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@myklintown/ui', '@myklintown/db', '@myklintown/types'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Pas d'images distantes : l'application n'utilise pas next/image. L'ancienne
  // liste autorisait « **.supabase.co » — n'importe quel projet Supabase, donc
  // des images choisies par un tiers passées dans notre optimiseur.
  async headers() {
    return [{ source: '/:path*', headers: ENTETES_SECURITE }];
  },
  // Portails de démonstration retirés (Collecteur, Partenaire B2B) : un ancien
  // lien ou favori mène à l'accueil plutôt qu'à une page introuvable.
  // Redirection temporaire : rien n'empêche de rouvrir un jour ces adresses.
  async redirects() {
    return [
      { source: '/collecteur/:path*', destination: '/', permanent: false },
      { source: '/enterprise/:path*', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
