import '@/tests/mocks/chatInputEditorEngineUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {richMessageToTiptap, richTextPlainText, tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';
import {formatOrderedListMarker} from '@lib/richTextProcessor/orderedList';
import type {JSONContent} from '@tiptap/core';
import type {PageBlock, PageCaption, RichMessage} from '@layer';

const caption: PageCaption = {_: 'pageCaption',
  text: {_: 'textConcat', texts: [{_: 'textBold', text: {_: 'textPlain', text: 'Caption'}}, {_: 'textPlain', text: '\nTail'}]},
  credit: {_: 'textConcat', texts: [{_: 'textPlain', text: 'A'}, {_: 'textPlain', text: 'B'}]}
};
const photo = (): PageBlock.pageBlockPhoto => ({_: 'pageBlockPhoto', pFlags: {}, photo_id: '123', caption: structuredClone(caption)});
const media = (kind: string): PageBlock => {
  if(kind === 'map') return {_: 'pageBlockMap', geo: {_: 'geoPoint', access_hash: '0', lat: 20, long: 0}, w: 400, h: 200, zoom: 2, caption: structuredClone(caption)};
  if(kind === 'photo') return photo();
  if(kind === 'video') return {_: 'pageBlockVideo', pFlags: {}, video_id: '124', caption: structuredClone(caption)};
  if(kind === 'audio') return {_: 'pageBlockAudio', audio_id: '125', caption: structuredClone(caption)};
  return {_: kind === 'collage' ? 'pageBlockCollage' : 'pageBlockSlideshow', items: [photo(), photo()], caption: structuredClone(caption)};
};
const message = (block: PageBlock): RichMessage.richMessage => ({_: 'richMessage', pFlags: {}, blocks: [block], photos: [], documents: []});

function deepFreeze<T>(value: T): T {
  if(value && typeof(value) === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test.each(['photo', 'video', 'audio', 'collage', 'slideshow', 'map'])(
  'serializes %s repeatedly without changing source objects or credit text', kind => {
    const source = deepFreeze(message(media(kind)));
    const doc = deepFreeze(richMessageToTiptap(source));
    const before = JSON.stringify({source, doc});
    const first = tiptapToRichMessage(doc);
    expect(tiptapToRichMessage(doc)).toEqual(first);
    expect(JSON.stringify({source, doc})).toBe(before);
    const block = first.input.blocks[0] as PageBlock.pageBlockPhoto;
    expect(richTextPlainText(block.caption.credit)).toBe('AB');
  }
);

let mounted: ReturnType<typeof mountChatInputEditor>;
afterEach(() => {mounted?.editor.destroy(); mounted?.input.remove();});

test.each(['photo', 'video', 'audio', 'collage', 'slideshow', 'map'])(
  'HTML copy/paste preserves %s caption, marks, breaks and credit', kind => {
    mounted = mountChatInputEditor();
    const {editor, tiptap} = mounted;
    editor.setExpanded(true);
    editor.setRichMessage(message(media(kind)));
    const before = editor.getRichMessage().input;
    tiptap.commands.setNodeSelection(0);
    const {dom} = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
    expect(tiptap.view.pasteHTML(dom.innerHTML, new Event('paste') as ClipboardEvent)).toBe(true);
    expect(editor.getRichMessage().input).toEqual(before);
    expect(editor.undo()).toBe(true);
    expect(editor.redo()).toBe(true);
    expect(editor.getRichMessage().input).toEqual(before);
  }
);

test.each(['1. Paris\nFrance', '- Paris\nFrance', '- [x] Paris\nFrance', '4414. Paris\n\nFrance\n'])(
  'keeps a list-looking caption literal with formatting: %s', text => {
    mounted = mountChatInputEditor();
    const {editor} = mounted;
    editor.setExpanded(true);
    const offset = text.indexOf('Paris');
    expect(editor.insertMap({latitude: 20, longitude: 0, zoom: 2, caption: text,
      captionEntities: [{_: 'messageEntityBold', offset, length: 5}]})).toBe(true);
    const block = editor.getRichMessage({draft: true}).input.blocks[0];
    if(block._ !== 'inputPageBlockMap') throw new Error('Expected a map');
    expect(richTextPlainText(block.caption.text)).toBe(text);
    expect(JSON.stringify(block.caption.text)).toContain('"_":"textBold","text":{"_":"textPlain","text":"Paris"}');
    expect(editor.undo()).toBe(true);
    expect(editor.redo()).toBe(true);
    expect(editor.getRichMessage({draft: true}).input.blocks[0]).toEqual(block);
  }
);

const paragraph = (text: string): JSONContent => ({type: 'paragraph', content: [{type: 'text', text}]});
const item = (text: string, attrs?: JSONContent['attrs']): JSONContent => ({type: 'listItem', attrs, content: [paragraph(text)]});

test.each([
  {attrs: {start: 5, startExplicit: true, reversed: true}, itemAttrs: {value: 20}, expected: '5. First\n20. Second'},
  {attrs: {reversed: true, startExplicit: false}, itemAttrs: {}, expected: '2. First\n1. Second'},
  {attrs: {start: 26, startExplicit: true, type: 'upper-alpha'}, itemAttrs: {}, expected: 'Z. First\nAA. Second'},
  {attrs: {start: 4, startExplicit: true, type: 'lower-roman'}, itemAttrs: {value: 9, type: 'upper-roman'}, expected: 'iv. First\nIX. Second'}
])('copies the visible numbering: $expected', ({attrs, itemAttrs, expected}) => {
  mounted = mountChatInputEditor();
  const {editor, tiptap} = mounted;
  editor.setExpanded(true);
  editor.setDocument({type: 'doc', content: [{type: 'orderedList', attrs, content: [item('First'), item('Second', itemAttrs)]}]});
  tiptap.commands.selectAll();
  const copied = tiptap.view.someProp('clipboardTextSerializer', serialize => serialize(tiptap.state.selection.content(), tiptap.view));
  expect(copied).toBe(expected);
});

test.each([
  [0, 'upper-alpha', '0'], [-1, 'lower-roman', '-1'], [4000, 'I', '4000'],
  [3999, 'I', 'MMMCMXCIX'], [27, 'a', 'aa'], [52, 'A', 'AZ'], [1, 'unknown', '1']
] as const)('formats counter %s with type %s as %s', (value, type, expected) => {
  expect(formatOrderedListMarker(value, type)).toBe(expected);
});
