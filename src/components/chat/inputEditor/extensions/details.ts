import {Node, mergeAttributes} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {Transaction} from '@tiptap/pm/state';
import {TextSelection} from '@tiptap/pm/state';
import {createComponent} from 'solid-js';
import {render} from 'solid-js/web';
import {IconTsx} from '@components/iconTsx';
import {instantViewStyles} from '@components/instantViewFormatting';
import {handleDetailsBackspace} from '@components/chat/inputEditor/detailsCommands';
import {
  chatInputPlaceholderAttributes,
  setChatInputPlaceholder,
  setChatInputPlaceholderEmpty
} from '@components/chat/inputEditor/placeholders';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {appendParagraphAfterFinalTopLevelBlock} from '@components/chat/inputEditor/extensions/blockEditing';

function setDetailsTogglePresentation(toggle: HTMLButtonElement, open: boolean) {
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', I18n.format(
    open ? 'Separator.ShowLess' : 'Separator.ShowMore',
    true
  ));
  toggle.querySelector(`.${instantViewStyles.DetailsIcon}`)?.classList.toggle(
    instantViewStyles.DetailsIconOpen,
    open
  );
}

export function moveSelectionToDetailsSummaryOnClose(
  transaction: Transaction,
  detailsPosition: number,
  details: ProseMirrorNode
) {
  const summary = details.firstChild;
  if(!summary) return transaction;
  const bodyPosition = detailsPosition + 1 + summary.nodeSize;
  const detailsContentEnd = detailsPosition + details.nodeSize - 1;
  const {from, to} = transaction.selection;
  if(to <= bodyPosition || from >= detailsContentEnd) return transaction;

  return transaction.setSelection(TextSelection.create(
    transaction.doc,
    detailsPosition + 2 + summary.content.size
  ));
}

function selectionInDetailsBody(
  doc: ProseMirrorNode,
  detailsPosition: number,
  details: ProseMirrorNode,
  direction: -1 | 1
) {
  const summary = details.firstChild;
  const body = details.childCount > 1 ? details.child(1) : undefined;
  if(!summary || !body) return;
  const bodyPosition = detailsPosition + 1 + summary.nodeSize;
  const searchPosition = direction > 0 ?
    bodyPosition + 1 :
    bodyPosition + body.nodeSize - 1;
  const selection = TextSelection.findFrom(
    doc.resolve(searchPosition),
    direction,
    true
  );
  if(
    !selection ||
    selection.from <= bodyPosition ||
    selection.to >= bodyPosition + body.nodeSize
  ) return;
  return selection;
}

export const ChatDetailsSummary = Node.create({
  name: 'detailsSummary',
  priority: 101,
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{tag: '[data-details-summary]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'class': classNames(instantViewStyles.DetailsSummary, 'hover-effect'),
      'data-details-summary': ''
    }), ['button', {
      'class': 'chat-input-details-toggle',
      'contenteditable': 'false',
      'type': 'button'
    }, ['span', {
      'aria-hidden': 'true',
      'class': classNames('icon icon-down', instantViewStyles.DetailsIcon)
    }]], ['div', {
      ...chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.DetailsHeader',
        true
      ), {className: classNames(
        instantViewStyles.DetailsTitle,
        'text-bold',
        'chat-input-details-summary-content'
      )})
    }, 0]];
  },

  addNodeView() {
    return ({editor, getPos, node}) => {
      const dom = document.createElement('div');
      const toggle = document.createElement('button');
      const contentDOM = document.createElement('div');
      dom.className = classNames(instantViewStyles.DetailsSummary, 'hover-effect');
      dom.dataset.detailsSummary = '';
      toggle.type = 'button';
      toggle.className = 'chat-input-details-toggle';
      toggle.contentEditable = 'false';
      toggle.tabIndex = 0;
      contentDOM.className = classNames(
        instantViewStyles.DetailsTitle,
        'text-bold',
        'chat-input-details-summary-content'
      );
      setChatInputPlaceholder(contentDOM, I18n.format(
        'Chat.Input.Editor.Placeholder.DetailsHeader',
        true
      ), !node.content.size);
      const updateEmpty = (updatedNode: ProseMirrorNode) => {
        setChatInputPlaceholderEmpty(contentDOM, !updatedNode.content.size);
      };

      const disposeIcon = render(() => createComponent(IconTsx, {
        'icon': 'down',
        'class': instantViewStyles.DetailsIcon,
        'aria-hidden': 'true'
      }), toggle);

      const updateExpanded = () => {
        if(typeof(getPos) !== 'function') return;
        const position = getPos();
        if(typeof(position) !== 'number') return;
        const resolved = editor.state.doc.resolve(position);
        for(let depth = resolved.depth; depth > 0; --depth) {
          if(resolved.node(depth).type.name !== 'details') continue;
          setDetailsTogglePresentation(toggle, !!resolved.node(depth).attrs.open);
          return;
        }
      };

      toggle.addEventListener('mousedown', (event) => event.preventDefault());
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        if(!editor.isEditable || typeof(getPos) !== 'function') return;
        const focusEditor = event.detail > 0;
        const position = getPos();
        if(typeof(position) !== 'number') return;
        const resolved = editor.state.doc.resolve(position);
        for(let depth = resolved.depth; depth > 0; --depth) {
          const details = resolved.node(depth);
          if(details.type.name !== 'details') continue;
          const detailsPosition = resolved.before(depth);
          const open = !details.attrs.open;
          let transaction = editor.state.tr.setNodeMarkup(detailsPosition, undefined, {
            ...details.attrs,
            open
          });
          if(!open) {
            transaction = moveSelectionToDetailsSummaryOnClose(
              transaction,
              detailsPosition,
              details
            );
          }
          editor.view.dispatch(transaction);
          setDetailsTogglePresentation(toggle, open);
          if(focusEditor) editor.view.focus();
          return;
        }
      });

      dom.append(toggle, contentDOM);
      updateExpanded();
      updateEmpty(node);
      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if(updatedNode.type !== node.type) return false;
          updateExpanded();
          updateEmpty(updatedNode);
          return true;
        },
        ignoreMutation: (mutation) => mutation.type === 'attributes' &&
          (
            mutation.target === toggle && (
              mutation.attributeName === 'aria-expanded' ||
              mutation.attributeName === 'aria-label' ||
              mutation.attributeName === 'class'
            ) ||
            (mutation.target as HTMLElement).classList?.contains(
              instantViewStyles.DetailsIcon
            ) && mutation.attributeName === 'class'
          ),
        destroy: disposeIcon
      };
    };
  },

  addKeyboardShortcuts() {
    const backspace = () => this.editor.commands.command(({state, dispatch}) => (
      handleDetailsBackspace(state, dispatch)
    ));
    const moveToBody = (
      openIfClosed: boolean,
      requireVisualBottom = false
    ) => this.editor.commands.command(({state, dispatch}) => {
      const {$from, empty} = state.selection;
      if(!empty) return false;
      for(let depth = $from.depth; depth > 0; --depth) {
        if($from.node(depth).type.name !== this.name) continue;
        const detailsDepth = depth - 1;
        if($from.node(detailsDepth).type.name !== 'details') return false;
        const detailsPosition = $from.before(detailsDepth);
        const details = $from.node(detailsDepth);
        if(requireVisualBottom && (
          !details.attrs.open ||
          !this.editor.view.endOfTextblock('down')
        )) return false;
        const transaction = state.tr;
        if(openIfClosed && !details.attrs.open) {
          transaction.setNodeMarkup(detailsPosition, undefined, {
            ...details.attrs,
            open: true
          });
        }
        const selection = selectionInDetailsBody(
          transaction.doc,
          detailsPosition,
          details,
          1
        );
        if(!selection) return false;
        if(dispatch) dispatch(transaction.setSelection(selection).scrollIntoView());
        return true;
      }
      return false;
    });
    return {
      ArrowDown: () => moveToBody(false, true),
      Backspace: backspace,
      'Mod-Backspace': backspace,
      'Shift-Backspace': backspace,
      Enter: () => moveToBody(true)
    };
  }
});

export const ChatDetailsBody = Node.create({
  name: 'detailsBody',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{tag: '[data-details-body]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-details-body': ''}),
      ['div', {
        class: classNames(instantViewStyles.DetailsContent, 'chat-input-details-content')
      },
      ['div', {
        class: classNames(
          instantViewStyles.DetailsContentInner,
          'chat-input-details-content-inner'
        )
      }, 0]
      ]
    ];
  }
});

export const ChatDetails = Node.create({
  name: 'details',
  priority: 101,
  content: 'detailsSummary detailsBody',
  group: 'block',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-editor-open') === 'true',
        rendered: false
      }
    };
  },

  parseHTML() {
    return [{tag: '[data-rich-message-details]'}];
  },

  renderHTML({node, HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'class': classNames(instantViewStyles.Details, 'chat-input-details'),
      'data-editor-open': node.attrs.open ? 'true' : 'false',
      'data-rich-message-details': ''
    }), 0];
  },

  addNodeView() {
    return ({node: initialNode}) => {
      let node = initialNode;
      const dom = document.createElement('div');
      dom.className = classNames(instantViewStyles.Details, 'chat-input-details');
      dom.dataset.richMessageDetails = '';
      const updateDisclosure = () => {
        const summary = Array.from(dom.children).find((element) => (
          (element as HTMLElement).dataset.detailsSummary !== undefined
        )) as HTMLElement;
        const body = Array.from(dom.children).find((element) => (
          (element as HTMLElement).dataset.detailsBody !== undefined
        )) as HTMLElement;
        const toggle = summary?.querySelector<HTMLButtonElement>('.chat-input-details-toggle');
        const content = Array.from(body?.children || []).find((element) => (
          element.classList.contains(instantViewStyles.DetailsContent)
        )) as HTMLElement;
        if(toggle) setDetailsTogglePresentation(toggle, !!node.attrs.open);
        if(content) {
          content.classList.toggle(instantViewStyles.DetailsContentOpen, !!node.attrs.open);
          content.setAttribute('aria-hidden', node.attrs.open ? 'false' : 'true');
          content.inert = !node.attrs.open;
        }
        return !!toggle && !!content;
      };
      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        node = updatedNode;
        dom.dataset.editorOpen = node.attrs.open ? 'true' : 'false';
        updateDisclosure();
        return true;
      };
      const disclosureObserver = new MutationObserver(() => {
        if(updateDisclosure()) disclosureObserver.disconnect();
      });
      update(node);
      disclosureObserver.observe(dom, {childList: true});
      queueMicrotask(() => {
        if(updateDisclosure()) disclosureObserver.disconnect();
      });
      return {
        dom,
        contentDOM: dom,
        update,
        ignoreMutation: (mutation) => {
          if(mutation.type !== 'attributes') return false;
          const target = mutation.target as HTMLElement;
          if(target === dom) return mutation.attributeName === 'data-editor-open';
          if(target.classList.contains('chat-input-details-toggle')) {
            return mutation.attributeName === 'aria-expanded' ||
              mutation.attributeName === 'aria-label' ||
              mutation.attributeName === 'class';
          }
          if(target.classList.contains(instantViewStyles.DetailsContent)) {
            return mutation.attributeName === 'aria-hidden' ||
              mutation.attributeName === 'inert' ||
              mutation.attributeName === 'class';
          }
          return false;
        },
        destroy: () => disclosureObserver.disconnect()
      };
    };
  },

  addKeyboardShortcuts() {
    const exit = (requireEmptyBodyParagraph: boolean) => this.editor.commands.command(({state, dispatch}) => (
      appendParagraphAfterFinalTopLevelBlock(
        state,
        dispatch,
        this.name as 'details',
        requireEmptyBodyParagraph
      )
    ));
    return {
      'ArrowDown': () => exit(false),
      'Enter': () => exit(true)
    };
  }
});
