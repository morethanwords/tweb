import {Node, mergeAttributes} from '@tiptap/core';
import {parsedOpaqueRichBlock} from '@components/chat/inputEditor/extensions/richBlockSerialization';

export const ChatInlineRichAnchor = Node.create({
  name: 'inlineRichAnchor',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-inline-rich-anchor]',
      getAttrs: (element) => ({name: element.getAttribute('data-anchor-name') || ''})
    }, {
      tag: 'a[name]:not([href])',
      getAttrs: (element) => ({name: element.getAttribute('name') || ''})
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const name = `${node.attrs.name || ''}`;
    return ['span', mergeAttributes(HTMLAttributes, {
      'aria-label': name ? `Anchor: ${name}` : 'Anchor',
      'class': 'chat-input-inline-rich-anchor',
      'contenteditable': 'false',
      'data-anchor-name': name,
      'data-inline-rich-anchor': ''
    }), name ? `#${name}` : '#'];
  },

  renderText() {
    return '';
  }
});

export const ChatRichAnchor = Node.create({
  name: 'richAnchor',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      name: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-rich-anchor]',
      getAttrs: (element) => ({name: element.getAttribute('data-anchor-name') || ''})
    }, {
      priority: 100,
      tag: '[data-opaque-rich-block][data-rich-block-type="pageBlockAnchor"]',
      getAttrs: (element) => {
        const parsed = parsedOpaqueRichBlock(element);
        const block = parsed && parsed.block;
        return block?._ === 'pageBlockAnchor' ? {name: block.name} : false;
      }
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const name = `${node.attrs.name || ''}`;
    return ['div', mergeAttributes(HTMLAttributes, {
      'aria-hidden': 'true',
      'class': 'chat-input-rich-anchor-block',
      'contenteditable': 'false',
      'data-anchor-name': name,
      'data-rich-anchor': '',
      'data-rich-block-type': 'pageBlockAnchor'
    })];
  },

  renderText() {
    return '';
  }
});
