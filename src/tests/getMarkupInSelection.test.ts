import '@/tests/mocks/chatInputEditorEngineUi';
import getMarkupInSelection from '@helpers/dom/getMarkupInSelection';

afterEach(() => {
  document.getSelection().removeAllRanges();
  document.body.replaceChildren();
});

test('ignores formatting and theme variables outside the editable field', () => {
  const wrapper = document.createElement('strong');
  wrapper.style.setProperty('--message-highlighting-color', 'red');
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.textContent = 'Caption';
  wrapper.append(input);
  document.body.append(wrapper);
  const range = document.createRange();
  range.selectNodeContents(input);
  document.getSelection().addRange(range);
  const state = getMarkupInSelection(['bold', 'highlight']);
  expect(state.bold.partly).toBe(false);
  expect(state.highlight.partly).toBe(false);

  input.innerHTML = '<mark><b>Caption</b></mark>';
  range.selectNodeContents(input);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  const marked = getMarkupInSelection(['bold', 'highlight']);
  expect(marked.bold.fully).toBe(true);
  expect(marked.highlight.fully).toBe(true);
});

test('still detects a formatted date selected in a readonly message', () => {
  const date = document.createElement('span');
  date.className = 'formatted-date';
  date.textContent = 'Tomorrow';
  document.body.append(date);
  const range = document.createRange();
  range.selectNodeContents(date);
  document.getSelection().addRange(range);
  expect(getMarkupInSelection(['date'], true).date.fully).toBe(true);
});
