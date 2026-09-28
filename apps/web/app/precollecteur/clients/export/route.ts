import { NextResponse } from 'next/server';
import { getSupabase, rows } from '@/lib/server';
import { statutAbonnement } from '@/lib/format';
import type { ClientStatut } from '@/lib/types';

/** Export CSV des clients (ouvrable dans Excel : séparateur « ; », BOM UTF-8). */
export async function GET() {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));

  // La RLS limite d'elle-même la lecture aux clients de l'entreprise du compte.
  const { data } = await supabase.from('v_clients_statut').select('*').order('nom');
  const clients = rows<ClientStatut>(data);

  const entetes = ['Code', 'Nom', 'Téléphone', 'Quartier', 'Adresse', 'Zone', 'Formule', 'Statut', 'Abonnement', 'Couvert jusqu’au', 'Reste dû (FCFA)'];
  const echapper = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lignes = clients.map((c) =>
    [c.code, c.nom, c.telephone, c.quartier, c.adresse, c.zone_nom, c.plan_nom, c.statut, statutAbonnement(c.statut_abonnement).label, c.couverture_fin, c.montant_impaye]
      .map(echapper)
      .join(';'),
  );
  const csv = '﻿' + [entetes.join(';'), ...lignes].join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clients-myklintown-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
