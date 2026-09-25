import {Schema} from '@tiptap/pm/model';
import {EditorState, TextSelection, type Transaction} from '@tiptap/pm/state';
import type {EditorView} from '@tiptap/pm/view';
import {
  CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS,
  CHAT_INPUT_PLACEHOLDER_CLASS,
  CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS,
  CHAT_INPUT_PLACEHOLDER_LABEL_CLASS,
  ChatInputPlaceholders,
  chatInputPlaceholderAttributes,
  handleChatInputPlaceholderMouseDown,
  setChatInputPlaceholder,
  setChatInputPlaceholderEmpty
} from '@components/chat/inputEditor/placeholders';

describe('chat input placeholder subsystem', () => {
  test('creates the shared attributes for every placeholder renderer', () => {
    expect(chatInputPlaceholderAttributes('Title', {
      ariaLabel: true,
      className: 'chat-input-table-title-empty',
      empty: true
    })).toEqual({
      'aria-label': 'Title',
      'class': [
        CHAT_INPUT_PLACEHOLDER_CLASS,
        CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS,
        'chat-input-table-title-empty'
      ].join(' '),
      'data-placeholder': 'Title'
    });
  });

  test('uses the same empty-state controller for NodeView content', () => {
    const element = document.createElement('div');
    setChatInputPlaceholder(element, 'Caption', true);

    expect(element.dataset.placeholder).toBe('Caption');
    expect(element.classList.contains(CHAT_INPUT_PLACEHOLDER_CLASS)).toBe(true);
    expect(element.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS)).toBe(true);

    setChatInputPlaceholderEmpty(element, false);
    expect(element.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS)).toBe(false);
    expect(element.classList.contains(CHAT_INPUT_PLACEHOLDER_CLASS)).toBe(true);
  });

  test('marks centered placeholders for an in-flow caret anchor', () => {
    expect(chatInputPlaceholderAttributes('Title', {
      centered: true,
      empty: true
    }).class).toBe([
      CHAT_INPUT_PLACEHOLDER_CLASS,
      CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS,
      CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS
    ].join(' '));
  });

  test('uses the model anchor when placing the caret in an empty Pullquote', () => {
    const schema = new Schema({
      nodes: {
        doc: {content: 'block+'},
        paragraph: {content: 'text*', group: 'block'},
        pullquote: {content: 'pullquoteText', group: 'block'},
        pullquoteText: {content: 'text*'},
        text: {group: 'inline'}
      }
    });
    const doc = schema.node('doc', null, [
      schema.node('pullquote', null, [schema.node('pullquoteText')]),
      schema.node('paragraph')
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 5)
    });
    const root = document.createElement('div');
    const placeholder = document.createElement('div');
    const label = document.createElement('span');
    label.className = CHAT_INPUT_PLACEHOLDER_LABEL_CLASS;
    label.dataset.placeholderPosition = '2';
    placeholder.className = CHAT_INPUT_PLACEHOLDER_CENTERED_CLASS;
    placeholder.append(label);
    root.append(placeholder);
    document.body.append(root);

    const focus = vi.fn();
    let selectionFrom: number;
    const view = {
      dispatch: (transaction: Transaction) => {
        selectionFrom = transaction.selection.from;
      },
      dom: root,
      focus,
    // Pullquote quote-icon widgets make the corresponding DOM position
    // ambiguous, so this deliberately returns the opposite boundary.
    posAtDOM: () => 3,
      state
    } as unknown as EditorView;
    let handled = false;
    root.addEventListener('mousedown', (event) => {
      handled = handleChatInputPlaceholderMouseDown(view, event);
    });
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true
    });
    label.dispatchEvent(event);

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(selectionFrom).toBe(2);
    expect(focus).toHaveBeenCalledOnce();
    expect(document.getSelection()?.anchorNode).toBe(placeholder);
    expect(document.getSelection()?.anchorOffset).toBe(0);
    root.remove();
  });

  test('exposes one ProseMirror extension for decoration placeholders', () => {
    expect(ChatInputPlaceholders.name).toBe('chatInputPlaceholders');
  });
});
