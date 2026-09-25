import {Extension, Node, mergeAttributes} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {AnimationItemGroup} from '@components/animationIntersector';
import CustomEmojiElement from '@lib/customEmoji/element';
import {CustomEmojiRendererElement} from '@lib/customEmoji/renderer';
import {createFullySelectedNodeDecorationPlugin} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAAtJREFUGFdjYAACAAAFAAGq1chRAAAAAElFTkSuQmCC';

type ChatCustomEmojiRendererState = {
  elements: Set<CustomEmojiElement>,
  input: HTMLElement,
  renderer: CustomEmojiRendererElement
};

const customEmojiRenderers = new WeakMap<HTMLElement, ChatCustomEmojiRendererState>();

function mountCustomEmojiRenderer(state: ChatCustomEmojiRendererState) {
  const {elements, input, renderer} = state;
  if(!elements.size || customEmojiRenderers.get(input) !== state || !input.parentElement) return;
  if(renderer.parentElement !== input.parentElement || renderer.nextSibling !== input) {
    input.before(renderer);
  }
}

function getCustomEmojiRenderer(input: HTMLElement) {
  let state = customEmojiRenderers.get(input);
  if(state) return state;

  const renderer = CustomEmojiRendererElement.create({
    wrappingDraft: true,
    isSelectable: true,
    textColor: input.dataset.textColor || 'primary-text-color',
    animationGroup: input.dataset.animationGroup as AnimationItemGroup
  });
  state = {elements: new Set(), input, renderer};
  customEmojiRenderers.set(input, state);

  // A ChatInput editor is created while InputField still owns the element in a
  // detached container. Re-check in a microtask after ChatInput has moved the
  // input into `.input-message-container`; keeping the renderer as a sibling
  // leaves it outside ProseMirror's observed content DOM.
  mountCustomEmojiRenderer(state);
  queueMicrotask(() => mountCustomEmojiRenderer(state));
  return state;
}

function addCustomEmojiToRenderer(input: HTMLElement, element: CustomEmojiElement) {
  const state = getCustomEmojiRenderer(input);
  state.elements.add(element);
  mountCustomEmojiRenderer(state);
  state.renderer.add({
    addCustomEmojis: new Map([[element.docId, new Set([element])]]),
    lazyLoadQueue: false
  });
  state.renderer.forceRender();
  return state;
}

function removeCustomEmojiFromRenderer(state: ChatCustomEmojiRendererState, element: CustomEmojiElement) {
  if(!state.elements.delete(element)) return;
  element.destroy();
  if(state.elements.size) {
    state.renderer.forceRender();
    return;
  }

  customEmojiRenderers.delete(state.input);
  state.renderer.remove();
  state.renderer.destroy?.();
}

export const ChatCustomEmoji = Node.create({
  name: 'customEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      documentId: {default: '', rendered: false},
      emoji: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-sticker-emoji][data-doc-id]',
      getAttrs: (element) => ({
        documentId: element.getAttribute('data-doc-id'),
        emoji: element.getAttribute('data-sticker-emoji') || element.getAttribute('alt') || element.textContent || ''
      })
    }, {
      tag: 'tg-emoji[emoji-id]',
      getAttrs: (element) => ({
        documentId: element.getAttribute('emoji-id'),
        emoji: element.textContent || ''
      })
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const documentId = node.attrs.documentId;
    return ['span', mergeAttributes(HTMLAttributes, {
      'aria-label': node.attrs.emoji,
      'class': 'custom-emoji chat-input-custom-emoji',
      'contenteditable': 'false',
      'draggable': 'false',
      'data-doc-id': documentId === undefined || documentId === null || documentId === '' ?
        undefined :
        `${documentId}`,
      'data-sticker-emoji': node.attrs.emoji
    })];
  },

  renderText({node}) {
    return node.attrs.emoji || '';
  },

  addNodeView() {
    return ({node, view}) => {
      const update = (updatedNode: ProseMirrorNode) => (
        updatedNode.type === node.type &&
        updatedNode.attrs.documentId === node.attrs.documentId &&
        updatedNode.attrs.emoji === node.attrs.emoji
      );
      const input = view.dom as HTMLElement;
      const documentId = node.attrs.documentId;
      const hasDocumentId = (
        documentId !== undefined &&
        documentId !== null &&
        documentId !== ''
      );
      if(!input.classList.contains('input-message-input') || !hasDocumentId) {
        const dom = document.createElement('span');
        dom.className = 'custom-emoji chat-input-custom-emoji';
        dom.contentEditable = 'false';
        dom.draggable = false;
        if(hasDocumentId) dom.dataset.docId = `${documentId}`;
        dom.dataset.stickerEmoji = node.attrs.emoji;
        dom.setAttribute('aria-label', node.attrs.emoji);
        return {
          dom,
          update
        };
      }

      const dom = document.createElement('img');
      dom.alt = node.attrs.emoji;
      dom.className = 'custom-emoji-placeholder chat-input-custom-emoji';
      dom.contentEditable = 'false';
      dom.draggable = false;
      dom.dataset.docId = `${node.attrs.documentId}`;
      dom.dataset.stickerEmoji = node.attrs.emoji;
      dom.src = TRANSPARENT_PIXEL;
      dom.setAttribute('aria-label', node.attrs.emoji);

      const customEmojiElement = CustomEmojiElement.create(node.attrs.documentId);
      customEmojiElement.dataset.stickerEmoji = node.attrs.emoji;
      customEmojiElement.placeholder = dom;
      (dom as HTMLImageElement & {customEmojiElement: CustomEmojiElement}).customEmojiElement = customEmojiElement;
      const rendererState = addCustomEmojiToRenderer(input, customEmojiElement);

      return {
        dom,
        update,
        destroy: () => removeCustomEmojiFromRenderer(rendererState, customEmojiElement)
      };
    };
  },

  addProseMirrorPlugins() {
    return [createFullySelectedNodeDecorationPlugin(
      this.type,
      'chat-input-custom-emoji-selected'
    )];
  }
});

export const ChatCustomEmojiText = Extension.create({
  name: 'chatCustomEmojiText',

  extendNodeSchema(extension) {
    if(extension.name !== 'customEmoji') return {};
    return {
      leafText: (node: ProseMirrorNode) => node.attrs.emoji || ''
    };
  }
});
