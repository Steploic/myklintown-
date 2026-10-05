'use client';

import { useState } from 'react';

/**
 * Volet repliable dont l'état appartient à l'utilisateur.
 *
 * Un `<details open={condition}>` rendu côté serveur se referme dès que la
 * condition change : ajouter son premier employé repliait le volet et cachait
 * le message de confirmation. Ici, `ouvertAuDepart` ne sert qu'au premier affichage.
 */
export function Volet({
  titre,
  ouvertAuDepart = false,
  className,
  classeTitre,
  children,
}: {
  titre: React.ReactNode;
  ouvertAuDepart?: boolean;
  className?: string;
  classeTitre?: string;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouvertAuDepart);
  return (
    <details
      className={className}
      open={ouvert}
      onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={classeTitre}>{titre}</summary>
      {children}
    </details>
  );
}
