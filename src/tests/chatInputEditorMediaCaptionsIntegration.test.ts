import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import type {JSONContent} from '@tiptap/core';
import {closeHistory} from '@tiptap/pm/history';
import {NodeSelection, TextSelection} from '@tiptap/pm/state';
import type {Photo} from '@layer';

describe('Tiptap chat input editor: MediaCaptions', () => {
  const {mountEditor, logicalContent} = useChatInputEditorHarness();

  test('inserts repeated clipboard media after the media whose caption is focused', () => {
    const {editor, input} = mountEditor();
    const photo = {
      _: 'photo',
      id: '294',
      access_hash: '394',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const media = {
      type: 'photo' as const,
      photo,
      previewUrl: 'blob:repeated-clipboard-photo'
    };
    const insertPaste = (id: string) => {
      expect(editor.beginRichMediaUploads([{
        grouped: false,
        id,
        items: [{
          id: `${id}-0`,
          progress: 1,
          state: 'ready',
          type: 'photo'
        }],
        previewUrls: [media.previewUrl],
        selection: editor.captureSelection()
      }])).toBe(true);
      expect(editor.completeRichMediaUpload(id, [media])).toBe(true);
    };

    insertPaste('repeated-paste-1');
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1)
    ));
    insertPaste('repeated-paste-2');

    const mediaNodes = logicalContent(tiptap).filter(({type}) => type === 'richMedia');
    expect(mediaNodes).toHaveLength(2);
    expect(mediaNodes.map(({attrs}) => attrs?.block?.photo_id))
    .toEqual([photo.id, photo.id]);
    expect(input.querySelectorAll('.chat-input-rich-media')).toHaveLength(2);
  });

  test.each([
    {caption: '', caretOffset: 0},
    {caption: 'Media caption', caretOffset: 'Media caption'.length}
  ])('inserts a table after media from its $caption caption', ({caption, caretOffset}) => {
    const {editor} = mountEditor();
    const photo = {
      _: 'photo',
      id: '295',
      access_hash: '395',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl: 'blob:table-after-media-photo'
    }])).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1)
    ));
    if(caption) expect(tiptap.commands.insertContent(caption)).toBe(true);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1 + caretOffset)
    ));
    editor.separateHistory();
    const beforeTable = tiptap.state.doc.toJSON();

    expect(editor.insertTable()).toBe(true);
    const content = logicalContent(tiptap);
    expect(content.map(({type}) => type)).toEqual(['richMedia', 'chatTableWrapper']);
    expect(content[0]).toMatchObject({
      attrs: {block: {photo_id: photo.id}},
      type: 'richMedia'
    });
    expect(content[0].content).toEqual(
      caption ? [{type: 'text', text: caption}] : undefined
    );
    expect(Array.from(
      {length: tiptap.state.selection.$from.depth + 1},
      (_value, depth) => tiptap.state.selection.$from.node(depth).type.name
    )).toContain('table');
    const afterTable = tiptap.state.doc.toJSON();
    expect(editor.undo()).toBe(true);
    expect(tiptap.state.doc.toJSON()).toEqual(beforeTable);
    expect(editor.redo()).toBe(true);
    expect(tiptap.state.doc.toJSON()).toEqual(afterTable);
  });

  test('deletes the current media from its empty caption instead of the media above', () => {
    const {editor, input} = mountEditor();
    const first = {
      _: 'photo',
      id: '297',
      access_hash: '397',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const second = {
      _: 'photo',
      id: '298',
      access_hash: '398',
      file_reference: new Uint8Array([2])
    } as Photo.photo;

    expect(editor.insertRichMedia([
      {type: 'photo', photo: first, previewUrl: 'blob:first-backspace-photo'},
      {type: 'photo', photo: second, previewUrl: 'blob:second-backspace-photo'}
    ])).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));
    const firstNode = tiptap.state.doc.firstChild!;
    const secondPosition = firstNode.nodeSize;
    expect(tiptap.state.doc.nodeAt(secondPosition)?.type.name).toBe('richMedia');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, secondPosition + 1)
    ));
    expect(tiptap.state.selection.$from.parent.type.name).toBe('richMedia');
    expect(tiptap.state.selection.$from.parentOffset).toBe(0);

    const backspace = new KeyboardEvent('keydown', {key: 'Backspace'});
    expect(tiptap.view.someProp(
      'handleKeyDown',
      (handler) => handler(tiptap.view, backspace)
    )).toBe(true);
    const media = logicalContent(tiptap).filter(({type}) => type === 'richMedia');
    expect(media).toHaveLength(1);
    expect(media[0].attrs?.block).toMatchObject({
      _: 'pageBlockPhoto',
      photo_id: first.id
    });
    expect(input.querySelectorAll('.chat-input-rich-media')).toHaveLength(1);

    expect(editor.undo()).toBe(true);
    expect(logicalContent(tiptap).filter(({type}) => type === 'richMedia'))
    .toHaveLength(2);
  });

  test('selects the current media at the start of a non-empty caption', () => {
    const {editor} = mountEditor();
    const first = {
      _: 'photo',
      id: '295',
      access_hash: '395',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const second = {
      _: 'photo',
      id: '296',
      access_hash: '396',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: first, previewUrl: 'blob:first-caption-photo'},
      {type: 'photo', photo: second, previewUrl: 'blob:second-caption-photo'}
    ])).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const secondPosition = tiptap.state.doc.firstChild!.nodeSize;
    const captionTransaction = tiptap.state.tr.insertText('Caption', secondPosition + 1);
    tiptap.view.dispatch(captionTransaction.setSelection(TextSelection.create(
      captionTransaction.doc,
      secondPosition + 1
    )));

    const backspace = new KeyboardEvent('keydown', {key: 'Backspace'});
    expect(tiptap.view.someProp(
      'handleKeyDown',
      (handler) => handler(tiptap.view, backspace)
    )).toBe(true);
    expect(logicalContent(tiptap).filter(({type}) => type === 'richMedia'))
    .toHaveLength(2);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect(tiptap.state.selection.from).toBe(secondPosition);
  });

  test('Backspace from the trailing placeholder selects the adjacent divider', () => {
    const {editor} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text: 'Before divider'}]
      }, {
        type: 'richDivider'
      }]
    })).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const trailing = tiptap.state.doc.lastChild!;
    const trailingPosition = tiptap.state.doc.content.size - trailing.nodeSize;
    const dividerPosition = tiptap.state.doc.firstChild!.nodeSize;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, trailingPosition + 1)
    ));

    const backspace = new KeyboardEvent('keydown', {key: 'Backspace'});
    expect(tiptap.view.someProp(
      'handleKeyDown',
      (handler) => handler(tiptap.view, backspace)
    )).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect((tiptap.state.selection as NodeSelection).node.type.name).toBe('richDivider');
    expect(tiptap.state.selection.from).toBe(dividerPosition);
    expect(tiptap.state.doc.firstChild?.textContent).toBe('Before divider');
  });

  test.each(['keyboard', 'beforeinput', 'virtual'].flatMap((source) => ['', 'Caption'].map((caption) => ({source, caption}))))('removes a user-created empty paragraph after media with $source Backspace and caption=$caption', ({source, caption}) => {
    const {editor, input} = mountEditor(undefined, {enableBlockSelection: false});
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo: {_: 'photo', id: '298', access_hash: '398', file_reference: new Uint8Array([1])} as Photo.photo,
      previewUrl: 'blob:empty-paragraph-photo'
    }])).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    if(caption) {
      editor.restoreSelection({from: 1, to: 1}, false);
      editor.replaceSelection(caption);
    }
    const original = editor.getDocument();
    const paragraphPosition = tiptap.state.doc.firstChild!.nodeSize;
    editor.restoreSelection({from: paragraphPosition + 1, to: paragraphPosition + 1}, false);
    tiptap.view.someProp('handleKeyDown', (handler) => handler(tiptap.view, new KeyboardEvent('keydown', {key: 'Enter'})));
    expect(tiptap.state.doc.childCount).toBe(3);
    const withEmptyParagraph = editor.getDocument();
    editor.restoreSelection({from: paragraphPosition + 1, to: paragraphPosition + 1}, false);
    editor.separateHistory();

    const handled = source === 'virtual' ? editor.deleteBackward() : source === 'beforeinput' ?
      tiptap.view.someProp('handleDOMEvents').beforeinput(tiptap.view, new InputEvent('beforeinput', {
        cancelable: true, inputType: 'deleteContentBackward'
      })) : tiptap.view.someProp('handleKeyDown', (handler) => handler(tiptap.view, new KeyboardEvent('keydown', {key: 'Backspace'})));

    expect(handled).toBe(true);
    expect(editor.getDocument()).toEqual(original);
    expect(input.querySelectorAll('[data-chat-input-paragraph]')).toHaveLength(1);
    expect(input.querySelector('.chat-input-rich-media.ProseMirror-selectednode')).toBeNull();
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('richMedia');
    expect(tiptap.state.selection.$from.parentOffset).toBe(caption.length);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(withEmptyParagraph);
    expect(editor.captureSelection()).toMatchObject({from: paragraphPosition + 1, to: paragraphPosition + 1});
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(original);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('richMedia');
    expect(tiptap.state.selection.$from.parentOffset).toBe(caption.length);
  });

  test.each(['keyboard', 'beforeinput', 'virtual'].flatMap((source) => ['empty', 'text', 'credit'].map((caption) => ({source, caption}))))(
    'Backspace from the trailing placeholder enters the media caption with $source and $caption content',
    ({source, caption}) => {
      const {editor, input} = mountEditor(undefined, {enableBlockSelection: false});
      expect(editor.insertRichMedia([{
        type: 'photo',
        photo: {_: 'photo', id: '298', access_hash: '398', file_reference: new Uint8Array([1])} as Photo.photo,
        previewUrl: 'blob:empty-caption-photo'
      }])).toBe(true);
      const tiptap = (editor as TiptapEditorInternals).editor;
      const document = editor.getDocument();
      if(caption === 'text') document.content[0].content = [{type: 'text', text: 'A😀B', marks: [{type: 'bold'}]}];
      if(caption === 'credit') document.content[0].attrs.captionCredit = {_: 'textPlain', text: 'Credit'};
      expect(editor.setDocument(document)).toBe(true);
      const original = editor.getDocument();
      const trailingPosition = tiptap.state.doc.content.size - tiptap.state.doc.lastChild!.nodeSize;
      editor.restoreSelection({from: trailingPosition + 1, to: trailingPosition + 1}, false);
      const media = input.querySelector('.chat-input-rich-media');
      const preview = media.querySelector('.chat-input-rich-media-preview');
      const handled = source === 'virtual' ? editor.deleteBackward() : source === 'beforeinput' ?
        tiptap.view.someProp('handleDOMEvents').beforeinput(tiptap.view, new InputEvent('beforeinput', {
          cancelable: true, inputType: 'deleteContentBackward'
        })) : tiptap.view.someProp('handleKeyDown', (handler) => handler(tiptap.view, new KeyboardEvent('keydown', {key: 'Backspace'})));

      expect(handled).toBe(true);
      expect(editor.getDocument()).toEqual(original);
      expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
      expect(tiptap.state.selection.$from.parent.type.name).toBe('richMedia');
      expect(tiptap.state.selection.$from.parentOffset).toBe(caption === 'text' ? 'A😀B'.length : 0);
      expect(input.querySelector('.chat-input-rich-media.ProseMirror-selectednode')).toBeNull();
      expect(input.querySelector('.chat-input-block-selected')).toBeNull();
      expect(input.querySelector('.chat-input-rich-media')).toBe(media);
      expect(media.querySelector('.chat-input-rich-media-preview')).toBe(preview);
      expect(input.querySelectorAll('[data-chat-input-paragraph]')).toHaveLength(1);
      expect(editor.canUndo()).toBe(false);
    }
  );

  test.each(['taskList', 'details'].flatMap((container) => ['', 'Caption'].map((caption) => ({container, caption}))))(
    'Backspace after nested media removes its empty paragraph in $container with caption=$caption',
    ({container, caption}) => {
      const {editor} = mountEditor(undefined, {enableBlockSelection: false});
      const media: JSONContent = {
        type: 'richMedia',
        attrs: {block: {_: 'pageBlockPhoto', pFlags: {}, photo_id: '298', caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}}},
        content: caption ? [{type: 'text', text: caption}] : undefined
      };
      const content = [{type: 'paragraph', content: [{type: 'text', text: 'Before'}]}, media, {type: 'paragraph'}];
      expect(editor.setDocument({type: 'doc', content: [container === 'taskList' ? {
        type: 'taskList', content: [{type: 'taskItem', content}]
      } : {
        type: 'details', attrs: {open: true}, content: [
          {type: 'detailsSummary', content: [{type: 'text', text: 'Summary'}]},
          {type: 'detailsBody', content}
        ]
      }]})).toBe(true);
      const tiptap = (editor as TiptapEditorInternals).editor;
      let mediaPosition: number;
      tiptap.state.doc.descendants((node, position) => {if(node.type.name === 'richMedia') mediaPosition = position;});
      const mediaBefore = tiptap.state.doc.nodeAt(mediaPosition)!;
      const paragraphPosition = mediaPosition + mediaBefore.nodeSize;
      editor.restoreSelection({from: paragraphPosition + 1, to: paragraphPosition + 1}, false);
      const before = editor.getDocument();
      const sizeBefore = tiptap.state.doc.content.size;
      expect(tiptap.view.someProp('handleKeyDown', (handler) => handler(tiptap.view, new KeyboardEvent('keydown', {key: 'Backspace'})))).toBe(true);
      expect(tiptap.state.doc.content.size).toBe(sizeBefore - 2);
      expect(tiptap.state.doc.nodeAt(mediaPosition)?.toJSON()).toEqual(mediaBefore.toJSON());
      expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
      expect(tiptap.state.selection.from).toBe(mediaPosition + 1 + caption.length);
      const after = editor.getDocument();
      expect(editor.undo()).toBe(true);
      expect(editor.getDocument()).toEqual(before);
      expect(tiptap.state.selection.from).toBe(paragraphPosition + 1);
      expect(editor.redo()).toBe(true);
      expect(editor.getDocument()).toEqual(after);
      expect(tiptap.state.selection.from).toBe(mediaPosition + 1 + caption.length);
    }
  );
});
