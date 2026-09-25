import {render} from 'solid-js/web';
import createEditor from '@components/chat/inputEditor';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles as styles} from '@components/instantViewFormatting';
import {richMessageToPage} from '@lib/richMessage';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import type {JSONContent} from '@tiptap/core';
import type {PageBlock} from '@layer';

const text = (text: string) => ({type: 'text', text});
const paragraph = (value: string) => ({type: 'paragraph', content: [text(value)]});
const article: JSONContent = {type: 'doc', content: [
  {type: 'paragraph', content: [text('Paragraph '), {type: 'text', text: 'link', marks: [{type: 'link', attrs: {href: 'https://example.com'}}]}]},
  ...[1, 2, 3, 4, 5, 6].map(level => ({type: 'heading', attrs: {level}, content: [text(`Heading ${level}`)]})),
  {type: 'blockquote', content: [paragraph('Quote body'), {type: 'blockquoteCaption', content: [text('Quote author')]}]},
  {type: 'pullquote', content: [{type: 'pullquoteText', content: [text('Pull quote')]}, {type: 'pullquoteCaption', content: [text('Pull author')]}]},
  {type: 'orderedList', attrs: {start: 4414, startExplicit: true}, content: [
    {type: 'listItem', content: [paragraph('Ordered first')]},
    {type: 'listItem', content: [paragraph('Ordered second')]}
  ]},
  {type: 'orderedList', attrs: {start: 99999, startExplicit: true, reversed: true, type: 'upper-roman'}, content: [
    {type: 'listItem', content: [paragraph('Reversed item')]},
    {type: 'listItem', attrs: {value: 9999, type: 'upper-alpha'}, content: [paragraph('Changed value'), {
      type: 'orderedList', attrs: {start: 26, startExplicit: true, type: 'lower-alpha'}, content: [
        {type: 'listItem', content: [paragraph('Nested first')]},
        {type: 'listItem', content: [paragraph('Nested second')]}
      ]
    }]}
  ]},
  {type: 'bulletList', content: [
    {type: 'listItem', content: [paragraph('Bullet item')]},
    {type: 'listItem', attrs: {checkbox: true, checked: true}, content: [paragraph('Checked item')]}
  ]},
  {type: 'details', attrs: {open: true}, content: [
    {type: 'detailsSummary', content: [text('Details heading')]},
    {type: 'detailsBody', content: [paragraph('Details body')]}
  ]},
  {type: 'chatTableWrapper', content: [
    {type: 'chatTableTitle', content: [text('Table title')]},
    {type: 'table', attrs: {bordered: true, striped: true}, content: [
      {type: 'tableRow', content: ['H1', 'H2'].map(value => ({type: 'tableHeader', content: [paragraph(value)]}))},
      {type: 'tableRow', content: ['A1', 'A2'].map(value => ({type: 'tableCell', content: [paragraph(value)]}))}
    ]}
  ]},
  {type: 'codeBlock', attrs: {language: 'javascript'}, content: [text('const value = 1;')]},
  {type: 'richFooter', content: [text('Footer text')]},
  {type: 'richDivider'},
  {type: 'paragraph', content: [text('Formula '), {type: 'inlineMath', attrs: {source: 'x^2'}}]},
  {type: 'blockMath', attrs: {source: 'x^2+y^2'}}
]};

export function mountRichTextStyles(options: {fontSize: number, width: number, rtl: boolean, legacyHeadings: boolean}) {
  const grid = window.document.createElement('div');
  grid.style.cssText = 'position:absolute;inset:0;z-index:2;display:flex;align-items:flex-start;gap:20px;padding:20px;background:white;';
  window.document.body.append(grid);
  const host = (name: string) => {
    const element = window.document.createElement('section');
    element.dataset.richTextSurface = name;
    element.style.cssText = `width:${options.width}px;flex:0 0 ${options.width}px;font-size:${options.fontSize}px;--messages-text-size:${options.fontSize}px;--font-size-16:${options.fontSize}px;`;
    element.dir = options.rtl ? 'rtl' : 'ltr';
    grid.append(element);
    return element;
  };
  const input = window.document.createElement('div');
  input.className = 'input-message-input';
  input.style.cssText = 'width:100%;max-height:none;overflow:visible;';
  host('editor').append(input);
  const editor = createEditor(input);
  editor.setDocument(article);
  editor.setExpanded(true);
  const page = richMessageToPage(editor.getRichMessage().output);
  if(options.legacyHeadings) {
    const legacyHeadings: Partial<Record<PageBlock['_'], PageBlock['_']>> = {
      pageBlockHeading1: 'pageBlockTitle',
      pageBlockHeading2: 'pageBlockSubtitle',
      pageBlockHeading3: 'pageBlockHeader',
      pageBlockHeading4: 'pageBlockSubheader'
    };
    for(const block of page.blocks) {
      const legacy = legacyHeadings[block._];
      if(legacy) block._ = legacy;
    }
  }
  for(const surface of ['instant-view', 'message']) {
    render(() => HotReloadGuard({
      get children() {
        return InstantViewBlocks({
          webPageId: '0',
          page,
          class: surface === 'message' ? styles.RichMessage : undefined,
          openNewPage: () => {},
          collapse: () => {}
        });
      }
    }), host(surface));
  }
  return {
    selectors: {
      paragraph: `.${styles.Paragraph}`,
      link: 'a',
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(level => [`heading${level}`, `h${level}`])),
      quote: `.${styles.Blockquote}`,
      quoteAuthor: `.${styles.BlockquoteCaption}`,
      pullquote: `.${styles.Pullquote}`,
      pullquoteText: `.${styles.PullquoteText}`,
      pullquoteAuthor: `.${styles.PullquoteAuthor}`,
      orderedList: 'ol',
      orderedItem: 'ol > li',
      nestedList: 'ol ol',
      nestedItem: 'ol ol > li',
      bulletList: 'ul',
      bulletItem: 'ul > li',
      checkbox: `[data-checkbox="true"] > .${styles.TaskCheckboxButton}`,
      detailsTitle: `.${styles.DetailsTitle}`,
      detailsBody: `.${styles.DetailsContentInner}`,
      tableTitle: `.${styles.TableName}`,
      table: 'table',
      tableHeader: 'th',
      tableCell: 'td',
      code: '.code',
      codeText: '.chat-input-code-highlight, .code-code',
      footer: `.${styles.Footer}`,
      divider: `.${styles.Divider}`,
      inlineMath: `.${styles.LatexInline}`,
      blockMath: `.${styles.LatexBlock}`
    }
  };
}
