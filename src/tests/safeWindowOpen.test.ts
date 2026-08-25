import safeWindowOpen from '@helpers/dom/safeWindowOpen';

describe('safeWindowOpen', () => {
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
    delete (window as any).showMaskedAlert;
  });

  afterEach(() => {
    open.mockRestore();
    delete (window as any).showMaskedAlert;
  });

  test('opens an ordinary url untouched', () => {
    safeWindowOpen('https://example.com/path?a=1');

    expect(open).toHaveBeenCalledWith('https://example.com/path?a=1', '_blank', 'noreferrer');
  });

  test('makes a scheme-less url https', () => {
    safeWindowOpen('example.com/path');

    expect(open).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noreferrer');
  });

  // the url reaches here off the wire — a keyboard button, a web app event — and window.open()
  // would run a javascript: payload on this origin
  test('does not open a javascript: url', () => {
    safeWindowOpen('javascript:alert(document.domain)');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).not.toMatch(/^javascript:/);
  });

  test('confirms a lookalike host instead of opening it', () => {
    const showMaskedAlert = vi.fn();
    (window as any).showMaskedAlert = showMaskedAlert;

    safeWindowOpen('https://аррӏе.com');

    expect(open).not.toHaveBeenCalled();
    expect(showMaskedAlert).toHaveBeenCalledTimes(1);
  });
});
