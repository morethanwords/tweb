import {vi} from 'vitest';

const state = vi.hoisted(() => ({touch: false}));
vi.mock('@environment/touchSupport', () => ({get default() { return state.touch; }}));

import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';

describe('placeCaretAtEnd', () => {
  afterEach(() => {
    state.touch = false;
  });

  it('ignores elements owned by an inert document', () => {
    const inertDocument = document.implementation.createHTMLDocument();
    const element = inertDocument.createElement('div');
    element.contentEditable = 'true';

    expect(inertDocument.defaultView).toBeNull();
    expect(() => placeCaretAtEnd(element, true, false)).not.toThrow();
  });

  // Safari reports no activeElement at all when nothing is focused, where other engines give <body>
  it('survives a document without an active element on touch', () => {
    state.touch = true;

    const inertDocument = document.implementation.createHTMLDocument();
    Object.defineProperty(inertDocument, 'activeElement', {get: () => null, configurable: true});
    const element = inertDocument.createElement('div');
    element.contentEditable = 'true';

    expect(() => placeCaretAtEnd(element, true, false)).not.toThrow();
  });
});
