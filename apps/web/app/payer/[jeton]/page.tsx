import Link from 'next/link';
import { CheckCircle2, Receipt } from 'lucide-react';
import { Logo } from '@myklintown/ui';
import { PaiementMobile } from '@/components/paiement/paiement-mobile';
import { payerParLienAction } from '@/lib/paiement/actions';
import { paiementEnLigneDisponible, resteAPayer } from '@/lib/paiement/service';
import { clientService } from '@/lib/supabase-service';
import { row } from '@/lib/server';
import { dateFr, fcfa } from '@/lib/format';

export const metadata = { title: 'Payer ma facture', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Lien de paiement envoyé par le précollecteur (WhatsApp) : le ménage règle sa
 * facture par Mobile Money, sans compte. Le jeton du lien suffit.
 */
export default async function PayerParLien({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const admin = paiementEnLigneDisponible() ? clientService() : null;
  let contenu: React.ReactNode;

  if (!admin) {
    contenu = <Message titre="Paiement en ligne indisponible" texte="Réglez votre facture directement auprès de votre précollecteur." />;
  } else {
    const { data } = await admin.from('liens_paiement').select('facture_id, expire_at').eq('jeton', jeton).maybeSingle();
    const lien = row<{ facture_id: string; expire_at: string }>(data);
    const r = lien && new Date(lien.expire_at) > new Date() ? await resteAPayer(lien.facture_id) : null;
    if (!lien || !r) {
      contenu = <Message titre="Lien expiré ou inconnu" texte="Demandez un nouveau lien de paiement à votre précollecteur." />;
    } else if (r.facture.statut === 'payee' || r.reste <= 0) {
      contenu = (
        <div className="text-center">
          <CheckCircle2 size={40} className="mx-auto text-terrain-ok" />
          <h1 className="mt-3 text-h2">Facture réglée</h1>
          <p className="mt-1 text-body text-muted-foreground">La facture {r.facture.numero} est payée. Merci !</p>
        </div>
      );
    } else if (r.facture.entreprises?.paiement_statut !== 'actif') {
      contenu = <Message titre="Paiement en ligne indisponible" texte={`${r.facture.entreprises?.nom ?? 'Votre précollecteur'} n’accepte pas encore le paiement en ligne.`} />;
    } else {
      contenu = (
        <>
          <p className="text-small font-semibold uppercase tracking-wider text-brand-green">{r.facture.entreprises.nom}</p>
          <h1 className="mt-1 text-h2">Payer ma facture</h1>
          <dl className="mt-4 space-y-1 rounded-lg bg-muted/60 p-4 text-body-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Client</dt><dd className="font-semibold">{r.facture.clients?.nom}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Facture</dt><dd className="num">{r.facture.numero}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lien valable jusqu’au</dt><dd>{dateFr(lien.expire_at)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="font-semibold">À payer</dt><dd className="num text-h2-sm font-bold text-brand-ink">{fcfa(r.reste)}</dd></div>
          </dl>
          <div className="mt-5">
            <PaiementMobile montant={r.reste} demander={payerParLienAction.bind(null, jeton)} />
          </div>
          <p className="mt-4 text-small text-muted-foreground">
            Paiement sécurisé par Notch Pay. L’argent est versé à {r.facture.entreprises.nom} ; vous validez avec le code
            secret de votre compte Mobile Money.
          </p>
        </>
      );
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-4 py-10">
      <div className="card-soft w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="mb-6 inline-flex" aria-label="MyKlinTown">
          <Logo size={34} />
        </Link>
        {contenu}
      </div>
    </div>
  );
}

function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="text-center">
      <Receipt size={36} className="mx-auto text-muted-foreground" />
      <h1 className="mt-3 text-h2">{titre}</h1>
      <p className="mt-1 text-body text-muted-foreground">{texte}</p>
    </div>
  );
}
