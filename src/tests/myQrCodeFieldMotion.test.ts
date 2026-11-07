import {afterEach, describe, expect, it, vi} from 'vitest';
import {setAppWindow} from '@helpers/appWindow';
import attachFieldMotion from '@components/popups/myQrCode/fieldMotion';

vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => true}}));

const TILE = {surfaceWidth: 300, surfaceHeight: 500, canvasWidth: 400, canvasHeight: 600, periodWidth: 100, periodHeight: 100};

function press(target: EventTarget, view: Window & typeof globalThis) {
  const event = new view.MouseEvent('pointerdown', {clientX: 10, clientY: 10, button: 0, bubbles: true});
  Object.assign(event, {pointerId: 1, isPrimary: true});
  target.dispatchEvent(event);
}

describe('the QR field\'s drag', () => {
  afterEach(() => {
    setAppWindow(window);
    document.body.replaceChildren();
  });

  // * Document PiP: the app's window is switched before its DOM moves there, and back the same way
  it('follows the press in the window the screen stands in after the app has moved', async() => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const pip = iframe.contentWindow as Window & typeof globalThis;

    const surface = document.createElement('div');
    const mover = document.createElement('div');
    surface.append(mover);
    document.body.append(surface);
    const motion = attachFieldMotion(surface, mover, () => true);
    motion.update(TILE);

    setAppWindow(pip);
    pip.document.body.append(surface);
    await Promise.resolve();

    const inPip = vi.spyOn(pip, 'addEventListener');
    const inTab = vi.spyOn(window, 'addEventListener');
    press(surface, pip);
    expect(inPip.mock.calls.map(([type]) => type)).toContain('pointermove');
    expect(inTab.mock.calls.map(([type]) => type)).not.toContain('pointermove');

    // * and back in the tab
    setAppWindow(window);
    document.body.append(surface);
    await Promise.resolve();
    inPip.mockClear();
    inTab.mockClear();
    press(surface, window);
    expect(inTab.mock.calls.map(([type]) => type)).toContain('pointermove');
    expect(inPip.mock.calls.map(([type]) => type)).not.toContain('pointermove');

    motion.destroy();
  });
});
