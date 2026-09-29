import OverlayClickHandler from '@helpers/overlayClickHandler';
import '@/tests/helpers/a11yLayer';

// a desktop pointer: overlays close on `click` (a touch device listens to `mousedown`)
vi.mock('@environment/touchSupport', () => ({default: false}));

describe('OverlayClickHandler', () => {
  // a toast hides on the next click anywhere; a keyboard press is aimed at the focused control
  // and must still reach it, or a keyboard user loses the press that follows every toast
  test('an overlay that only informs closes on a keyboard press and lets it through', () => {
    const toast = document.createElement('div');
    const button = document.createElement('button');
    document.body.append(toast, button);
    const handler = new OverlayClickHandler(undefined, false, true);
    const toggles: boolean[] = [];
    handler.addEventListener('toggle', (open) => void toggles.push(open));

    handler.open(toast);
    const keyboardPress = new MouseEvent('click', {bubbles: true, cancelable: true, detail: 0});
    button.dispatchEvent(keyboardPress);
    expect(keyboardPress.defaultPrevented).toBe(false);
    expect(toggles).toEqual([true, false]);

    // a pointer click is still the one that only closes it
    handler.open(toast);
    const pointerClick = new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1});
    button.dispatchEvent(pointerClick);
    expect(pointerClick.defaultPrevented).toBe(true);
    expect(toggles).toEqual([true, false, true, false]);

    toast.remove();
    button.remove();
  });

  test('any other overlay still takes the press that closes it', () => {
    const menu = document.createElement('div');
    const button = document.createElement('button');
    document.body.append(menu, button);
    const handler = new OverlayClickHandler();

    handler.open(menu);
    const keyboardPress = new MouseEvent('click', {bubbles: true, cancelable: true, detail: 0});
    button.dispatchEvent(keyboardPress);
    expect(keyboardPress.defaultPrevented).toBe(true);

    menu.remove();
    button.remove();
  });
});
