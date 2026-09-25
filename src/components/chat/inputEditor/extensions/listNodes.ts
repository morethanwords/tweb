import {Extension, NodeViewRendererProps, getRenderedAttributes, wrappingInputRule} from '@tiptap/core';
import {ListItem, TaskItem, TaskList} from '@tiptap/extension-list';
import {inputRegex as taskItemInputRegex} from '@tiptap/extension-list/task-item';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {createComponent, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {instantViewStyles} from '@components/instantViewFormatting';
import {StaticCheckbox} from '@components/staticCheckbox';
import {deleteEmptyNonTerminalListItem, joinListItemParagraphBackward} from '@components/chat/inputEditor/listCommands';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {setElementAttributes} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

function checkboxListItemNodeView(
  props: NodeViewRendererProps,
  options: {alwaysCheckbox: boolean, staticClass?: string}
) {
  const {editor, getPos} = props;
  let currentNode = props.node;
  let renderedAttributeNames = new Set<string>();
  const listItem = document.createElement('li');
  const checkboxButton = document.createElement('button');
  const content = document.createElement('div');
  content.className = instantViewStyles.ListItemContent;
  const [checked, setChecked] = createSignal(!!currentNode.attrs.checked);

  checkboxButton.type = 'button';
  checkboxButton.className = classNames(
    instantViewStyles.TaskCheckboxButton,
    'chat-input-checklist-button'
  );
  checkboxButton.contentEditable = 'false';
  checkboxButton.tabIndex = 0;
  content.dataset.chatInputListItemContent = '';
  checkboxButton.addEventListener('mousedown', (event) => event.preventDefault());

  const disposeCheckbox = render(() => createComponent(StaticCheckbox, {
    class: instantViewStyles.TaskCheckbox,
    get checked() {
      return checked();
    }
  }), checkboxButton);

  const isCheckbox = () => options.alwaysCheckbox || currentNode.attrs.checkbox === true;
  const update = (node: ProseMirrorNode) => {
    if(node.type !== currentNode.type) return false;
    currentNode = node;

    const attributes = getRenderedAttributes(node, editor.extensionManager.attributes);
    renderedAttributeNames.forEach((name) => {
      if(!(name in attributes)) listItem.removeAttribute(name);
    });
    setElementAttributes(listItem, attributes);
    renderedAttributeNames = new Set(Object.keys(attributes));

    listItem.className = classNames(
      typeof(attributes.class) === 'string' ? attributes.class : '',
      instantViewStyles.ListItem,
      'chat-input-list-item',
      options.staticClass
    );
    listItem.dataset.checkbox = isCheckbox() ? 'true' : 'false';
    listItem.dataset.checked = currentNode.attrs.checked ? 'true' : 'false';
    checkboxButton.hidden = !isCheckbox();
    checkboxButton.disabled = !editor.isEditable;
    checkboxButton.setAttribute('role', 'checkbox');
    checkboxButton.setAttribute('aria-checked', currentNode.attrs.checked ? 'true' : 'false');
    checkboxButton.setAttribute(
      'aria-label',
      I18n.format(currentNode.attrs.checked ? 'ChecklistUncheck' : 'ChecklistCheck', true)
    );
    setChecked(!!currentNode.attrs.checked);
    return true;
  };

  checkboxButton.addEventListener('click', (event) => {
    event.preventDefault();
    if(!editor.isEditable || !isCheckbox() || typeof(getPos) !== 'function') return;
    const focusEditor = event.detail > 0;
    const position = getPos();
    if(typeof(position) !== 'number') return;

    const node = editor.state.doc.nodeAt(position);
    if(node?.type !== currentNode.type) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      checkbox: options.alwaysCheckbox ? node.attrs.checkbox : true,
      checked: !node.attrs.checked
    }));
    if(focusEditor) editor.view.focus();
  });

  listItem.append(checkboxButton, content);
  update(currentNode);
  return {
    dom: listItem,
    contentDOM: content,
    update,
    destroy: disposeCheckbox
  };
}

export const ChatListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      'Enter': () => {
        const attributes = this.editor.getAttributes(this.name);
        return this.editor.commands.splitListItem(this.name, attributes.checkbox ? {
          checkbox: true,
          checked: false
        } : undefined);
      },
      'Tab': () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name)
    };
  },

  addNodeView() {
    return (props) => checkboxListItemNodeView(props, {
      alwaysCheckbox: false,
      staticClass: 'chat-input-list-item-regular'
    });
  }
});

export const ChatListBackspace = Extension.create({
  name: 'chatListBackspace',
  priority: 110,

  addKeyboardShortcuts() {
    const backspace = () => this.editor.commands.command(({state, dispatch}) => (
      joinListItemParagraphBackward(state, dispatch) || deleteEmptyNonTerminalListItem(state, dispatch)
    ));
    return {
      Backspace: backspace,
      'Mod-Backspace': backspace
    };
  }
});

export const ChatTaskList = TaskList.configure({
  HTMLAttributes: {
    class: classNames(
      'browser-default chat-input-list chat-input-task-list',
      instantViewStyles.List,
      instantViewStyles.ListChecklist,
      instantViewStyles.BlockContainer,
      instantViewStyles.BlockGutter
    )
  }
});

export const ChatTaskItem = TaskItem.extend({
  addInputRules() {
    return [wrappingInputRule({
      find: new RegExp(taskItemInputRegex.source, 'i'),
      type: this.type,
      getAttributes: (match) => ({checked: match[match.length - 1]?.toLowerCase() === 'x'})
    })];
  },

  addNodeView() {
    return (props) => checkboxListItemNodeView(props, {
      alwaysCheckbox: true,
      staticClass: 'chat-input-task-item'
    });
  }
}).configure({nested: true});
