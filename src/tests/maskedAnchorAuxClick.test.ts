import {listenForMaskedAnchorAuxClicks} from '@helpers/addAnchorListener';

describe('masked anchor aux click', () => {
  let showMaskedAlert: ReturnType<typeof vi.fn>;

  const auxClick = (element: Element, button = 1) => {
    const event = new MouseEvent('auxclick', {bubbles: true, cancelable: true, button});
    element.dispatchEvent(event);
    return event;
  };

  const makeAnchor = (attributes: Record<string, string>) => {
    const anchor = document.createElement('a');
    anchor.href = 'https://evil.example/login';
    anchor.target = '_blank';
    anchor.textContent = 'https://telegram.org';
    for(const name in attributes) anchor.setAttribute(name, attributes[name]);
    document.body.append(anchor);
    return anchor;
  };

  beforeAll(() => {
    listenForMaskedAnchorAuxClicks();
  });

  beforeEach(() => {
    showMaskedAlert = vi.fn();
    (window as any).showMaskedAlert = showMaskedAlert;
  });

  afterEach(() => {
    delete (window as any).showMaskedAlert;
    document.body.replaceChildren();
  });

  test('asks before a middle click opens a masked link', () => {
    const anchor = makeAnchor({onclick: 'showMaskedAlert(this)'});

    const event = auxClick(anchor);

    expect(showMaskedAlert).toHaveBeenCalledTimes(1);
    expect(showMaskedAlert.mock.calls[0][0]).toBe(anchor);
    expect(event.defaultPrevented).toBe(true);
  });

  // a web-page box keeps the same handler in its dataset instead of an inline attribute
  test('asks before a middle click opens a masked web-page box', () => {
    const box = makeAnchor({'data-callback': 'showMaskedAlert'});

    const event = auxClick(box);

    expect(showMaskedAlert).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  test('leaves a plain link to the browser', () => {
    const event = auxClick(makeAnchor({}));

    expect(showMaskedAlert).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // the alert names `anchor.href`, so it must not answer for a link the user did not click
  test('leaves a plain link nested in a masked box to the browser', () => {
    const box = makeAnchor({'data-callback': 'showMaskedAlert'});
    const nested = document.createElement('a');
    nested.href = 'https://telegram.org';
    box.append(nested);

    const event = auxClick(nested);

    expect(showMaskedAlert).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores a right click, which opens no tab of its own', () => {
    auxClick(makeAnchor({onclick: 'showMaskedAlert(this)'}), 2);

    expect(showMaskedAlert).not.toHaveBeenCalled();
  });

  // hidden links (a non-contact's message) are swallowed before this listener runs
  test('keeps its hands off an already cancelled click', () => {
    const anchor = makeAnchor({onclick: 'showMaskedAlert(this)'});
    anchor.addEventListener('auxclick', (e) => e.preventDefault());

    auxClick(anchor);

    expect(showMaskedAlert).not.toHaveBeenCalled();
  });
});
