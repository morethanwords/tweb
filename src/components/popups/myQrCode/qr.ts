import {paintQrCode} from '@helpers/qrCode/paintQrCode';

/** The side of the code's bitmap. It is cut to the card's size by CSS, and by the exported picture, so one serves both. */
const QR_BITMAP_SIDE = 768;

let constructorPromise: Promise<any>;
const getQRCodeStyling = () => constructorPromise ??= import('qr-code-styling' as any).then((module) => module.default);

/** The code for a link, its dots and its logo in the ink, on nothing: the white is the card's */
export default async function renderQr(url: string, ink: string): Promise<HTMLCanvasElement | undefined> {
  const QRCodeStylingCtor = await getQRCodeStyling();
  const host = document.createElement('div');
  await paintQrCode({
    data: url,
    size: QR_BITMAP_SIDE,
    pixelRatio: 1,
    host,
    background: 'rgba(0,0,0,0)',
    foreground: ink,
    logoColor: ink,
    QRCodeStylingCtor
  });

  const canvas = host.lastChild;
  if(canvas instanceof HTMLCanvasElement) return canvas;
}
