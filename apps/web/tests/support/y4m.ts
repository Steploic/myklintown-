/**
 * Fabrique une « vidéo de caméra » Y4M montrant un QR code.
 *
 * Chromium lit ce fichier à la place de la caméra (--use-file-for-fake-video-
 * capture) : le scanner de l'application voit un vrai QR et le décode comme
 * sur le terrain. Les preuves photo/vidéo des tests sont capturées de ce flux.
 */
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

export function genererVideoQr(texte: string, fichier: string, largeur = 640, hauteur = 480) {
  const qr = QRCode.create(texte, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const marge = 4;
  const echelle = Math.floor(Math.min(largeur, hauteur) * 0.8 / (n + 2 * marge));
  const cote = (n + 2 * marge) * echelle;
  const x0 = Math.floor((largeur - cote) / 2);
  const y0 = Math.floor((hauteur - cote) / 2);

  // Plan de luminance : fond gris clair, zone QR blanche, modules noirs.
  const Y = Buffer.alloc(largeur * hauteur, 200);
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const r = Math.floor(y / echelle) - marge;
      const c = Math.floor(x / echelle) - marge;
      const noir = r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c);
      Y[(y0 + y) * largeur + (x0 + x)] = noir ? 16 : 235;
    }
  }
  const chroma = Buffer.alloc((largeur / 2) * (hauteur / 2), 128);
  const trame = Buffer.concat([Buffer.from('FRAME\n'), Y, chroma, chroma]);
  const entete = Buffer.from(`YUV4MPEG2 W${largeur} H${hauteur} F10:1 Ip A1:1 C420jpeg\n`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, Buffer.concat([entete, ...Array.from({ length: 10 }, () => trame)]));
}
