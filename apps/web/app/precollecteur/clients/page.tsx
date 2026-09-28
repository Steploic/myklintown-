import Link from 'next/link';
import { Download, Search, UserPlus, Users } from 'lucide-react';
import { cn } from '@myklintown/ui';
import { PrecoShell } from '@/components/precollecteur/shell';
import { EmptyState, PageHeader } from '@/components/ui/blocks';
import { requireEntreprise } from '@/lib/precollecteur/context';
import { rows } from '@/lib/server';
import { dateFr, fcfa, statutAbonnement, telLisible } from '@/lib/format';
import type { ClientStatut } from '@/lib/types';

export const metadata = { title: 'Clients' };

const FILTRES = [
  { cle: 'tous', label: 'Tous' },
  { cle: 'a_jour', label: 'À jour' },
  { cle: 'echeance', label: 'Échéance proche' },
  { cle: 'impaye', label: 'Impayés' },
  { cle: 'demande', label: 'Demandes' },
  { cle: 'inactifs', label: 'Suspendus / résiliés' },
] as const;

function filtrer(c: ClientStatut, f: string) {
  switch (f) {
    case 'a_jour':
      return c.statut_abonnement === 'a_jour';
    case 'echeance':
      return ['echeance_proche', 'sans_facture', 'expire'].includes(c.statut_abonnement) && c.statut === 'actif';
    case 'impaye':
      return Number(c.nb_impayees) > 0;
    case 'demande':
      return c.statut === 'demande';
    case 'inactifs':
      return c.statut === 'suspendu' || c.statut === 'resilie';
    default:
      return c.statut !== 'resilie';
  }
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; q?: string }>;
}) {
  const { filtre = 'tous', q = '' } = await searchParams;
  const { supabase, entreprise } = await requireEntreprise();
  const { data } = await supabase
    .from('v_clients_statut')
    .select('*')
    .eq('entreprise_id', entreprise.id)
    .order('nom');
  const tous = rows<ClientStatut>(data);
  const recherche = q.trim().toLowerCase();
  const liste = tous
    .filter((c) => filtrer(c, filtre))
    .filter(
      (c) =>
        !recherche ||
        [c.nom, c.telephone, c.code, c.quartier].some((v) => v?.toLowerCase().includes(recherche)),
    );
  const compte = (f: string) => tous.filter((c) => filtrer(c, f)).length;

  return (
    <PrecoShell path="/precollecteur/clients">
      <PageHeader
        titre="Clients"
        sousTitre={`${tous.filter((c) => c.statut === 'actif').length} actifs sur ${tous.length} enregistrés`}
        actions={
          <>
            <a href="/precollecteur/clients/export" className="btn-outline">
              <Download size={16} /> Exporter
            </a>
            <Link href="/precollecteur/clients/nouveau" className="btn-primary">
              <UserPlus size={16} /> Nouveau client
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {FILTRES.map((f) => (
            <Link
              key={f.cle}
              href={`/precollecteur/clients?filtre=${f.cle}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={cn(
                'flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-body-sm font-semibold transition-colors',
                filtre === f.cle
                  ? 'border-brand-ink bg-brand-ink text-white'
                  : 'border-border bg-surface text-muted-foreground hover:text-brand-ink',
              )}
            >
              {f.label}
              <span className={cn('num text-small', filtre === f.cle ? 'text-white/70' : '')}>{compte(f.cle)}</span>
            </Link>
          ))}
        </div>
        <form className="relative lg:w-72" action="/precollecteur/clients">
          <input type="hidden" name="filtre" value={filtre} />
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Nom, téléphone, code…" className="field pl-9" aria-label="Rechercher un client" />
        </form>
      </div>

      {liste.length === 0 ? (
        <div className="card-soft">
          <EmptyState
            icon={Users}
            titre={tous.length ? 'Aucun client ne correspond' : 'Pas encore de client'}
            texte={tous.length ? 'Changez de filtre ou de recherche.' : 'Ajoutez les ménages que vous servez pour suivre leurs abonnements et leurs paiements.'}
            action={
              !tous.length && (
                <Link href="/precollecteur/clients/nouveau" className="btn-primary">
                  <UserPlus size={16} /> Ajouter un client
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Téléphone : cartes */}
          <ul className="space-y-2 md:hidden">
            {liste.map((c) => {
              const s = statutAbonnement(c.statut_abonnement);
              return (
                <li key={c.id}>
                  <Link href={`/precollecteur/clients/${c.id}`} className="card-soft flex items-center gap-3 p-3.5">
                    <span className={cn('h-10 w-1.5 shrink-0 rounded-full', {
                      'bg-terrain-ok': s.terrain === 'ok',
                      'bg-terrain-relance': s.terrain === 'relance',
                      'bg-terrain-stop': s.terrain === 'stop',
                      'bg-border': s.terrain === 'neutre',
                    })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-brand-ink">
                        {c.nom} {c.est_demo && <span className="chip-neutre ml-1">démo</span>}
                      </span>
                      <span className="block truncate text-small text-muted-foreground">
                        {[c.quartier, c.plan_nom].filter(Boolean).join(' · ') || c.code}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className={s.chip}>{s.label}</span>
                      {Number(c.montant_impaye) > 0 && (
                        <span className="num text-small font-semibold text-terrain-stop">{fcfa(c.montant_impaye)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Ordinateur : tableau */}
          <div className="card-soft hidden overflow-hidden md:block">
            <table className="table-data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Quartier · zone</th>
                  <th>Formule</th>
                  <th>Abonnement</th>
                  <th>Couvert jusqu’au</th>
                  <th className="text-right">Reste dû</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((c) => {
                  const s = statutAbonnement(c.statut_abonnement);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/precollecteur/clients/${c.id}`} className="font-semibold text-brand-ink hover:text-brand-green">
                          {c.nom}
                        </Link>
                        {c.est_demo && <span className="chip-neutre ml-2">démo</span>}
                        <span className="block text-small text-muted-foreground">
                          {c.code} · {telLisible(c.telephone)}
                        </span>
                      </td>
                      <td className="text-muted-foreground">
                        {c.quartier ?? '—'}
                        {c.zone_nom && <span className="block text-small">{c.zone_nom}</span>}
                      </td>
                      <td>{c.plan_nom ?? '—'}</td>
                      <td><span className={s.chip}>{s.label}</span></td>
                      <td className="num text-muted-foreground">{dateFr(c.couverture_fin)}</td>
                      <td className={cn('num text-right font-semibold', Number(c.montant_impaye) > 0 ? 'text-terrain-stop' : 'text-muted-foreground')}>
                        {Number(c.montant_impaye) > 0 ? fcfa(c.montant_impaye) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PrecoShell>
  );
}
