import { NextResponse } from 'next/server';
import { appelPlanifieValide } from '@/lib/paiement/fournisseur';
import { rapprocherPaiements } from '@/lib/paiement/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Rapprochement quotidien des paiements en ligne (tâche planifiée de Vercel,
 * déclarée dans vercel.json ; production seulement). Les demandes des
 * dernières 48 h restées en cours ou notées expirées sont revérifiées chez
 * Notch Pay : un paiement validé dont la notification s'est perdue est
 * enregistré.
 *
 * Fermé sans la variable CRON_SECRET (Vercel l'envoie alors en
 * « Authorization: Bearer … » à chaque appel planifié).
 */
export async function GET(request: Request) {
  if (!appelPlanifieValide(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const bilan = await rapprocherPaiements();
    if (!bilan) return NextResponse.json({ ok: true, actif: false });
    // Des vérifications inachevées : la tâche paraît en échec dans Vercel, elle sera rejouée demain.
    return NextResponse.json({ ok: bilan.inacheves === 0, actif: true, ...bilan }, { status: bilan.inacheves ? 500 : 200 });
  } catch (e) {
    console.error('Rapprochement des paiements en ligne', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
