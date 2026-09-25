import {Node} from '@tiptap/core';
import type {Editor, JSONContent, NodeViewRendererProps} from '@tiptap/core';
import type {Schema} from '@tiptap/pm/model';
import type {NodeView} from '@tiptap/pm/view';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import type {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {getPageButtonClasses, getPageButtonRowClasses, instantViewStyles} from '@components/instantViewFormatting';
import type {ChatInputButtonRowAlign, ChatInputRichButton} from '@components/chat/inputEditor/types';
import {
  BUTTON_ROW_NODE_NAME,
  MAX_BUTTONS_PER_ROW,
  RICH_BUTTON_NODE_NAME,
  RichButtonAttributes,
  getButtonRowAlign,
  isRichButtonAction,
  richButtonAttributes,
  richButtonFromAttributes,
  richButtonLabelText
} from '@components/chat/inputEditor/richButtonModel';
import ListenerSetter from '@helpers/listenerSetter';
import cancelEvent from '@helpers/dom/cancelEvent';
import classNames from '@helpers/string/classNames';

/**
 * Layer 229's buttons, as a user puts them into a rich message: one inside the text (`richButton`,
 * sent as `textButton`) and a row of them on a line of their own (`buttonRow`, sent as
 * `pageBlockButtonRow`). Both are leaves drawn the way the message will draw them; a click opens
 * the button's box, the way desktop and WebA edit them.
 */

export function createRichButtonNode(schema: Schema, button: ChatInputRichButton, label?: JSONContent[]) {
  return schema.nodes[RICH_BUTTON_NODE_NAME].create(richButtonAttributes(button, label));
}

/** Keeps the label's custom emoji and dates when the box left its text as it was. */
function editedButtonAttributes(previous: RichButtonAttributes, button: ChatInputRichButton) {
  const label = button.text === richButtonLabelText(previous.label) ? previous.label : undefined;
  return richButtonAttributes(button, label);
}

function parseButtonAttributes(value: unknown): RichButtonAttributes | undefined {
  const attrs = value as RichButtonAttributes;
  if(!attrs || !isRichButtonAction(attrs.action)) return;
  return richButtonAttributes(richButtonFromAttributes(attrs), Array.isArray(attrs.label) ? attrs.label : []);
}

function parseJSONAttribute(element: HTMLElement, name: string) {
  try {
    return JSON.parse(element.getAttribute(name) || '');
  } catch{}
}

/**
 * A chip is a native button, like the details toggle: Tab reaches it, Enter and Space open its
 * box, and the editor leaves its keys alone (`stopEvent`).
 */
function createRichButtonElement() {
  const element = document.createElement('button');
  element.type = 'button';
  element.contentEditable = 'false';
  element.setAttribute('aria-haspopup', 'dialog');
  return element;
}

const CHIP_EVENTS = new Set(['click', 'mousedown', 'keydown', 'keypress', 'keyup']);

/** Draws a button the way the message will, minus what it does: here a click edits it. */
function renderRichButton(element: HTMLElement, attrs: RichButtonAttributes, inline: boolean) {
  const {action, color, link, url, copyText} = attrs;
  element.className = classNames(
    'chat-input-rich-button',
    ...getPageButtonClasses(color, link),
    inline && instantViewStyles.PageButtonInline,
    action === 'disabled' && 'chat-input-rich-button-disabled'
  );
  element.textContent = richButtonLabelText(attrs.label) || ' ';
  // desktop shows where a link button leads on hover; a copy button shows what it copies
  element.title = action === 'url' ? url : action === 'copy' ? copyText : '';
}

async function requestButton(button?: ChatInputRichButton) {
  const {default: showRichButtonPopup} = await import('@components/popups/richButton');
  try {
    return await showRichButtonPopup({button});
  } catch{}
}

async function editInlineButton(editor: Editor, position: number) {
  const node = editor.state.doc.nodeAt(position);
  if(node?.type.name !== RICH_BUTTON_NODE_NAME) return;
  const result = await requestButton(richButtonFromAttributes(node.attrs));
  // the document may have moved on while the box was open
  if(!result || editor.isDestroyed || editor.state.doc.nodeAt(position) !== node) return;
  const transaction = 'delete' in result ?
    editor.state.tr.delete(position, position + node.nodeSize) :
    editor.state.tr.setNodeMarkup(position, undefined, editedButtonAttributes(node.attrs as RichButtonAttributes, result.button));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
}

function createRichButtonView({editor, getPos, node: initialNode}: NodeViewRendererProps): NodeView {
  let node = initialNode;
  const dom = createRichButtonElement();
  renderRichButton(dom, node.attrs as RichButtonAttributes, true);
  dom.addEventListener('click', (event) => {
    cancelEvent(event);
    const position = getPos();
    if(typeof(position) === 'number') void editInlineButton(editor, position);
  });

  return {
    dom,
    update: (updatedNode) => {
      if(updatedNode.type !== node.type) return false;
      node = updatedNode;
      renderRichButton(dom, node.attrs as RichButtonAttributes, true);
      return true;
    },
    stopEvent: (event) => CHIP_EVENTS.has(event.type),
    ignoreMutation: () => true
  };
}

type ButtonRowAttributes = {align: ChatInputButtonRowAlign | null, buttons: RichButtonAttributes[]};

function createButtonRowView({editor, getPos, node: initialNode}: NodeViewRendererProps): NodeView {
  let node = initialNode;
  const listenerSetter = new ListenerSetter();
  const dom = document.createElement('div');
  dom.contentEditable = 'false';
  dom.dataset.buttonRow = '';
  const buttonsElement = document.createElement('div');

  // every change to the row goes through here, against the row as it is by then; a row left
  // without buttons goes away
  const updateRow = (update: (attrs: ButtonRowAttributes) => void) => {
    const position = getPos();
    const row = typeof(position) === 'number' ? editor.state.doc.nodeAt(position) : undefined;
    if(row?.type.name !== BUTTON_ROW_NODE_NAME) return;
    const attrs: ButtonRowAttributes = {align: row.attrs.align, buttons: [...row.attrs.buttons]};
    update(attrs);
    editor.view.dispatch(attrs.buttons.length ?
      editor.state.tr.setNodeMarkup(position, undefined, attrs) :
      editor.state.tr.delete(position, position + row.nodeSize));
    editor.view.focus();
  };

  const editButton = async(index: number) => {
    const previous: RichButtonAttributes = node.attrs.buttons[index];
    const result = await requestButton(richButtonFromAttributes(previous));
    if(!result || editor.isDestroyed) return;
    updateRow((attrs) => {
      const current = attrs.buttons.indexOf(previous);
      if(current === -1) return;
      if('delete' in result) attrs.buttons.splice(current, 1);
      else attrs.buttons[current] = editedButtonAttributes(previous, result.button);
    });
  };

  const addButton = async() => {
    const result = await requestButton();
    if(!result || 'delete' in result || editor.isDestroyed) return;
    updateRow((attrs) => {
      if(attrs.buttons.length < MAX_BUTTONS_PER_ROW) attrs.buttons.push(richButtonAttributes(result.button));
    });
  };

  const alignButton = (
    align: ChatInputButtonRowAlign | null,
    icon: Icon,
    text: ButtonMenuItemOptionsVerifiable['text']
  ): ButtonMenuItemOptionsVerifiable => ({
    icon,
    text,
    onClick: () => updateRow((attrs) => attrs.align = align),
    verify: () => getButtonRowAlign(node.attrs.align) !== align
  });

  const menu = ButtonMenuToggle({
    listenerSetter,
    direction: 'bottom-left',
    buttonOptions: {noRipple: true, ariaLabel: 'Chat.Input.Editor.Toolbar.More'},
    buttons: [{
      icon: 'add',
      text: 'Chat.Input.Editor.ButtonRow.Add',
      onClick: () => void addButton(),
      verify: () => node.attrs.buttons.length < MAX_BUTTONS_PER_ROW
    },
    alignButton(null, 'app_expand', 'Chat.Input.Editor.ButtonRow.Stretch'),
    alignButton('left', 'align_left', 'Chat.Input.Editor.ButtonRow.AlignLeft'),
    alignButton('center', 'align_center', 'Chat.Input.Editor.ButtonRow.AlignCenter'),
    alignButton('right', 'align_right', 'Chat.Input.Editor.ButtonRow.AlignRight'),
    {
      icon: 'delete',
      text: 'Chat.Input.Editor.ButtonRow.Delete',
      danger: true,
      separator: true,
      onClick: () => updateRow((attrs) => attrs.buttons = [])
    }]
  });
  menu.classList.add('chat-input-button-row-menu');
  dom.append(buttonsElement, menu);

  const render = () => {
    const align = getButtonRowAlign(node.attrs.align);
    dom.className = classNames(instantViewStyles.Padding, 'chat-input-button-row');
    buttonsElement.className = classNames(...getPageButtonRowClasses(align || undefined), 'chat-input-button-row-buttons');
    buttonsElement.replaceChildren(...(node.attrs.buttons as RichButtonAttributes[]).map((attrs, index) => {
      const element = createRichButtonElement();
      renderRichButton(element, attrs, false);
      element.addEventListener('click', (event) => {
        cancelEvent(event);
        void editButton(index);
      });
      return element;
    }));
  };
  render();

  return {
    dom,
    update: (updatedNode) => {
      if(updatedNode.type !== node.type) return false;
      node = updatedNode;
      render();
      return true;
    },
    stopEvent: (event) => event.target !== dom && CHIP_EVENTS.has(event.type),
    ignoreMutation: () => true,
    destroy: () => listenerSetter.removeAll()
  };
}

function buttonRowText(buttons: RichButtonAttributes[]) {
  return buttons.map((attrs) => richButtonLabelText(attrs.label)).join(' ');
}

export const ChatRichButton = Node.create({
  name: RICH_BUTTON_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      action: {default: 'url', rendered: false},
      url: {default: '', rendered: false},
      copyText: {default: '', rendered: false},
      userId: {default: null, rendered: false},
      color: {default: null, rendered: false},
      link: {default: false, rendered: false},
      label: {default: [], rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-chat-rich-button]',
      getAttrs: (element) => parseButtonAttributes(parseJSONAttribute(element, 'data-chat-rich-button')) || false
    }];
  },

  renderHTML({node}) {
    return ['span', {'data-chat-rich-button': JSON.stringify(node.attrs)}, richButtonLabelText(node.attrs.label)];
  },

  renderText({node}) {
    return richButtonLabelText(node.attrs.label);
  },

  addNodeView() {
    return createRichButtonView;
  }
});

export const ChatButtonRow = Node.create({
  name: BUTTON_ROW_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      align: {default: null, rendered: false},
      buttons: {default: [], rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-button-row]',
      getAttrs: (element) => {
        const buttons = ((parseJSONAttribute(element, 'data-buttons') || []) as unknown[])
        .map(parseButtonAttributes)
        .filter(Boolean)
        .slice(0, MAX_BUTTONS_PER_ROW);
        return buttons.length ? {align: getButtonRowAlign(element.getAttribute('data-align')), buttons} : false;
      }
    }];
  },

  renderHTML({node}) {
    return ['div', {
      'data-button-row': '',
      'data-align': node.attrs.align || undefined,
      'data-buttons': JSON.stringify(node.attrs.buttons)
    }, buttonRowText(node.attrs.buttons)];
  },

  renderText({node}) {
    return buttonRowText(node.attrs.buttons);
  },

  addNodeView() {
    return createButtonRowView;
  }
});
