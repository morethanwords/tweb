import type {Editor, JSONContent} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {AllSelection, NodeSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import {createRoot} from 'solid-js';
import createChatInputEditor from '@components/chat/inputEditor';
import reloadChatInputEditor, {createChatInputEditorReloadScheduler} from '@components/chat/inputEditor/reload';
import reconcileRichMediaUploads from '@components/chat/inputEditor/reconcileUploads';
import {createRichMediaPreviewUrl} from '@components/chat/inputEditor/mediaPreviewUrl';
import {CHAT_INPUT_EDITOR_TEST_MEDIA_URL} from '@components/chat/inputEditor/testData';
import type {
  ChatInputEditor,
  ChatInputRichMedia,
  ChatInputRichMessage
} from '@components/chat/inputEditor/types';
import type {Document, Photo, RichMessage} from '@layer';
import MarkupTooltip from '@components/chat/markupTooltip';
import '@/materialize.scss';
import '@/scss/style.scss';
import './chatInputEditor.scss';

type ChatInputEditorInternals = ChatInputEditor & {
  editor: Editor
};

type SelectionDescriptor = {
  from: number,
  nodeType?: string,
  parentOffset: number,
  path: string[],
  text: string,
  to: number,
  type: 'all' | 'cell' | 'node' | 'text'
};

export type TextblockDescriptor = {
  from: number,
  path: string[],
  position: number,
  text: string,
  to: number,
  type: string,
  visible: boolean
};

export type TextRangeDescriptor = {
  from: number,
  path: string[],
  text: string,
  to: number,
  visible: boolean
};

export type ChatInputEditorBrowserHarness = {
  beginManagedUpload(action?: 'add' | 'replace'): string | undefined,
  completeManagedUpload(id: string): boolean,
  clipboard(): {html: string, text: string},
  deleteBackward(): boolean,
  destroy(): void,
  enableMarkupTooltip(): void,
  document(): JSONContent,
  generation(): number,
  isComposing(): boolean,
  hasManagedUpload(id: string): boolean,
  insertStructuralBlock(
    type: 'blockMath' | 'code' | 'details' | 'divider' | 'footer' | 'heading' | 'media' | 'table'
  ): boolean,
  insertTestPhoto(previewUrl: string): boolean,
  insertOwnedTestPhoto(previewUrl: string): Promise<string | undefined>,
  insertTestPhotos(previewUrls: string[], slideshow?: boolean): boolean,
  insertTestVideo(previewUrl: string, duration: number): boolean,
  mode(): 'plain' | 'rich',
  nodePositions(type: string): number[],
  openTestLanguageMenu(trigger: HTMLElement): Promise<void>,
  replaceSelectionWithRichMessage(message: RichMessage): boolean,
  resolveAutoCodeLanguages(): Promise<void>,
  revision(): number,
  roundTripSelection(remount: boolean): void,
  richMessage(): ChatInputRichMessage,
  selection(): SelectionDescriptor,
  selectedRichMessage(): ChatInputRichMessage | undefined,
  selectedText(): string,
  selectedLink(): ReturnType<ChatInputEditor['getSelectedLink']>,
  separateHistory(): void,
  undo(): boolean,
  redo(): boolean,
  toggleList(type: 'bulletList' | 'orderedList' | 'taskList'): boolean,
  pasteHTML(html: string): boolean,
  setCaret(position: number): boolean,
  setCaretInNode(type: string, occurrence?: number, offset?: number | 'end'): boolean,
  setCaretInTextblock(index: number, edge?: 'end' | 'start' | number): boolean,
  setDirection(direction: 'ltr' | 'rtl'): void,
  setEditable(editable: boolean): void,
  setExpanded(expanded: boolean): void,
  setCaretInTrailingPlaceholder(): boolean,
  setNodeAttributes(
    type: string,
    occurrence: number,
    attributes: Record<string, unknown>
  ): boolean,
  setNodeSelection(type: string, occurrence?: number): boolean,
  setTextSelection(from: number, to: number, backward?: boolean): boolean,
  setDocument(document: JSONContent): boolean,
  textRanges(): TextRangeDescriptor[],
  textblocks(): TextblockDescriptor[]
};

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness
  }
}

const input = document.querySelector<HTMLElement>('#editor')!;
const editorOptions = {enableBlockSelection: false};
let chatEditor = createChatInputEditor(input, editorOptions);
let tiptap = (chatEditor as ChatInputEditorInternals).editor;
let generation = 1;
const reloadScheduler = createChatInputEditorReloadScheduler(input, () => chatEditor.isComposing);
let disposeTestLanguageMenu: VoidFunction;
let managedUploadsEnabled = false;
let nextManagedUploadId = 0;
const managedUploads = new Map<string, {
  editor: ChatInputEditor,
  id: string,
  items: {uploaded?: ChatInputRichMedia}[]
}>();

function reconcileManagedUploads() {
  if(!managedUploadsEnabled) return;
  reconcileRichMediaUploads(chatEditor, managedUploads, {
    cancel: (task, removeNode) => {
      if(removeNode) task.editor.removeRichMediaUpload(task.id);
      managedUploads.delete(task.id);
    },
    complete: (task) => managedUploads.delete(task.id),
    update: (task) => task.editor.updateRichMediaUpload(task.id, [{
      id: `${task.id}-0`, progress: .4, state: 'uploading', type: 'photo'
    }])
  });
}

input.addEventListener('input', reconcileManagedUploads);

function matchingNode(
  type: string,
  occurrence: number
): {node: ProseMirrorNode, position: number} | undefined {
  let current = 0;
  let match: {node: ProseMirrorNode, position: number};
  tiptap.state.doc.descendants((node, position) => {
    if(node.type.name !== type || current++ !== occurrence) return;
    match = {node, position};
    return false;
  });
  return match;
}

function setCaret(position: number) {
  chatEditor.restoreSelection({from: position, to: position}, false);
  tiptap.view.focus();
  return tiptap.state.selection.from === position && tiptap.state.selection.empty;
}

function insertTestPhoto(previewUrl: string) {
  return chatEditor.insertRichMedia([{
    photo: {
      _: 'photo',
      access_hash: '2',
      file_reference: new Uint8Array([1]),
      id: '1'
    } as Photo.photo,
    previewUrl,
    type: 'photo'
  }]);
}

function insertTestPhotos(previewUrls: string[], slideshow = false) {
  const inserted = chatEditor.insertRichMedia(previewUrls.map((previewUrl, index) => ({
    photo: {
      _: 'photo',
      access_hash: `${index + 102}`,
      file_reference: new Uint8Array([index + 1]),
      id: `${index + 101}`
    } as Photo.photo,
    previewUrl,
    type: 'photo' as const
  })), {grouped: true});
  if(!inserted || !slideshow) return inserted;
  const match = matchingNode('richMedia', 0);
  if(!match) return false;
  tiptap.view.dispatch(tiptap.state.tr.setSelection(
    NodeSelection.create(tiptap.state.doc, match.position)
  ));
  return chatEditor.toggleRichMediaLayout();
}

function insertTestVideo(previewUrl: string, duration: number) {
  return chatEditor.insertRichMedia([{
    document: {
      _: 'document',
      access_hash: '202',
      attributes: [{
        _: 'documentAttributeVideo',
        duration,
        h: 360,
        pFlags: {},
        w: 640
      }],
      file_reference: new Uint8Array([2]),
      id: '201',
      mime_type: 'video/mp4',
      pFlags: {},
      size: 1024,
      type: 'video'
    } as Document.document,
    previewUrl,
    type: 'video'
  }]);
}

function textblocks() {
  const blocks: Array<{node: ProseMirrorNode, position: number}> = [];
  tiptap.state.doc.descendants((node, position) => {
    if(node.isTextblock) blocks.push({node, position});
  });
  return blocks;
}

function textblockDescriptors(): TextblockDescriptor[] {
  return textblocks().map(({node, position}) => {
    const resolved = tiptap.state.doc.resolve(position + 1);
    const path = Array.from(
      {length: resolved.depth + 1},
      (_value, depth) => resolved.node(depth).type.name
    );
    const dom = tiptap.view.nodeDOM(position);
    const element = dom?.nodeType === Node.ELEMENT_NODE ?
      dom as HTMLElement :
      dom?.parentElement;
    const hiddenAncestor = element?.closest<HTMLElement>(
      '[aria-hidden="true"], [hidden], [inert]'
    );
    const style = element && getComputedStyle(element);
    const hiddenByModel = (
      resolved.depth > 1 &&
      resolved.node(1).type.name === 'details' &&
      !resolved.node(1).attrs.open &&
      path.includes('detailsBody')
    );
    return {
      from: position + 1,
      path,
      position,
      text: node.textContent,
      to: position + 1 + node.content.size,
      type: node.type.name,
      visible: !!element && !hiddenAncestor && !hiddenByModel &&
        style?.display !== 'none' &&
        style?.visibility !== 'hidden' &&
        element.getClientRects().length > 0
    };
  });
}

function textRangeDescriptors(): TextRangeDescriptor[] {
  const blocks = textblockDescriptors();
  const ranges: TextRangeDescriptor[] = [];
  tiptap.state.doc.descendants((node, position) => {
    if(!node.isText) return;
    const block = blocks.find(({from, to}) => position >= from && position + node.nodeSize <= to);
    if(!block) return;
    ranges.push({
      from: position,
      path: block.path,
      text: node.text,
      to: position + node.nodeSize,
      visible: block.visible
    });
  });
  return ranges;
}

window.chatInputEditorHarness = {
  clipboard: () => {
    const result = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    return {html: result.dom.innerHTML, text: result.text};
  },
  beginManagedUpload: (action) => {
    const id = `fixture-upload-${++nextManagedUploadId}`;
    const inserted = chatEditor.beginRichMediaUpload({
      action,
      activeIndex: action ? 0 : undefined,
      id,
      items: [{id: `${id}-0`, progress: .2, state: 'uploading', type: 'photo'}],
      previewUrls: [CHAT_INPUT_EDITOR_TEST_MEDIA_URL],
      selection: chatEditor.captureSelection()
    });
    if(!inserted) return;
    managedUploadsEnabled = true;
    managedUploads.set(id, {editor: chatEditor, id, items: [{}]});
    return id;
  },
  completeManagedUpload: (id) => {
    const task = managedUploads.get(id);
    if(!task) return false;
    task.items[0].uploaded = {
      type: 'photo',
      photo: {_: 'photo', id: '901', access_hash: '1', file_reference: new Uint8Array([1])} as Photo.photo
    };
    reconcileManagedUploads();
    return true;
  },
  hasManagedUpload: (id) => managedUploads.has(id),
  deleteBackward: () => chatEditor.deleteBackward(),
  destroy: () => {
    disposeTestLanguageMenu?.();
    reloadScheduler.destroy();
    managedUploads.clear();
    managedUploadsEnabled = false;
    chatEditor.destroy();
  },
  enableMarkupTooltip: () => MarkupTooltip.getInstance().handleSelection(),
  document: () => chatEditor.getDocument(),
  generation: () => generation,
  selectedText: () => chatEditor.getSelectedText(),
  selectedLink: () => chatEditor.getSelectedLink(),
  separateHistory: () => chatEditor.separateHistory(),
  undo: () => chatEditor.undo(),
  redo: () => chatEditor.redo(),
  toggleList: (type) => type === 'bulletList' ? chatEditor.toggleBulletList() :
    type === 'orderedList' ? chatEditor.toggleOrderedList() : chatEditor.toggleTaskList(),
  pasteHTML: (html) => tiptap.view.pasteHTML(html),
  revision: () => chatEditor.captureSelection().revision,
  roundTripSelection: (remount) => {
    if(remount) {
      reloadScheduler.run(() => {
        const snapshot = chatEditor.snapshot();
        disposeTestLanguageMenu?.();
        chatEditor = reloadChatInputEditor(chatEditor, createChatInputEditor, editorOptions, snapshot);
        ++generation;
        tiptap = (chatEditor as ChatInputEditorInternals).editor;
        managedUploads.forEach((task) => task.editor = chatEditor);
        reconcileManagedUploads();
      });
    } else {
      const selection = chatEditor.captureSelection();
      chatEditor.focusAtEnd();
      chatEditor.restoreSelection(selection);
    }
  },
  isComposing: () => chatEditor.isComposing,
  insertStructuralBlock: (type) => {
    switch(type) {
      case 'blockMath': return chatEditor.insertBlockMath('x^2');
      case 'code': return chatEditor.insertCodeBlock();
      case 'details': return chatEditor.insertDetails();
      case 'divider': return chatEditor.insertDivider();
      case 'footer': return chatEditor.insertFooter();
      case 'heading': return chatEditor.toggleHeading(2);
      case 'media': return insertTestPhoto(
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
      );
      case 'table': return chatEditor.insertTable();
    }
  },
  insertTestPhoto,
  insertOwnedTestPhoto: async(previewUrl) => {
    const blob = await fetch(previewUrl).then((response) => response.blob());
    const preview = createRichMediaPreviewUrl(blob);
    try {
      return insertTestPhoto(preview.url) ? preview.url : undefined;
    } finally {
      preview.release();
    }
  },
  insertTestPhotos,
  insertTestVideo,
  mode: () => chatEditor.getMode(),
  nodePositions: (type) => {
    const positions: number[] = [];
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === type) positions.push(position);
    });
    return positions;
  },
  openTestLanguageMenu: async(trigger) => {
    const {createButtonMenuSelect} = await import('@components/buttonMenuSelect');
    disposeTestLanguageMenu?.();
    let menu: ReturnType<typeof createButtonMenuSelect<string>>;
    createRoot((dispose) => {
      disposeTestLanguageMenu = dispose;
      const options = Array.from(
        {length: 20},
        (_value, index) => `Language ${index + 1}`
      );
      menu = createButtonMenuSelect<string>({
        class: 'chat-input-code-language-menu',
        direction: 'bottom-right',
        emptyText: 'No results',
        floatingDirection: 'bottom-start',
        floatingOptions: {constrainHeight: true, flip: false},
        onValueChange: () => {},
        optionKey: (option) => option,
        optionSearchText: (option) => option,
        options,
        renderOption: ({option}) => option,
        single: true,
        value: []
      });
    });
    return menu!.open(trigger);
  },
  replaceSelectionWithRichMessage: (message) => {
    const {from, to} = chatEditor.captureSelection();
    return chatEditor.replaceDocumentRangeWithRichMessage(from, to, message);
  },
  resolveAutoCodeLanguages: () => chatEditor.resolveAutoCodeLanguages(),
  richMessage: () => chatEditor.getRichMessage(),
  selection: () => {
    const {selection} = tiptap.state;
    const {$from} = selection;
    const type = selection instanceof AllSelection ?
      'all' :
      selection instanceof CellSelection ?
        'cell' :
        selection instanceof NodeSelection ? 'node' : 'text';
    return {
      from: selection.from,
      nodeType: selection instanceof NodeSelection ? selection.node.type.name : undefined,
      parentOffset: $from.parentOffset,
      path: Array.from(
        {length: $from.depth + 1},
        (_value, depth) => $from.node(depth).type.name
      ),
      text: $from.parent.textContent,
      to: selection.to,
      type
    };
  },
  selectedRichMessage: () => chatEditor.getSelectedRichMessage(),
  setCaret,
  setCaretInNode: (type, occurrence = 0, offset = 0) => {
    const match = matchingNode(type, occurrence);
    if(!match) return false;
    const childOffset = offset === 'end' ? match.node.content.size : offset;
    return setCaret(match.position + 1 + childOffset);
  },
  setCaretInTextblock: (index, edge = 'start') => {
    const match = textblocks()[index];
    if(!match) return false;
    const offset = typeof(edge) === 'number' ?
      edge :
      edge === 'end' ? match.node.content.size : 0;
    if(offset < 0 || offset > match.node.content.size) return false;
    return setCaret(match.position + 1 + offset);
  },
  setDirection: (direction) => input.dir = direction,
  setEditable: (editable) => chatEditor.setEditable(editable),
  setExpanded: (expanded) => chatEditor.setExpanded(expanded),
  setCaretInTrailingPlaceholder: () => {
    const trailing = tiptap.state.doc.lastChild;
    if(trailing?.type.name !== 'paragraph' || trailing.content.size) return false;
    return setCaret(tiptap.state.doc.content.size - trailing.nodeSize + 1);
  },
  setDocument: (document) => {
    managedUploads.clear();
    managedUploadsEnabled = false;
    return chatEditor.setDocument(document);
  },
  setNodeAttributes: (type, occurrence, attributes) => {
    const match = matchingNode(type, occurrence);
    if(!match) return false;
    tiptap.view.dispatch(tiptap.state.tr.setNodeMarkup(
      match.position,
      undefined,
      {...match.node.attrs, ...attributes}
    ));
    return true;
  },
  setNodeSelection: (type, occurrence = 0) => {
    const match = matchingNode(type, occurrence);
    if(!match || !NodeSelection.isSelectable(match.node)) return false;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, match.position)
    ));
    tiptap.view.focus();
    return tiptap.state.selection instanceof NodeSelection &&
      tiptap.state.selection.from === match.position;
  },
  setTextSelection: (from, to, backward) => {
    chatEditor.restoreSelection({from, to, ...(backward ? {backward: true as const} : {})});
    return tiptap.state.selection.from === from && tiptap.state.selection.to === to;
  },
  textRanges: textRangeDescriptors,
  textblocks: textblockDescriptors
};

document.documentElement.dataset.editorFixtureReady = '';
