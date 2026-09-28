import QRCode from 'qrcode';

/**
 * Vrai QR code (SVG) encodant le code client `MKT-XXXXXXXX`.
 * Généré côté serveur : aucune dépendance au navigateur, imprimable tel quel.
 * C'est lui que le précollecteur scanne à chaque passage.
 */
export async function qrSvg(code: string): Promise<string> {
  return QRCode.toString(code, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0D2438', light: '#FFFFFF' },
  });
}
