import {paintQrCode} from '@helpers/qrCode/paintQrCode';

/** The side of the code's bitmap. It is cut to the card's size by CSS, and by the exported picture, so one serves both. */
const QR_BITMAP_SIDE = 768;

let constructorPromise: Promise<any>;
const getQRCodeStyling = () => constructorPromise ??= import('qr-code-styling' as any).then((module) => module.default);

/** The code's modules, row by row: which hold ink. What the open's intro builds the code from. */
export type QrModules = {count: number, dark: boolean[]};

/** The code drawn, the link it was drawn for, and its modules */
export type RenderedQr = {canvas: HTMLCanvasElement, url: string, modules?: QrModules};

/** The modules the drawing was made of, read off the library's encoder once it has drawn */
function readModules(qrCode: any): QrModules | undefined {
  const qr = qrCode?._qr;
  const count: number = qr?.getModuleCount?.();
  if(!count) return;
  const dark: boolean[] = [];
  for(let row = 0; row < count; ++row) {
    for(let col = 0; col < count; ++col) {
      dark.push(!!qr.isDark(row, col));
    }
  }

  return {count, dark};
}

/** The code for a link, its dots and its logo in the ink, on nothing: the white is the card's */
export default async function renderQr(url: string, ink: string): Promise<RenderedQr | undefined> {
  const QRCodeStylingCtor = await getQRCodeStyling();
  const host = document.createElement('div');
  const {qrCode} = await paintQrCode({
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
  if(canvas instanceof HTMLCanvasElement) return {canvas, url, modules: readModules(qrCode)};
}
