import Link from 'next/link';
import { ArrowLeft, KeyRound, Send } from 'lucide-react';
import { Logo } from '@myklintown/ui';

export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-gradient-soft px-6">
      <div className="card-soft w-full max-w-md p-8">
        <Logo size={40} />
        <div className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
          <KeyRound size={22} />
        </div>
        <h1 className="mt-4">Mot de passe oublié</h1>
        <p className="mt-1 text-body text-muted-foreground">
          Saisissez votre adresse e-mail ou numéro de téléphone. Vous recevrez un lien sécurisé pour
          en définir un nouveau.
        </p>
        <form className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="identifier" className="text-body-sm font-medium">
              E-mail ou téléphone
            </label>
            <input
              id="identifier"
              type="text"
              placeholder="vous@exemple.cm ou +237 6 ..."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            <Send size={16} /> Envoyer le lien
          </button>
        </form>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-body-sm text-brand-blue hover:underline">
          <ArrowLeft size={14} /> Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
