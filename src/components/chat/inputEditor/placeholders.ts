import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {Plugin, PluginKey, TextSelection} from '@tiptap/pm/state';
import {Decoration, DecorationSet, type EditorView} from '@tiptap/pm/view';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';
import {CHAT_TABLE_TITLE_NODE_NAME} from '@components/chat/inputEditor/tableSchema';
import classNames from '@helpers/string/classNames';
import rootScope from '@lib/rootScope';
import I18n, {LangPackKey} from '@lib/langPack';

export const CHAT_INPUT_PLACEHOLDER_CLASS = 'chat-input-context-placeholder';
export const CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS =
  'chat-input-context-placeholder-empty';
export const CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS =
  'chat-input-context-placeholder-centered';
export const CHAT_INPUT_PLACEHOLDER_LABEL_CLASS =
  'chat-input-context-placeholder-label';
const CHAT_INPUT_PLACEHOLDER_POSITION_ATTRIBUTE =
  'data-placeholder-position';

export type ChatInputPlaceholderOptions = {
  ariaLabel?: boolean,
  centered?: boolean,
  className?: string,
  empty?: boolean
};

export function chatInputPlaceholderAttributes(
  placeholder: string,
  options: ChatInputPlaceholderOptions = {}
) {
  return {
    ...(options.ariaLabel ? {'aria-label': placeholder} : {}),
    'class': classNames(
      CHAT_INPUT_PLACEHOLDER_CLASS,
      options.empty ? CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS : '',
      options.centered ? CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS : '',
      options.className
    ),
    'data-placeholder': placeholder
  };
}

export function setChatInputPlaceholderEmpty(element: HTMLElement, empty: boolean) {
  if(!element.classList.contains(CHAT_INPUT_PLACEHOLDER_CLASS)) {
    element.classList.add(CHAT_INPUT_PLACEHOLDER_CLASS);
  }
  if(element.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS) !== empty) {
    element.classList.toggle(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS, empty);
  }
}

export function setChatInputPlaceholder(
  element: HTMLElement,
  placeholder: string,
  empty: boolean
) {
  element.dataset.placeholder = placeholder;
  setChatInputPlaceholderEmpty(element, empty);
}

const CONTEXTUAL_PLACEHOLDER_KEYS: Partial<Record<string, LangPackKey>> = {
  blockquoteCaption: 'Chat.Input.Editor.Placeholder.Author',
  heading: 'Chat.Input.Editor.Placeholder.Heading',
  pullquoteCaption: 'Chat.Input.Editor.Placeholder.PullquoteAuthor',
  pullquoteText: 'Chat.Input.Editor.Placeholder.Pullquote',
  richFooter: 'Chat.Input.Editor.Placeholder.Footer'
};

function setDomCaretBeforePlaceholder(
  view: EditorView,
  label: HTMLElement
) {
  const parent = label.parentNode;
  const domSelection = view.dom.ownerDocument.getSelection();
  if(!parent || !domSelection) return;
  const offset = Array.prototype.indexOf.call(parent.childNodes, label);
  if(offset < 0) return;

  const range = view.dom.ownerDocument.createRange();
  range.setStart(parent, offset);
  range.collapse(true);
  domSelection.removeAllRanges();
  domSelection.addRange(range);
}

function placeCaretBeforePlaceholder(
  view: EditorView,
  label: HTMLElement,
  position: number
) {
  if(position < 0 || position > view.state.doc.content.size) return;
  const selection = TextSelection.create(view.state.doc, position);
  if(!view.state.selection.eq(selection)) {
    view.dispatch(view.state.tr.setSelection(selection));
  }
  view.focus();
  setDomCaretBeforePlaceholder(view, label);
}

function synchronizeCenteredPlaceholderCaret(view: EditorView) {
  const {selection} = view.state;
  const labels = view.dom.getElementsByClassName(
    CHAT_INPUT_PLACEHOLDER_LABEL_CLASS
  );
  if(!view.hasFocus() || !selection.empty) return;
  const position = String(selection.from);
  for(const candidate of labels) {
    if(
      candidate.getAttribute(CHAT_INPUT_PLACEHOLDER_POSITION_ATTRIBUTE) !== position ||
      !candidate.closest(`.${CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS}`)
    ) continue;
    setDomCaretBeforePlaceholder(view, candidate as HTMLElement);
    return;
  }
}

function placeholderLabelDecoration(
  position: number,
  placeholder: string,
  nodeName: string,
  className?: string
) {
  return Decoration.widget(position + 1, (view) => {
    const element = view.dom.ownerDocument.createElement('span');
    element.className = classNames(CHAT_INPUT_PLACEHOLDER_LABEL_CLASS, className);
    element.contentEditable = 'false';
    element.setAttribute('aria-hidden', 'true');
    element.dataset.placeholderLabel = placeholder;
    element.setAttribute(
      CHAT_INPUT_PLACEHOLDER_POSITION_ATTRIBUTE,
      String(position + 1)
    );
    element.textContent = placeholder;
    element.addEventListener('mousedown', (event) => {
      if(event.button !== 0) return;
      event.preventDefault();
      placeCaretBeforePlaceholder(view, element, position + 1);
    });
    return element;
  }, {
    key: `chat-input-placeholder-${nodeName}-${position}-${placeholder}`,
    side: 0
  });
}

export function handleChatInputPlaceholderMouseDown(
  view: EditorView,
  event: MouseEvent
) {
  if(event.button !== 0) return false;
  const target = event.target;
  const appWindow = view.dom.ownerDocument.defaultView;
  if(!appWindow || !(target instanceof appWindow.Element)) return false;
  const placeholder = target.closest(`.${CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS}`);
  if(!placeholder || !view.dom.contains(placeholder)) return false;

  const label = placeholder.querySelector(`.${CHAT_INPUT_PLACEHOLDER_LABEL_CLASS}`);
  if(!(label instanceof appWindow.HTMLElement)) return false;
  event.preventDefault();
  const anchoredPosition = Number(label?.getAttribute(
    CHAT_INPUT_PLACEHOLDER_POSITION_ATTRIBUTE
  ));
  const position = Number.isSafeInteger(anchoredPosition) ?
    anchoredPosition :
    view.posAtDOM(placeholder, 0);
  placeCaretBeforePlaceholder(view, label, position);
  return true;
}

function placeholderDecoration(
  node: ProseMirrorNode,
  position: number,
  parent: ProseMirrorNode,
  doc: ProseMirrorNode
) {
  if(node.type.name === CHAT_TABLE_TITLE_NODE_NAME) {
    const placeholder = I18n.format('Chat.Input.Editor.Table.TitlePlaceholder', true);
    const empty = !node.content.size;
    const decorations = [Decoration.node(
      position,
      position + node.nodeSize,
      chatInputPlaceholderAttributes(placeholder, {
        ariaLabel: true,
        centered: empty,
        className: empty ? 'chat-input-table-title-empty' : '',
        empty
      })
    )];
    if(empty) {
      decorations.push(placeholderLabelDecoration(
        position,
        placeholder,
        node.type.name,
        'text-bold'
      ));
    }
    return decorations;
  }

  if(
    node.type.name === 'paragraph' &&
    !node.content.size &&
    (parent?.type.name === 'tableCell' || parent?.type.name === 'tableHeader')
  ) {
    const placeholder = I18n.format(
      parent.type.name === 'tableHeader' ?
        'Chat.Input.Editor.Table.HeaderPlaceholder' :
        'Chat.Input.Editor.Table.CellPlaceholder',
      true
    );
    return [Decoration.node(
      position,
      position + node.nodeSize,
      {
        ...chatInputPlaceholderAttributes(placeholder, {
          ariaLabel: true,
          centered: true,
          empty: true
        }),
        'data-table-cell-placeholder': ''
      }
    ), placeholderLabelDecoration(position, placeholder, node.type.name)];
  }

  if(
    parent === doc &&
    node === doc.lastChild &&
    isTrailingPlaceholderNode(node)
  ) {
    return [Decoration.node(
      position,
      position + node.nodeSize,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.TrailingPlaceholder',
        true
      ), {
        className: 'chat-input-trailing-placeholder',
        empty: true
      })
    )];
  }

  const quoteParagraph = (
    node.type.name === 'paragraph' &&
    parent?.type.name === 'blockquote'
  );
  const emptyDetailsParagraph = (
    node.type.name === 'paragraph' &&
    !node.content.size &&
    parent?.type.name === 'detailsBody' &&
    parent.childCount === 1
  );
  const placeholderKey = emptyDetailsParagraph ?
    'Chat.Input.Editor.Placeholder.DetailsText' :
    quoteParagraph ?
      'Chat.Input.Editor.Placeholder.Quote' :
      CONTEXTUAL_PLACEHOLDER_KEYS[node.type.name];
  if(!placeholderKey) return;
  if(
    node.type.name === 'pullquoteCaption' &&
    parent?.type.name === 'pullquote' &&
    !parent.firstChild?.content.size
  ) return;

  const placeholder = I18n.format(placeholderKey, true);
  const empty = !node.content.size;
  const centered = empty && (
    node.type.name === 'pullquoteCaption' ||
    node.type.name === 'pullquoteText'
  );
  const decorations = [Decoration.node(
    position,
    position + node.nodeSize,
    chatInputPlaceholderAttributes(placeholder, {
      centered,
      empty
    })
  )];
  if(centered) {
    decorations.push(placeholderLabelDecoration(
      position,
      placeholder,
      node.type.name
    ));
  }
  return decorations;
}

type PlaceholderCandidate = {
  node: ProseMirrorNode,
  parent?: ProseMirrorNode,
  position: number
};

export const chatInputPlaceholdersKey = new PluginKey('chatInputPlaceholders');

export const ChatInputPlaceholders = Extension.create({
  name: 'chatInputPlaceholders',

  addProseMirrorPlugins() {
    // ProseMirror nodes are immutable. Keep relative placeholder candidates for
    // each top-level subtree, so edits only traverse newly created subtrees.
    const candidates = new WeakMap<ProseMirrorNode, PlaceholderCandidate[]>();
    let lastDocument: ProseMirrorNode;
    let lastDecorations: DecorationSet;
    const collect = (block: ProseMirrorNode) => {
      const cached = candidates.get(block);
      if(cached) return cached;
      const result: PlaceholderCandidate[] = [];
      const add = (node: ProseMirrorNode, position: number, parent?: ProseMirrorNode) => {
        const name = node.type.name;
        if(name === 'paragraph' || name === CHAT_TABLE_TITLE_NODE_NAME || CONTEXTUAL_PLACEHOLDER_KEYS[name]) {
          result.push({node, parent, position});
        }
        return name !== CHAT_TABLE_TITLE_NODE_NAME;
      };
      if(add(block, 0)) block.descendants((node, position, parent) => add(node, position + 1, parent));
      candidates.set(block, result);
      return result;
    };
    return [new Plugin({
      key: chatInputPlaceholdersKey,
      view: () => {
        const invalidate = () => {lastDocument = undefined;};
        rootScope.addEventListener('language_apply', invalidate);
        return {
          update: (view) => synchronizeCenteredPlaceholderCaret(view),
          destroy: () => rootScope.removeEventListener('language_apply', invalidate)
        };
      },
      props: {
        handleDOMEvents: {
          focus: (view) => {
            view.dom.ownerDocument.defaultView?.queueMicrotask(() => {
              synchronizeCenteredPlaceholderCaret(view);
            });
            return false;
          },
          mousedown: handleChatInputPlaceholderMouseDown
        },
        decorations(state) {
          if(state.doc === lastDocument) return lastDecorations;
          const decorations: Decoration[] = [];
          state.doc.forEach((block, offset) => {
            for(const {node, parent, position} of collect(block)) {
              const nodeDecorations = placeholderDecoration(
                node,
                offset + position,
                parent || state.doc,
                state.doc
              );
              if(nodeDecorations) decorations.push(...nodeDecorations);
            }
          });
          lastDocument = state.doc;
          lastDecorations = decorations.length ?
            DecorationSet.create(state.doc, decorations) :
            DecorationSet.empty;
          return lastDecorations;
        }
      }
    })];
  }
});
