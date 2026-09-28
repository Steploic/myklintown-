'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ label = 'Imprimer' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary no-print">
      <Printer size={16} /> {label}
    </button>
  );
}
