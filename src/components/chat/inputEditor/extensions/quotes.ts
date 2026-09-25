import {Node, mergeAttributes, wrappingInputRule} from '@tiptap/core';
import fitPullquoteWidth from '@components/chat/inputEditor/pullquoteWidth';
import {DOMSerializer, type Node as ProseMirrorNode} from '@tiptap/pm/model';
import {Plugin, PluginKey, Selection, TextSelection} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {closeHistory} from '@tiptap/pm/history';
import {instantViewStyles} from '@components/instantViewFormatting';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';
import {chatInputPlaceholderAttributes} from '@components/chat/inputEditor/placeholders';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {appendParagraphAfterFinalTopLevelBlock} from '@components/chat/inputEditor/extensions/blockEditing';

const QUOTE_INPUT_REGEXP = /^\s*>\s$/;

/**
 * Whether a rich message can carry this quote collapsed. Layer 229 gave `pageBlockBlockquote` a
 * `collapsed` flag, but not the quote that holds other blocks (`pageBlockBlockquoteBlocks`) — so,
 * as on desktop, only a quote of plain paragraphs folds. A plain message's quote always can.
 */
export function isCollapsibleQuote(node: ProseMirrorNode, rich = !!node.attrs.rich) {
  if(!rich) return true;
  let collapsible = true;
  node.forEach((child) => {
    if(child.type.name !== 'paragraph' && child.type.name !== 'blockquoteCaption') collapsible = false;
  });
  return collapsible;
}

/**
 * The switch for sending a long quote folded. It is drawn by the quote's corner icon
 * (`.can-send-collapsed`, see `_quote.scss`) and exists for the keyboard and screen readers: a
 * button sitting over that icon, inside the quote, shown only while the input offers the fold.
 * `RichMessageInput` handles its click.
 */
export const QUOTE_COLLAPSE_TOGGLE_CLASS = 'chat-input-quote-toggle';

function syncQuoteCollapseToggle(quote: HTMLElement, collapsed: boolean) {
  for(const child of Array.from(quote.children)) {
    if(child.classList.contains(QUOTE_COLLAPSE_TOGGLE_CLASS)) {
      child.setAttribute('aria-pressed', '' + collapsed);
    }
  }
}

function createQuoteCollapseToggle(collapsed: boolean) {
  const button = document.createElement('button');
  button.type = 'button';
  button.contentEditable = 'false';
  button.className = QUOTE_COLLAPSE_TOGGLE_CLASS;
  button.setAttribute('aria-label', I18n.format('Input.Quote.Collapse', true));
  button.setAttribute('aria-pressed', '' + collapsed);
  return button;
}

const quoteCollapseTogglesKey = new PluginKey('chatInputQuoteCollapseToggles');

function quoteCollapseToggles(name: string) {
  return new Plugin({
    key: quoteCollapseTogglesKey,
    props: {
      decorations: (state) => {
        const decorations: Decoration[] = [];
        state.doc.descendants((node, position) => {
          if(node.type.name === name && isCollapsibleQuote(node)) {
            // one key for the quote's whole life, so a press does not replace the focused button;
            // the node view keeps its state (`syncQuoteCollapseToggle`)
            decorations.push(Decoration.widget(
              position + 1,
              () => createQuoteCollapseToggle(!!node.attrs.collapsed),
              {side: -1, key: QUOTE_COLLAPSE_TOGGLE_CLASS, ignoreSelection: true, stopEvent: () => true}
            ));
          }

          return !node.isTextblock;
        });
        return DecorationSet.create(state.doc, decorations);
      }
    }
  });
}

export const ChatBlockquoteCaption = Node.create({
  name: 'blockquoteCaption',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{tag: '[data-blockquote-caption-content]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(
      HTMLAttributes,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.Author',
        true
      ), {className: classNames(
        instantViewStyles.Padding,
        instantViewStyles.BlockquoteCaption,
        'chat-input-blockquote-author'
      )}),
      {'data-blockquote-caption-content': ''}
    ), 0];
  }
});

export const ChatBlockquote = Node.create({
  name: 'blockquote',
  content: 'block+ blockquoteCaption?',
  group: 'block',
  defining: true,

  addAttributes() {
    return {
      collapsed: {default: false, rendered: false},
      rich: {default: false, rendered: false}
    };
  },

  parseHTML() {
    const parse = (element: HTMLElement, rich: boolean) => ({
      caption: element.getAttribute('data-blockquote-caption') || '',
      collapsed: (
        element.hasAttribute('expandable') ||
        ['1', 'true'].includes(element.getAttribute('data-collapsed') || '')
      ),
      rich
    });
    return [{
      tag: '[data-chat-input-blockquote]',
      contentElement: (element) => (
        element.querySelector<HTMLElement>('[data-blockquote-content]') || element
      ),
      getAttrs: (element) => parse(
        element,
        element.getAttribute('data-chat-input-blockquote-mode') === 'rich'
      )
    }, {
      tag: '[data-rich-message-blockquote]',
      contentElement: (element) => (
        element.querySelector<HTMLElement>('[data-blockquote-content]') || element
      ),
      getAttrs: (element) => parse(element, true)
    }, {
      tag: 'blockquote, .quote-block',
      contentElement: (element) => (
        element.querySelector<HTMLElement>('[data-blockquote-content]') || element
      ),
      getAttrs: (element) => parse(element, false)
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'class': classNames(
        instantViewStyles.Padding,
        instantViewStyles.BlockquoteWrapper
      ),
      'data-collapsed': node.attrs.collapsed ? '1' : null,
      'data-chat-input-blockquote-mode': node.attrs.rich ? 'rich' : 'plain',
      'data-chat-input-blockquote': '',
      'data-rich-message-blockquote': node.attrs.rich ? '' : null
    }), ['blockquote', {
      'class': classNames(
        'quote-like quote-like-border quote-like-icon',
        !node.attrs.rich && 'quote-block',
        'chat-input-blockquote',
        isCollapsibleQuote(node) && 'input-collapsible-quote',
        isCollapsibleQuote(node) && node.attrs.collapsed && 'can-send-collapsed',
        instantViewStyles.Blockquote,
        instantViewStyles.BlockContainer
      ),
      'data-collapsed': node.attrs.collapsed ? '1' : null,
      'data-blockquote-content': ''
    }, 0]];
  },

  addNodeView() {
    return ({editor, getPos, node: initialNode}) => {
      let node = initialNode;
      const dom = document.createElement('div');
      const contentDOM = document.createElement('blockquote');
      dom.className = classNames(
        instantViewStyles.Padding,
        instantViewStyles.BlockquoteWrapper
      );
      dom.dataset.chatInputBlockquote = '';
      contentDOM.className = classNames(
        'quote-like quote-like-border quote-like-icon',
        'chat-input-blockquote',
        instantViewStyles.Blockquote,
        instantViewStyles.BlockContainer
      );
      contentDOM.dataset.blockquoteContent = '';
      dom.append(contentDOM);

      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        node = updatedNode;
        dom.dataset.chatInputBlockquoteMode = node.attrs.rich ? 'rich' : 'plain';
        contentDOM.classList.toggle('quote-block', !node.attrs.rich);
        dom.toggleAttribute('data-rich-message-blockquote', !!node.attrs.rich);
        dom.toggleAttribute('data-collapsed', !!node.attrs.collapsed);
        // the input's height observer offers the switch on a long quote (InputFieldAnimated);
        // here a folded quote keeps it and one that cannot fold loses it — anything else is the
        // observer's call, which an edit inside the quote must not undo
        const collapsible = isCollapsibleQuote(node);
        contentDOM.classList.toggle('input-collapsible-quote', collapsible);
        if(!collapsible) contentDOM.classList.remove('can-send-collapsed');
        else if(node.attrs.collapsed) contentDOM.classList.add('can-send-collapsed');
        contentDOM.toggleAttribute('data-collapsed', !!node.attrs.collapsed);
        syncQuoteCollapseToggle(contentDOM, !!node.attrs.collapsed);
        return true;
      };
      update(node);
      return {
        dom,
        contentDOM,
        update,
        // the height observer marks the quote it measured; that is not an edit to redraw it for
        ignoreMutation: (mutation) => mutation.type === 'attributes' &&
          mutation.target === contentDOM &&
          mutation.attributeName === 'class'
      };
    };
  },

  addProseMirrorPlugins() {
    return [quoteCollapseToggles(this.name)];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.command(({state, dispatch}) => {
        const {$from, empty} = state.selection;
        if(
          !empty ||
          $from.parent.type.name !== 'paragraph' ||
          $from.parentOffset !== $from.parent.content.size
        ) return false;
        for(let depth = $from.depth - 1; depth > 0; --depth) {
          const quote = $from.node(depth);
          if(quote.type.name !== this.name) continue;
          const caption = quote.lastChild?.type.name === 'blockquoteCaption';
          const bodyCount = quote.childCount - (caption ? 1 : 0);
          if(
            $from.index(depth) !== bodyCount - 1 ||
            depth !== 1
          ) return false;
          if($from.parent.content.size) {
            const paragraphPosition = $from.after($from.depth);
            const paragraph = state.schema.nodes.paragraph.create();
            const transaction = state.tr.insert(paragraphPosition, paragraph);
            if(dispatch) dispatch(transaction.setSelection(
              TextSelection.create(transaction.doc, paragraphPosition + 1)
            ).scrollIntoView());
            return true;
          }
          if(bodyCount < 2) return false;
          const trailing = state.doc.lastChild;
          if(
            $from.index(0) !== state.doc.childCount - 2 ||
            !isTrailingPlaceholderNode(trailing)
          ) return false;
          const paragraphPosition = $from.before($from.depth);
          const transaction = state.tr.delete(
            paragraphPosition,
            paragraphPosition + $from.parent.nodeSize
          );
          const trailingPosition = transaction.doc.content.size - trailing.nodeSize;
          const paragraph = state.schema.nodes.paragraph.create();
          transaction.insert(trailingPosition, paragraph);
          if(dispatch) dispatch(transaction.setSelection(
            TextSelection.create(transaction.doc, trailingPosition + 1)
          ).scrollIntoView());
          return true;
        }
        return false;
      })
    };
  },

  addInputRules() {
    return [wrappingInputRule({find: QUOTE_INPUT_REGEXP, type: this.type})];
  }
});

export const ChatPullquoteText = Node.create({
  name: 'pullquoteText',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{tag: '[data-pullquote-text]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(
      HTMLAttributes,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.Pullquote',
        true
      ), {className: classNames(
        instantViewStyles.PullquoteText,
        'chat-input-pullquote-text',
        'text-italic'
      )}),
      {'data-pullquote-text': ''}
    ), 0];
  }
});

export const ChatPullquoteCaption = Node.create({
  name: 'pullquoteCaption',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{tag: '[data-pullquote-caption]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(
      HTMLAttributes,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.PullquoteAuthor',
        true
      ), {className: classNames(
        instantViewStyles.BlockquoteCaption,
        instantViewStyles.PullquoteAuthor,
        'chat-input-pullquote-author'
      )}),
      {'data-pullquote-caption': ''}
    ), 0];
  }
});

export const ChatPullquote = Node.create({
  name: 'pullquote',
  priority: 101,
  content: 'pullquoteText pullquoteCaption?',
  group: 'block',
  defining: true,

  parseHTML() {
    return [{tag: '[data-pullquote]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'class': classNames(
        instantViewStyles.Pullquote,
        'quote-like',
        'chat-input-pullquote'
      ),
      'data-pullquote': ''
    }), 0];
  },

  addNodeView() {
    return ({node, view}) => {
      const {dom, contentDOM} = DOMSerializer.renderSpec(view.dom.ownerDocument, node.type.spec.toDOM(node));
      const width = fitPullquoteWidth(dom as HTMLElement);
      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if(!updatedNode.sameMarkup(node)) return false;
          node = updatedNode;
          width.update();
          return true;
        },
        destroy: width.destroy,
        ignoreMutation: (mutation) => mutation.type === 'attributes' && mutation.target === dom && mutation.attributeName === 'style'
      };
    };
  },

  addKeyboardShortcuts() {
    const exit = () => this.editor.commands.command(({state, dispatch}) => (
      appendParagraphAfterFinalTopLevelBlock(state, dispatch, this.name as 'pullquote', false)
    ));
    const setHardBreak = () => this.editor.chain()
    .command(({tr}) => {
      closeHistory(tr);
      return true;
    })
    .setHardBreak()
    .run();
    const newLine = () => {
      const {state, view} = this.editor;
      const {selection} = state;
      const {$from, $to} = selection;
      if(
        !$from.sameParent($to) ||
        $from.parent.type.name !== 'pullquoteText'
      ) return exit();
      if(
        !selection.empty ||
        $from.parentOffset !== $from.parent.content.size
      ) return setHardBreak();

      const hardBreak = state.schema.nodes.hardBreak;
      const previous = $from.nodeBefore;
      if(!hardBreak || previous?.type !== hardBreak) return setHardBreak();

      const transaction = closeHistory(state.tr).delete(
        $from.pos - previous.nodeSize,
        $from.pos
      );
      const afterPullquote = $from.after(1) - previous.nodeSize;
      const nextSelection = Selection.near(
        transaction.doc.resolve(afterPullquote),
        1
      );
      if(nextSelection.from < afterPullquote) return false;
      view.dispatch(transaction.setSelection(nextSelection).scrollIntoView());
      return true;
    };
    return {
      'ArrowDown': exit,
      'Enter': newLine
    };
  }
});
