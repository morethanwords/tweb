import {getCreateLinkPopupOptionsForSelection} from '@components/popups/createLinkModel';
import normalizeLinkUrl from '@helpers/string/normalizeLinkUrl';

describe('normalizeLinkUrl', () => {
  test.each([
    ['example.com/path', 'https://example.com/path'],
    ['https://example.com/path', 'https://example.com/path'],
    ['mailto:user@example.com', 'mailto:user@example.com'],
    ['tel:+971501234567', 'tel:+971501234567'],
    ['tg://resolve?domain=telegram', 'tg://resolve?domain=telegram'],
    ['tonsite://example.ton/path', 'tonsite://example.ton/path'],
    ['#section-name', '#section-name']
  ])('normalizes %s', (source, expected) => {
    expect(normalizeLinkUrl(source)).toBe(expected);
  });

  test.each([
    '',
    'two words',
    'javascript:alert(1)',
    'mailto:',
    'tel:',
    'tg:',
    'tonsite:',
    'https://',
    '##section'
  ])('rejects %s', (source) => {
    expect(normalizeLinkUrl(source)).toBeUndefined();
  });
});

describe('create-link input bridge', () => {
  test('initializes a new link only from the current selection', () => {
    expect(getCreateLinkPopupOptionsForSelection(undefined, 'selected text')).toEqual({
      editing: false,
      text: 'selected text',
      url: ''
    });
  });

  test('initializes an edited link only from its current values', () => {
    expect(getCreateLinkPopupOptionsForSelection({
      text: 'linked text',
      url: 'https://example.com/old'
    }, 'ignored selection')).toEqual({
      editing: true,
      text: 'linked text',
      url: 'https://example.com/old'
    });
  });
});
