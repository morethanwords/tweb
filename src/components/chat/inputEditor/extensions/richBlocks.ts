import {Node, mergeAttributes} from '@tiptap/core';
import {instantViewStyles} from '@components/instantViewFormatting';
import {chatInputPlaceholderAttributes} from '@components/chat/inputEditor/placeholders';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {
  parsedOpaqueRichBlock,
  opaqueRichBlockLabel,
  opaqueRichBlockType,
  serializedOpaqueRichBlock
} from '@components/chat/inputEditor/extensions/richBlockSerialization';

export const ChatRichFooter = Node.create({
  name: 'richFooter',
  priority: 101,
  content: 'inline*',
  group: 'block',
  defining: true,

  parseHTML() {
    return [{tag: '[data-rich-footer]'}, {tag: 'footer'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['footer', mergeAttributes(
      HTMLAttributes,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.Footer',
        true
      ), {className: classNames(
        instantViewStyles.Padding,
        instantViewStyles.Footer,
        'secondary',
        'chat-input-rich-footer'
      )}),
      {'data-rich-footer': ''}
    ), 0];
  }
});

export const ChatRichDivider = Node.create({
  name: 'richDivider',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{tag: '[data-rich-divider]'}, {tag: 'hr'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'aria-label': 'Divider',
      'class': classNames(instantViewStyles.Divider, 'chat-input-rich-divider'),
      'data-rich-divider': ''
    })];
  },

  renderText() {
    return '---';
  }
});

export const ChatOpaqueRichBlock = Node.create({
  name: 'opaqueRichBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      block: {default: null, rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-opaque-rich-block]',
      getAttrs: parsedOpaqueRichBlock
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const block = node.attrs.block;
    const label = opaqueRichBlockLabel(block);
    const type = opaqueRichBlockType(block);
    const attributes: Record<string, string> = {
      'aria-label': label,
      'aria-readonly': 'true',
      'class': classNames(
        'chat-input-opaque-rich-block',
        instantViewStyles.BlockContainer,
        instantViewStyles.Padding
      ),
      'contenteditable': 'false',
      'data-opaque-rich-block': '',
      'data-rich-block': serializedOpaqueRichBlock(block),
      'data-rich-block-type': type
    };
    return ['div', mergeAttributes(HTMLAttributes, attributes), label];
  },

  renderText({node}) {
    return `[${opaqueRichBlockLabel(node.attrs.block)}]`;
  },

  addNodeView() {
    return ({node: initialNode}) => {
      let node = initialNode;
      const dom = document.createElement('div');
      const label = document.createElement('span');
      dom.className = classNames(
        'chat-input-opaque-rich-block',
        instantViewStyles.BlockContainer,
        instantViewStyles.Padding
      );
      dom.contentEditable = 'false';
      dom.dataset.opaqueRichBlock = '';
      dom.setAttribute('aria-readonly', 'true');
      label.className = 'chat-input-opaque-rich-block-label';
      dom.append(label);

      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        node = updatedNode;
        const block = node.attrs.block;
        const text = opaqueRichBlockLabel(block);
        const type = opaqueRichBlockType(block);
        dom.dataset.richBlock = serializedOpaqueRichBlock(block);
        dom.dataset.richBlockType = type;
        label.textContent = text;
        dom.setAttribute('aria-label', text);
        return true;
      };
      update(node);

      return {
        dom,
        update,
        ignoreMutation: () => true
      };
    };
  }
});
