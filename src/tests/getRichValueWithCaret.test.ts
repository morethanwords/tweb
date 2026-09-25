import '@/tests/mocks/chatInputEditorEngineUi';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';

test.each([
  ['<span class="quote">Quote</span>', 'Quote'],
  ['<div><span class="quote">Quote</span></div>', 'Quote'],
  ['Before<span class="quote">Quote</span>', 'Before\nQuote'],
  ['<span class="quote">Quote</span>After', 'Quote\nAfter'],
  ['<span class="quote">First</span><span class="quote">Second</span>', 'First\nSecond'],
  ['<span class="quote">First</span><div><br></div><span class="quote">Second</span>', 'First\n\nSecond'],
  ['<span class="quote">Quote</span><div><br></div>', 'Quote\n'],
  ['Text<br>', 'Text\n']
])('preserves authored line boundaries without a second container separator: %s', (html, expected) => {
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.innerHTML = html;
  document.body.append(input);
  try {
    expect(getRichValueWithCaret(input, true, false).value).toBe(expected);
  } finally {input.remove();}
});
