/**
 * « Le serveur répond-il ? » — sans base, sans compte, sans donnée. Le terrain
 * s'en sert avant de relire une page (lib/hors-ligne/client.ts) : sans
 * réseau, une relecture ratée ferait recharger toute la page.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
