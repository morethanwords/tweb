import {Node, mergeAttributes, textblockTypeInputRule} from '@tiptap/core';
import {TextSelection} from '@tiptap/pm/state';
import {canSplit} from '@tiptap/pm/transform';
import {closeHistory} from '@tiptap/pm/history';
import {
  InstantViewHeadingLevel,
  getInstantViewHeadingPresentation,
  instantViewStyles
} from '@components/instantViewFormatting';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';
import {joinParagraphAtPlainQuoteBoundary, restoreTopLevelParagraphBoundaryAsHardBreak} from '@components/chat/inputEditor/paragraphCommands';
import {chatInputPlaceholderAttributes} from '@components/chat/inputEditor/placeholders';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';

const HEADING_INPUT_REGEXP = /^(#{1,6})\s$/;

export const ChatHeading = Node.create({
  name: 'heading',
  content: 'inline*',
  group: 'block',
  defining: true,

  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false
      }
    };
  },

  parseHTML() {
    return ([1, 2, 3, 4, 5, 6] as InstantViewHeadingLevel[]).map((level) => ({
      tag: `h${level}`,
      attrs: {level}
    }));
  },

  renderHTML({node, HTMLAttributes}) {
    const level = Math.max(1, Math.min(6, Number(node.attrs.level) || 1)) as InstantViewHeadingLevel;
    const presentation = getInstantViewHeadingPresentation(level);
    return [presentation.tag, mergeAttributes(
      HTMLAttributes,
      chatInputPlaceholderAttributes(I18n.format(
        'Chat.Input.Editor.Placeholder.Heading',
        true
      ), {className: classNames(
        'chat-input-heading',
        presentation.class
      )})
    ), 0];
  },

  addKeyboardShortcuts() {
    return Object.fromEntries(([1, 2, 3, 4, 5, 6] as InstantViewHeadingLevel[]).map((level) => [
      `Mod-Alt-${level}`,
      () => this.editor.commands.toggleNode(this.name, 'paragraph', {level})
    ]));
  },

  addInputRules() {
    return [textblockTypeInputRule({
      find: HEADING_INPUT_REGEXP,
      type: this.type,
      getAttributes: (match) => ({level: match[1].length})
    })];
  }
});

export const ChatParagraph = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',

  parseHTML() {
    return [
      {tag: 'div[data-chat-input-paragraph]'},
      {tag: 'p'}
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'class': classNames(instantViewStyles.Padding, instantViewStyles.Paragraph),
      'data-chat-input-paragraph': ''
    }), 0];
  },

  addKeyboardShortcuts() {
    const deletePreviousHardBreak = () => {
      const {state, view} = this.editor;
      const {selection} = state;
      if(!(selection instanceof TextSelection) || !selection.empty) return false;
      const {$from} = selection;
      const previous = $from.nodeBefore;
      if(previous?.type !== state.schema.nodes.hardBreak) return false;
      view.dispatch(state.tr.delete(
        $from.pos - previous.nodeSize,
        $from.pos
      ).scrollIntoView());
      return true;
    };
    const setHardBreak = () => this.editor.chain()
    .command(({tr}) => {
      closeHistory(tr);
      return true;
    })
    .setHardBreak()
    .run();
    return {
      Backspace: () => {
        const {state, view} = this.editor;
        return deletePreviousHardBreak() || joinParagraphAtPlainQuoteBoundary(state, (transaction) => view.dispatch(transaction)) || restoreTopLevelParagraphBoundaryAsHardBreak(
          state,
          (transaction) => view.dispatch(transaction)
        );
      },
      Delete: () => joinParagraphAtPlainQuoteBoundary(this.editor.state, (transaction) => this.editor.view.dispatch(transaction), 1),
      Enter: () => {
        const {state, view} = this.editor;
        const {selection} = state;
        const {$from, $to} = selection;
        if(!$from.sameParent($to) || $from.parent.type !== this.type) return false;

        let inTableCell = false;
        for(let depth = $from.depth - 1; depth > 0; --depth) {
          const name = $from.node(depth).type.name;
          if(name === 'listItem' || name === 'taskItem') return false;
          if(name === 'tableCell' || name === 'tableHeader') inTableCell = true;
        }

        // A table cell is one editable text surface. Splitting it into sibling
        // paragraphs makes every empty sibling look like another empty cell
        // and produces repeated Cell/Header placeholders.
        if(inTableCell) return setHardBreak();

        if(!selection.empty) return setHardBreak();
        if(!$from.parent.content.size) {
          return $from.depth === 1 ? setHardBreak() : false;
        }

        const hardBreak = state.schema.nodes.hardBreak;
        const previous = $from.nodeBefore;
        if(!hardBreak || previous?.type !== hardBreak) {
          return setHardBreak();
        }

        let quoteDepth = -1;
        for(let depth = $from.depth - 1; depth > 0; --depth) {
          if($from.node(depth).type.name === 'blockquote') {
            quoteDepth = depth;
            break;
          }
        }
        if(quoteDepth === 1 && $from.parentOffset === $from.parent.content.size) {
          const quote = $from.node(quoteDepth);
          const caption = quote.lastChild?.type.name === 'blockquoteCaption';
          const bodyCount = quote.childCount - (caption ? 1 : 0);
          const trailing = state.doc.lastChild;
          if(
            $from.index(quoteDepth) === bodyCount - 1 &&
            $from.index(0) === state.doc.childCount - 2 &&
            isTrailingPlaceholderNode(trailing)
          ) {
            const transaction = closeHistory(state.tr).delete(
              $from.pos - previous.nodeSize,
              $from.pos
            );
            const trailingPosition = transaction.doc.content.size - trailing.nodeSize;
            const paragraph = state.schema.nodes.paragraph.create();
            transaction.insert(trailingPosition, paragraph);
            view.dispatch(transaction.setSelection(
              TextSelection.create(transaction.doc, trailingPosition + 1)
            ).scrollIntoView());
            return true;
          }
        }

        const transaction = closeHistory(state.tr).delete(
          $from.pos - previous.nodeSize,
          $from.pos
        );
        const splitPosition = transaction.selection.from;
        if(!canSplit(transaction.doc, splitPosition)) return false;
        view.dispatch(transaction.split(splitPosition).scrollIntoView());
        return true;
      }
    };
  }
});
