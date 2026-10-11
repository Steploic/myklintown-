/**
 * Export CSV ouvrable dans Excel (séparateur « ; », BOM UTF-8).
 *
 * Injection de formules : un texte saisi par un tiers (nom de ménage,
 * quartier, nom d'entreprise…) qui commence par =, +, -, @, une tabulation ou
 * un retour chariot serait EXÉCUTÉ par Excel à l'ouverture du fichier
 * (lien piégé, commande DDE). Ces cellules sont préfixées d'une apostrophe,
 * qu'Excel n'affiche pas. Les nombres restent des nombres.
 */
export function celluleCsv(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function documentCsv(entetes: string[], lignes: unknown[][]): string {
  return '﻿' + [entetes.map(celluleCsv).join(';'), ...lignes.map((l) => l.map(celluleCsv).join(';'))].join('\r\n');
}
