import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';

describe('placeCaretAtEnd', () => {
  it('ignores elements owned by an inert document', () => {
    const inertDocument = document.implementation.createHTMLDocument();
    const element = inertDocument.createElement('div');
    element.contentEditable = 'true';

    expect(inertDocument.defaultView).toBeNull();
    expect(() => placeCaretAtEnd(element, true, false)).not.toThrow();
  });
});
