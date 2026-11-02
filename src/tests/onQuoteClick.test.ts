import onQuoteClick from '@helpers/dom/onQuoteClick';

// * a folding quote folds and unfolds by a press on it, but a link inside it opens, folded or not —
// * as on Android, where a pressed link is handled before the quote's own press

function makeQuote(state: 'is-truncated' | 'is-expanded') {
  const quote = document.createElement('blockquote');
  quote.className = `quote-like-collapsable ${state}`;
  quote.innerHTML = 'text <span class="plain">around</span> <a href="https://example.com/" target="_blank"><b>a link</b></a>';
  document.body.append(quote);
  return quote;
}

function press(quote: HTMLElement, target: Element) {
  let handled: boolean;
  const event = new MouseEvent('click', {bubbles: true, cancelable: true});
  quote.addEventListener('click', (e) => handled = onQuoteClick(e, quote), {once: true});
  target.dispatchEvent(event);
  return {handled, prevented: event.defaultPrevented};
}

afterEach(() => {
  document.body.textContent = '';
});

test.each(['is-truncated', 'is-expanded'] as const)('a link in a quote that %s opens and leaves the quote as it is', (state) => {
  const quote = makeQuote(state);
  expect(press(quote, quote.querySelector('b'))).toEqual({handled: false, prevented: false});
  expect(quote.classList.contains(state)).toBe(true);
});

test('a press on the quote\'s text folds and unfolds it', () => {
  const quote = makeQuote('is-truncated');
  expect(press(quote, quote.querySelector('.plain'))).toEqual({handled: true, prevented: true});
  expect(quote.classList.contains('is-expanded')).toBe(true);
  expect(press(quote, quote.querySelector('.plain')).handled).toBe(true);
  expect(quote.classList.contains('is-truncated')).toBe(true);
});
