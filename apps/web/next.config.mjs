/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le lint ne doit pas bloquer le déploiement (Vercel installe sans build scripts).
  // Le type-checking TypeScript reste actif et bloque en cas de vraie erreur.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@myklintown/ui', '@myklintown/db', '@myklintown/types'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' },
    ],
  },
};

export default nextConfig;
