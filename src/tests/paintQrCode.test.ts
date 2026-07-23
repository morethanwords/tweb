import {paintQrCode} from '@helpers/qrCode/paintQrCode';

describe('paintQrCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for the current qr-code-styling canvas promise', async() => {
    vi.stubGlobal('fetch', vi.fn(async() => ({
      text: async() => '<svg style="fill:#000;"></svg>'
    })));

    class QRCodeStylingStub {
      public _canvasDrawingPromise = Promise.resolve();

      public append(host: HTMLElement) {
        host.append(document.createElement('canvas'));
      }
    }

    const host = document.createElement('div');
    const result = await paintQrCode({
      data: 'test',
      size: 128,
      host,
      background: '#fff',
      foreground: '#000',
      logoColor: '#123456',
      QRCodeStylingCtor: QRCodeStylingStub
    });

    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.parentElement).toBe(host);
  });
});
