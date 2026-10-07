import type {JSONContent} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {TextSelection} from '@tiptap/pm/state';
import type {MarkdownType} from '@helpers/dom/getRichElementValue';
import type {ChatInputEditor, ChatInputFormatting} from '@components/chat/inputEditor/types';
import {useChatInputEditorHarness, type TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';

const SELECTED = 'selected';
const paragraph = (text: string): JSONContent => ({type: 'paragraph', content: [{type: 'text', text}]});
const text = (value: string): JSONContent[] => [{type: 'text', text: value}];

// Each context holds the word the selection covers.
const CONTEXTS: Record<string, JSONContent> = {
  paragraph: paragraph(SELECTED),
  tableCell: {type: 'chatTableWrapper', content: [
    {type: 'chatTableTitle'},
    {type: 'table', content: [{type: 'tableRow', content: [
      {type: 'tableCell', content: [paragraph(SELECTED)]},
      {type: 'tableCell', content: [paragraph('next')]}
    ]}]}
  ]},
  tableHeader: {type: 'chatTableWrapper', content: [
    {type: 'chatTableTitle'},
    {type: 'table', content: [{type: 'tableRow', content: [
      {type: 'tableHeader', content: [paragraph(SELECTED)]},
      {type: 'tableHeader', content: [paragraph('next')]}
    ]}]}
  ]},
  tableTitle: {type: 'chatTableWrapper', content: [
    {type: 'chatTableTitle', content: text(SELECTED)},
    {type: 'table', content: [{type: 'tableRow', content: [{type: 'tableCell', content: [paragraph('cell')]}]}]}
  ]},
  detailsSummary: {type: 'details', attrs: {open: true}, content: [
    {type: 'detailsSummary', content: text(SELECTED)},
    {type: 'detailsBody', content: [paragraph('body')]}
  ]},
  pullquote: {type: 'pullquote', content: [{type: 'pullquoteText', content: text(SELECTED)}]},
  codeBlock: {type: 'codeBlock', content: text(SELECTED)},
  listItem: {type: 'orderedList', content: [{type: 'listItem', content: [paragraph(SELECTED)]}]},
  blockquote: {type: 'blockquote', content: [paragraph(SELECTED)]}
};
type Context = keyof typeof CONTEXTS;

const ALL: ChatInputFormatting[] = [
  'bulletList', 'buttonRow', 'codeBlock', 'details', 'divider', 'footer',
  'heading', 'inlineButton', 'math', 'orderedList', 'pullquote', 'taskList'
];
const TEXT_ONLY: ChatInputFormatting[] = ['inlineButton', 'math'];
const AVAILABLE: Record<Context, ChatInputFormatting[]> = {
  paragraph: ALL,
  tableCell: TEXT_ONLY,
  tableHeader: TEXT_ONLY,
  tableTitle: TEXT_ONLY,
  detailsSummary: TEXT_ONLY,
  pullquote: TEXT_ONLY,
  // A code block holds plain text: no inline nodes, and a math dialog would
  // put the formula on a line of its own outside it. It is a code block already.
  codeBlock: ALL.filter((type) => !TEXT_ONLY.includes(type) && type !== 'codeBlock'),
  // Details, footer and pullquote convert top-level lines only.
  listItem: ALL.filter((type) => !['details', 'footer', 'pullquote'].includes(type)),
  blockquote: ALL.filter((type) => !['details', 'footer', 'pullquote'].includes(type))
};

const CONVERSIONS: [ChatInputFormatting, (editor: ChatInputEditor) => boolean][] = [
  ['bulletList', (editor) => editor.toggleBulletList()],
  ['codeBlock', (editor) => editor.insertCodeBlock()],
  ['details', (editor) => editor.insertDetails()],
  ['footer', (editor) => editor.insertFooter()],
  ['heading', (editor) => editor.toggleHeading(2)],
  ['orderedList', (editor) => editor.toggleOrderedList()],
  ['pullquote', (editor) => editor.insertPullquote()],
  ['taskList', (editor) => editor.toggleTaskList()]
];

describe('Tiptap chat input editor: formatting availability', () => {
  const {mountEditor} = useChatInputEditorHarness();

  function mountContext(context: Context) {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setDocument({type: 'doc', content: [CONTEXTS[context], {type: 'paragraph'}]});
    let from = -1;
    tiptap.state.doc.descendants((node: ProseMirrorNode, position: number) => {
      if(from < 0 && node.isText && node.text === SELECTED) from = position;
    });
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, from, from + SELECTED.length)
    ));
    return {editor, tiptap};
  }

  const topLevel = (tiptap: TiptapEditorInternals['editor']) => Array.from(
    {length: tiptap.state.doc.childCount},
    (_value, index) => tiptap.state.doc.child(index).type.name
  );

  test.each(Object.keys(CONTEXTS) as Context[])('offers only what fits in a %s', (context) => {
    const {editor} = mountContext(context);
    expect(ALL.filter((type) => editor.canApplyFormatting(type))).toEqual(AVAILABLE[context]);
  });

  const parityCases = (Object.keys(CONTEXTS) as Context[]).flatMap((context) => (
    CONVERSIONS.map(([type, run]) => [context, type, run] as const)
  ));
  test.each(parityCases)('in a %s, %s is offered exactly where it changes the document', (context, type, run) => {
    const {editor, tiptap} = mountContext(context);
    const available = editor.canApplyFormatting(type);
    const before = tiptap.state.doc;
    run(editor);
    expect(!tiptap.state.doc.eq(before)).toBe(available);
  });

  test.each([
    ['tableCell', 'chatTableWrapper'],
    ['tableTitle', 'chatTableWrapper'],
    ['detailsSummary', 'details'],
    ['pullquote', 'pullquote']
  ] as const)('a block inserted from a %s goes after its container instead of splitting it', (context, container) => {
    for(const [node, insert] of [
      ['richDivider', (editor: ChatInputEditor) => editor.insertDivider()],
      ['buttonRow', (editor: ChatInputEditor) => editor.insertRichButton({
        action: 'copy',
        copyText: 'value',
        separateLine: true,
        text: 'Copy'
      })]
    ] as const) {
      const {editor, tiptap} = mountContext(context);
      expect(insert(editor)).toBe(true);
      expect(topLevel(tiptap).slice(0, 2)).toEqual([container, node]);
      expect(topLevel(tiptap).filter((name) => name === container)).toHaveLength(1);
    }
  });

  const MARKUP: MarkdownType[] = ['bold', 'italic', 'monospace', 'link', 'spoiler', 'quote'];
  test.each([
    ['paragraph', MARKUP],
    ['tableCell', MARKUP.filter((type) => type !== 'quote')],
    // a header cell draws its text bold already
    ['tableHeader', MARKUP.filter((type) => type !== 'quote' && type !== 'bold')],
    ['detailsSummary', MARKUP.filter((type) => type !== 'quote')],
    ['codeBlock', ['quote']],
    ['listItem', MARKUP]
  ] as const)('the selection tooltip offers in a %s only %j', (context, expected) => {
    const {editor} = mountContext(context);
    expect(MARKUP.filter((type) => editor.canApplyMarkup(type))).toEqual(expected);
  });
});

// The editor with the first text of `block` (the word SELECTED) selected.
function mountSelected(mountEditor: ReturnType<typeof useChatInputEditorHarness>['mountEditor'], block: JSONContent) {
  const {editor} = mountEditor();
  const tiptap = (editor as TiptapEditorInternals).editor;
  editor.setDocument({type: 'doc', content: [block, {type: 'paragraph'}]});
  let from = -1;
  tiptap.state.doc.descendants((node: ProseMirrorNode, position: number) => {
    if(from < 0 && node.isText) from = position;
  });
  tiptap.view.dispatch(tiptap.state.tr.setSelection(
    TextSelection.create(tiptap.state.doc, from, from + SELECTED.length)
  ));
  return {editor, tiptap};
}

describe('Tiptap chat input editor: bold in a header cell', () => {
  const {mountEditor} = useChatInputEditorHarness();
  const header = (marks?: JSONContent['marks']): JSONContent => ({type: 'chatTableWrapper', content: [
    {type: 'chatTableTitle'},
    {type: 'table', content: [{type: 'tableRow', content: [
      {type: 'tableHeader', content: [{type: 'paragraph', content: [{type: 'text', text: SELECTED, marks}]}]}
    ]}]}
  ]});

  test.each([
    ['plain', undefined],
    ['pasted bold', [{type: 'bold'}]]
  ] as const)('offers no Bold over %s header text, from the tooltip or the shortcut', (_name, marks) => {
    const {editor, tiptap} = mountSelected(mountEditor, header(marks ? [...marks] : undefined));
    const before = tiptap.state.doc;
    expect(editor.canApplyMarkup('bold')).toBe(false);
    expect(editor.applyMarkup({type: 'bold'})).toBe(false);
    expect(tiptap.state.doc.eq(before)).toBe(true);
    expect(editor.applyMarkup({type: 'italic'})).toBe(true);
  });
});

describe('Tiptap chat input editor: markup over marked text', () => {
  const {mountEditor} = useChatInputEditorHarness();
  const marked = (mark: {type: string, attrs?: Record<string, unknown>}): JSONContent => ({type: 'paragraph', content: [{type: 'text', text: SELECTED, marks: [mark]}]});

  // applyMarkup takes off what would exclude the new mark, so the tooltip offers it
  test.each([
    ['inline code', {type: 'code'}, ['bold', 'italic', 'link']],
    ['a date', {type: 'formattedDate', attrs: {date: 1700000000, pFlags: {}}}, ['bold', 'italic', 'link']],
    ['superscript', {type: 'superscript'}, ['subscript']]
  ] as const)('offers what applies over %s, and applies it', (_name, mark, types) => {
    for(const type of types) {
      const {editor, tiptap} = mountSelected(mountEditor, marked({...mark}));
      expect(editor.canApplyMarkup(type), type).toBe(true);
      expect(editor.applyMarkup({type, href: type === 'link' ? 'https://example.com' : undefined}), type).toBe(true);
      expect(tiptap.isActive(type), type).toBe(true);
    }
  });
});
