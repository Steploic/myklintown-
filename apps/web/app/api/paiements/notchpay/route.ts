import { NextResponse } from 'next/server';
import { signatureValide } from '@/lib/paiement/fournisseur';
import { traiterNotification } from '@/lib/paiement/service';

/**
 * Notifications Notch Pay (paiement réussi, échoué, annulé, expiré).
 * À déclarer chez Notch Pay : Settings → Webhooks →
 *   https://myklintown-web.vercel.app/api/paiements/notchpay
 *
 * La signature (HMAC SHA-256 du corps brut, en-tête x-notch-signature) est
 * vérifiée avant tout ; le statut est ensuite revérifié auprès de Notch Pay
 * lui-même avant d'enregistrer un paiement.
 */
export async function POST(request: Request) {
  const corps = await request.text();
  if (!signatureValide(corps, request.headers.get('x-notch-signature'), process.env.NOTCHPAY_WEBHOOK_HASH)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let evenement: { type?: string; event?: string; data?: Record<string, unknown> };
  try {
    evenement = JSON.parse(corps);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await traiterNotification({ type: evenement.type ?? evenement.event, data: evenement.data });
  return NextResponse.json({ ok: true });
}
