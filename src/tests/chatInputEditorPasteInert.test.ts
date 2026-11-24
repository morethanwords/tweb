import '@/tests/mocks/chatInputEditorTableUi';
import {dispatchPaste, useMountedChatInputEditors} from '@/tests/helpers/chatInputEditor';

const MARKER = 'data-paste-probe';
const PICTURE = `<img src="x" ${MARKER} onerror="window.__pasteProbe = 1">`;

/**
 * A pasted page's markup that reaches a node of the app's document runs there: an `<img>` adopted into it loads, even
 * in a detached `<div>`, and fires its `onerror` with the app's rights. jsdom loads no images, so what is watched is
 * that step itself — a node carrying the marker put under, or parsed into, a node of `document` (a `<template>`'s
 * content is inert, and parsing there is fine).
 */
function watchLiveDocument() {
  const reached: string[] = [];
  const hasMarker = (node: unknown) => node instanceof Node && node.nodeType === Node.ELEMENT_NODE && (
    (node as Element).hasAttribute(MARKER) || !!(node as Element).querySelector(`[${MARKER}]`)
  ) || node instanceof Node && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
    !!(node as DocumentFragment).querySelector(`[${MARKER}]`);
  const isLive = (node: Node) => node.ownerDocument === document;

  const insertions: Array<[object, string]> = [
    [Element.prototype, 'append'],
    [Element.prototype, 'prepend'],
    [Element.prototype, 'replaceChildren'],
    [Element.prototype, 'after'],
    [Element.prototype, 'before'],
    [Element.prototype, 'replaceWith'],
    [Node.prototype, 'appendChild'],
    [Node.prototype, 'insertBefore'],
    [Node.prototype, 'replaceChild']
  ];
  insertions.forEach(([prototype, name]) => {
    const original = (prototype as any)[name] as (...args: unknown[]) => unknown;
    vi.spyOn(prototype as any, name).mockImplementation(function(this: Node, ...args: unknown[]) {
      if(isLive(this) && args.some(hasMarker)) reached.push(`${this.nodeName}.${name}`);
      return original.apply(this, args);
    });
  });

  const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function(this: Element, value: string) {
    if(isLive(this) && this.localName !== 'template' && String(value).includes(MARKER)) {
      reached.push(`${this.nodeName}.innerHTML`);
    }
    innerHTML.set.call(this, value);
  });

  return reached;
}

describe('pasted HTML is read where it cannot run', () => {
  const mount = useMountedChatInputEditors();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'a paragraph holding only a picture',
      html: `<p>${PICTURE}</p>`,
      text: '',
      value: ''
    },
    {
      name: 'paragraphs with a picture among the words, beside their plain text',
      html: `<p>one</p><p>two ${PICTURE} three</p><p>four</p>`,
      text: 'one\n\ntwo three\n\nfour',
      value: 'one\n\ntwo three\n\nfour'
    },
    {
      name: 'a picture at the edge of a paragraph, without a plain text',
      html: `<p>one${PICTURE}</p><p>${PICTURE}two</p>`,
      text: '',
      value: 'one\n\ntwo'
    }
  ])('$name', ({html, text, value}) => {
    const {editor, input} = mount();
    const reached = watchLiveDocument();

    dispatchPaste(input, html, text);

    expect(reached).toEqual([]);
    // * and the paste went through the field's own reading of it
    expect(editor.getRichValue().value).toBe(value);
  });
});
