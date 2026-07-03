import {readFileSync} from 'fs';
import {resolve} from 'path';
import {PageBlock, PageListItem, PageTableCell, RichText} from '@layer';
import inlineMarkdownToRichText from '@lib/richTextProcessor/inlineMarkdownToRichText';
import parseMarkdownToPage from '@lib/richTextProcessor/parseMarkdownToPage';
import {MATH_MARKER_RE, decodeInlineMath} from '@helpers/math/mathMarker';

describe('inlineMarkdownToRichText: emphasis', () => {
  test('**bold**', () => {
    expect(inlineMarkdownToRichText('**bold**')).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'bold'}
    });
  });

  test('__bold with underscores__ (CommonMark bold)', () => {
    expect(inlineMarkdownToRichText('__bold__')).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'bold'}
    });
  });

  test('*italic*', () => {
    expect(inlineMarkdownToRichText('*italic*')).toEqual({
      _: 'textItalic',
      text: {_: 'textPlain', text: 'italic'}
    });
  });

  test('_italic with underscores_', () => {
    expect(inlineMarkdownToRichText('_italic_')).toEqual({
      _: 'textItalic',
      text: {_: 'textPlain', text: 'italic'}
    });
  });

  test('***bold + italic*** → bold containing italic', () => {
    expect(inlineMarkdownToRichText('***bi***')).toEqual({
      _: 'textBold',
      text: {_: 'textItalic', text: {_: 'textPlain', text: 'bi'}}
    });
  });

  test('___bold + italic___ → bold containing italic', () => {
    expect(inlineMarkdownToRichText('___bi___')).toEqual({
      _: 'textBold',
      text: {_: 'textItalic', text: {_: 'textPlain', text: 'bi'}}
    });
  });

  test('~~strike~~', () => {
    expect(inlineMarkdownToRichText('~~strike~~')).toEqual({
      _: 'textStrike',
      text: {_: 'textPlain', text: 'strike'}
    });
  });

  test('`code`', () => {
    expect(inlineMarkdownToRichText('`code`')).toEqual({
      _: 'textFixed',
      text: {_: 'textPlain', text: 'code'}
    });
  });

  test('combination paragraph: bold/italic/strike/code', () => {
    const result = inlineMarkdownToRichText('**a**, *b*, ~~c~~, and `d`');
    expect(result._).toEqual('textConcat');
    const texts = (result as any).texts as RichText[];
    expect(texts.find((t) => t._ === 'textBold')).toBeTruthy();
    expect(texts.find((t) => t._ === 'textItalic')).toBeTruthy();
    expect(texts.find((t) => t._ === 'textStrike')).toBeTruthy();
    expect(texts.find((t) => t._ === 'textFixed')).toBeTruthy();
  });

  test('snake_case is not italic', () => {
    expect(inlineMarkdownToRichText('a_b_c')).toEqual({_: 'textPlain', text: 'a_b_c'});
  });

  test('multiplication "2 * 3 * 4" is not italic', () => {
    expect(inlineMarkdownToRichText('2 * 3 * 4')).toEqual({_: 'textPlain', text: '2 * 3 * 4'});
  });
});

describe('inlineMarkdownToRichText: escapes', () => {
  test('backslash escape \\* keeps literal asterisk', () => {
    expect(inlineMarkdownToRichText('\\*not italic\\*')).toEqual({_: 'textPlain', text: '*not italic*'});
  });

  test('backslash escape \\_ keeps literal underscore', () => {
    expect(inlineMarkdownToRichText('\\_not italic\\_')).toEqual({_: 'textPlain', text: '_not italic_'});
  });

  test('backslash escape \\` keeps literal backtick', () => {
    expect(inlineMarkdownToRichText('\\`not code\\`')).toEqual({_: 'textPlain', text: '`not code`'});
  });

  test('backslash escape \\[ keeps literal bracket', () => {
    expect(inlineMarkdownToRichText('\\[not a link\\]')).toEqual({_: 'textPlain', text: '[not a link]'});
  });

  test('backslash escape \\# keeps literal hash', () => {
    expect(inlineMarkdownToRichText('\\# not a heading')).toEqual({_: 'textPlain', text: '# not a heading'});
  });
});

describe('inlineMarkdownToRichText: links and autolinks', () => {
  test('inline link [text](url)', () => {
    expect(inlineMarkdownToRichText('[Google](https://google.com)')).toEqual({
      _: 'textUrl',
      text: {_: 'textPlain', text: 'Google'},
      url: 'https://google.com',
      webpage_id: 0
    });
  });

  test('angle-bracket URL autolink', () => {
    const r = inlineMarkdownToRichText('<https://example.com/p?q=1>');
    expect(r._).toEqual('textUrl');
    expect((r as RichText.textUrl).url).toEqual('https://example.com/p?q=1');
  });

  test('angle-bracket email autolink', () => {
    const r = inlineMarkdownToRichText('<test@example.com>');
    expect(r._).toEqual('textUrl');
    expect((r as RichText.textUrl).url).toEqual('mailto:test@example.com');
  });
});

describe('inlineMarkdownToRichText: HTML', () => {
  test('HTML comment is removed', () => {
    expect(inlineMarkdownToRichText('a <!-- hidden --> b')).toEqual({_: 'textPlain', text: 'a  b'});
  });

  test('<br> becomes newline', () => {
    const r = inlineMarkdownToRichText('line1<br>line2');
    expect(r).toEqual({_: 'textPlain', text: 'line1\nline2'});
  });

  test('<sub>, <sup>, <mark> become textSubscript / textSuperscript / textMarked', () => {
    expect(inlineMarkdownToRichText('H<sub>2</sub>O')).toEqual({
      _: 'textConcat',
      texts: [
        {_: 'textPlain', text: 'H'},
        {_: 'textSubscript', text: {_: 'textPlain', text: '2'}},
        {_: 'textPlain', text: 'O'}
      ]
    });
    expect(inlineMarkdownToRichText('mc<sup>2</sup>')).toEqual({
      _: 'textConcat',
      texts: [
        {_: 'textPlain', text: 'mc'},
        {_: 'textSuperscript', text: {_: 'textPlain', text: '2'}}
      ]
    });
    expect(inlineMarkdownToRichText('<mark>hi</mark>')).toEqual({
      _: 'textMarked',
      text: {_: 'textPlain', text: 'hi'}
    });
  });

  test('other inline HTML tags are stripped', () => {
    expect(inlineMarkdownToRichText('a<span>b</span>c')).toEqual({_: 'textPlain', text: 'abc'});
  });

  test('<b>/<strong> → bold', () => {
    expect(inlineMarkdownToRichText('<strong>hi</strong>')).toEqual({_: 'textBold', text: {_: 'textPlain', text: 'hi'}});
    expect(inlineMarkdownToRichText('<b>hi</b>')).toEqual({_: 'textBold', text: {_: 'textPlain', text: 'hi'}});
  });

  test('<i>/<em> → italic', () => {
    expect(inlineMarkdownToRichText('<em>hi</em>')).toEqual({_: 'textItalic', text: {_: 'textPlain', text: 'hi'}});
    expect(inlineMarkdownToRichText('<i>hi</i>')).toEqual({_: 'textItalic', text: {_: 'textPlain', text: 'hi'}});
  });

  test('<u> → underline', () => {
    expect(inlineMarkdownToRichText('<u>hi</u>')).toEqual({_: 'textUnderline', text: {_: 'textPlain', text: 'hi'}});
  });

  test('<s>/<del>/<strike> → strike', () => {
    expect(inlineMarkdownToRichText('<s>hi</s>')).toEqual({_: 'textStrike', text: {_: 'textPlain', text: 'hi'}});
    expect(inlineMarkdownToRichText('<del>hi</del>')).toEqual({_: 'textStrike', text: {_: 'textPlain', text: 'hi'}});
  });

  test('formatting tag with inner content around plain text', () => {
    const r = inlineMarkdownToRichText('a <strong>bold</strong> b');
    expect(r._).toEqual('textConcat');
    const texts = (r as RichText.textConcat).texts;
    expect(texts.some((t) => t._ === 'textBold')).toBe(true);
  });

  test('container tags <div>/<p> are still stripped to their text', () => {
    expect(inlineMarkdownToRichText('<div><p>x</p></div>')).toEqual({_: 'textPlain', text: 'x'});
  });
});

describe('parseMarkdownToPage: <details> blocks', () => {
  test('<details><summary> → pageBlockDetails with title and recursively-parsed blocks', () => {
    const page = parseMarkdownToPage('<details>\n  <summary>More info</summary>\n\n  Hidden **content** here.\n</details>');
    const details = page.blocks.find((b): b is PageBlock.pageBlockDetails => b._ === 'pageBlockDetails');
    expect(details).toBeTruthy();
    expect(details.pFlags.open).toBeFalsy();
    expect(JSON.stringify(details.title)).toContain('More info');
    expect(details.blocks.some((b) => b._ === 'pageBlockParagraph')).toBe(true);
    expect(JSON.stringify(details.blocks)).toContain('textBold'); // inner **content** was parsed
  });

  test('raw <details>/<summary> tags never leak as literal text', () => {
    const page = parseMarkdownToPage('Before.\n\n<details>\n<summary>S</summary>\nBody.\n</details>\n\nAfter.');
    const flat = JSON.stringify(page.blocks);
    expect(flat).not.toContain('<details');
    expect(flat).not.toContain('<summary');
    expect(page.blocks.some((b) => b._ === 'pageBlockDetails')).toBe(true);
  });

  test('single-line <details>…</details> does not swallow following content', () => {
    const page = parseMarkdownToPage('<details><summary>S</summary>Body text</details>\n\nAfter paragraph.');
    expect(page.blocks.some((b) => b._ === 'pageBlockDetails')).toBe(true);
    // the trailing paragraph must survive at top level (not be absorbed into the details body)
    expect(page.blocks.some((b) => b._ === 'pageBlockParagraph' &&
      JSON.stringify((b as PageBlock.pageBlockParagraph).text).includes('After paragraph'))).toBe(true);
    expect(JSON.stringify(page.blocks)).not.toContain('</details');
  });
});

function expectBlockType(block: PageBlock, type: string) {
  expect(block._).toEqual(type);
}

describe('parseMarkdownToPage: blocks', () => {
  test('empty input → page with no blocks', () => {
    const page = parseMarkdownToPage('');
    expect(page._).toEqual('page');
    expect(page.blocks).toEqual([]);
    expect(page.photos).toEqual([]);
    expect(page.documents).toEqual([]);
  });

  test('single paragraph', () => {
    const page = parseMarkdownToPage('hello world');
    expect(page.blocks.length).toEqual(1);
    expectBlockType(page.blocks[0], 'pageBlockParagraph');
  });

  test('ATX h1 → Title (first), h2 → Header, h3+ → Subheader (with anchors before non-title headings)', () => {
    const page = parseMarkdownToPage('# T\n\n## H\n\n### S\n\n#### S2\n\n##### S3\n\n###### S4');
    const types = page.blocks.map((b) => b._);
    expect(types).toEqual([
      'pageBlockTitle',
      'pageBlockAnchor', 'pageBlockHeader',
      'pageBlockAnchor', 'pageBlockSubheader',
      'pageBlockAnchor', 'pageBlockSubheader',
      'pageBlockAnchor', 'pageBlockSubheader',
      'pageBlockAnchor', 'pageBlockSubheader'
    ]);
  });

  test('headings carry headingLevel 2-6 (Title has none)', () => {
    const page = parseMarkdownToPage('# T\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6');
    const headings = page.blocks.filter((b) => b._ !== 'pageBlockAnchor');
    expect((headings[0] as any).headingLevel).toBeUndefined();
    expect((headings[1] as any).headingLevel).toEqual(2);
    expect((headings[2] as any).headingLevel).toEqual(3);
    expect((headings[3] as any).headingLevel).toEqual(4);
    expect((headings[4] as any).headingLevel).toEqual(5);
    expect((headings[5] as any).headingLevel).toEqual(6);
  });

  test('subsequent h1 carries headingLevel 1', () => {
    const page = parseMarkdownToPage('# T1\n\n# T2');
    const headings = page.blocks.filter((b) => b._ !== 'pageBlockAnchor');
    expect((headings[0] as any).headingLevel).toBeUndefined();
    expect((headings[1] as any).headingLevel).toEqual(1);
  });

  test('second h1 becomes Header (with preceding Anchor)', () => {
    const page = parseMarkdownToPage('# T1\n\n# T2');
    expectBlockType(page.blocks[0], 'pageBlockTitle');
    expectBlockType(page.blocks[1], 'pageBlockAnchor');
    expectBlockType(page.blocks[2], 'pageBlockHeader');
    expect((page.blocks[1] as PageBlock.pageBlockAnchor).name).toEqual('t2');
  });

  test('heading anchors use slugified heading text', () => {
    const page = parseMarkdownToPage('## Definition Lists (renderer-dependent)');
    expectBlockType(page.blocks[0], 'pageBlockAnchor');
    expect((page.blocks[0] as PageBlock.pageBlockAnchor).name).toEqual('definition-lists-renderer-dependent');
  });

  test('blockquote across multiple lines', () => {
    const page = parseMarkdownToPage('> a\n> b');
    expect(page.blocks.length).toEqual(1);
    const block = page.blocks[0] as PageBlock.pageBlockBlockquote;
    expect(block._).toEqual('pageBlockBlockquote');
    expect(block.caption).toEqual({_: 'textEmpty'});
    expect(block.text).toEqual({_: 'textPlain', text: 'a\nb'});
  });

  test('blockquote with inline formatting', () => {
    const page = parseMarkdownToPage('> Quote with **bold** and *italic*.');
    const block = page.blocks[0] as PageBlock.pageBlockBlockquote;
    expect(block._).toEqual('pageBlockBlockquote');
    expect(block.text._).toEqual('textConcat');
  });

  test('unordered list with - * + • markers (separated by blank lines)', () => {
    const page = parseMarkdownToPage('- a\n- b\n\n* c\n* d\n\n+ e\n+ f\n\n• g\n• h');
    expect(page.blocks.length).toEqual(4);
    page.blocks.forEach((b) => expectBlockType(b, 'pageBlockList'));
  });

  test('ordered list with literal numbers (no trailing dot — renderer adds it)', () => {
    const page = parseMarkdownToPage('1. a\n2. b\n3. c');
    const block = page.blocks[0] as PageBlock.pageBlockOrderedList;
    expect(block._).toEqual('pageBlockOrderedList');
    expect(block.items.length).toEqual(3);
    expect((block.items[0] as any).num).toEqual('1');
    expect((block.items[2] as any).num).toEqual('3');
  });

  test('nested unordered list under unordered item', () => {
    const page = parseMarkdownToPage('- A\n  - sub a1\n  - sub a2\n- B');
    const block = page.blocks[0] as PageBlock.pageBlockList;
    expect(block._).toEqual('pageBlockList');
    expect(block.items.length).toEqual(2);
    const first = block.items[0];
    expect(first._).toEqual('pageListItemBlocks');
    const blocks = (first as PageListItem.pageListItemBlocks).blocks;
    expect(blocks.length).toEqual(2);
    expectBlockType(blocks[0], 'pageBlockParagraph');
    expectBlockType(blocks[1], 'pageBlockList');
    expect((blocks[1] as PageBlock.pageBlockList).items.length).toEqual(2);
    expect(block.items[1]._).toEqual('pageListItemText');
  });

  test('nested ordered list under unordered item', () => {
    const page = parseMarkdownToPage('- A\n  1. sub1\n  2. sub2\n- B');
    const block = page.blocks[0] as PageBlock.pageBlockList;
    const first = block.items[0] as PageListItem.pageListItemBlocks;
    expect(first._).toEqual('pageListItemBlocks');
    expectBlockType(first.blocks[1], 'pageBlockOrderedList');
  });

  test('fenced code block with language', () => {
    const page = parseMarkdownToPage('```js\nlet a = 1;\nlet b = 2;\n```');
    const block = page.blocks[0] as PageBlock.pageBlockPreformatted;
    expect(block._).toEqual('pageBlockPreformatted');
    expect(block.language).toEqual('js');
    expect(block.text).toEqual({_: 'textPlain', text: 'let a = 1;\nlet b = 2;'});
  });

  test('fenced code block without language', () => {
    const page = parseMarkdownToPage('```\nplain code\n```');
    const block = page.blocks[0] as PageBlock.pageBlockPreformatted;
    expect(block._).toEqual('pageBlockPreformatted');
    expect(block.language).toEqual('');
    expect(block.text).toEqual({_: 'textPlain', text: 'plain code'});
  });

  test('indented code block (4-space prefix)', () => {
    const page = parseMarkdownToPage('para\n\n    indented line 1\n    indented line 2\n\nafter');
    expect(page.blocks.length).toEqual(3);
    expectBlockType(page.blocks[0], 'pageBlockParagraph');
    const code = page.blocks[1] as PageBlock.pageBlockPreformatted;
    expect(code._).toEqual('pageBlockPreformatted');
    expect(code.text).toEqual({_: 'textPlain', text: 'indented line 1\nindented line 2'});
    expectBlockType(page.blocks[2], 'pageBlockParagraph');
  });

  test('dividers --- *** ___', () => {
    const page = parseMarkdownToPage('a\n\n---\n\nb\n\n***\n\nc\n\n___\n\nd');
    const types = page.blocks.map((b) => b._);
    expect(types).toEqual([
      'pageBlockParagraph',
      'pageBlockDivider',
      'pageBlockParagraph',
      'pageBlockDivider',
      'pageBlockParagraph',
      'pageBlockDivider',
      'pageBlockParagraph'
    ]);
  });

  test('reference-style link definition is skipped (not rendered)', () => {
    const page = parseMarkdownToPage('Para.\n\n[search]: https://duckduckgo.com "DuckDuckGo"\n\nMore.');
    const types = page.blocks.map((b) => b._);
    expect(types).toEqual(['pageBlockParagraph', 'pageBlockParagraph']);
  });

  test('reference-style link [text][id] resolves to URL', () => {
    const page = parseMarkdownToPage('Click [here][s].\n\n[s]: https://example.com');
    const block = page.blocks[0] as PageBlock.pageBlockParagraph;
    const stringified = JSON.stringify(block.text);
    expect(stringified).toMatch(/textUrl/);
    expect(stringified).toMatch(/example\.com/);
  });

  test('GFM table → pageBlockTable with header cells', () => {
    const md = '| A | B | C |\n| --- | :---: | ---: |\n| 1 | 2 | 3 |\n| **a** | b | c |';
    const page = parseMarkdownToPage(md);
    expect(page.blocks.length).toEqual(1);
    const t = page.blocks[0] as PageBlock.pageBlockTable;
    expect(t._).toEqual('pageBlockTable');
    expect(t.rows.length).toEqual(3);
    expect(t.rows[0].cells.length).toEqual(3);
    expect((t.rows[0].cells[0] as PageTableCell.pageTableCell).pFlags.header).toBe(true);
    expect((t.rows[0].cells[1] as PageTableCell.pageTableCell).pFlags.align_center).toBe(true);
    expect((t.rows[0].cells[2] as PageTableCell.pageTableCell).pFlags.align_right).toBe(true);
    expect((t.rows[2].cells[0] as PageTableCell.pageTableCell).pFlags.header).toBeUndefined();
  });

  test('table cells parse inline markdown (bold, code, link)', () => {
    const md = '| A | B |\n| --- | --- |\n| **bold** | `code` |\n| [link](https://x) | ~~s~~ |';
    const page = parseMarkdownToPage(md);
    const t = page.blocks[0] as PageBlock.pageBlockTable;
    const flat = JSON.stringify(t);
    expect(flat).toMatch(/textBold/);
    expect(flat).toMatch(/textFixed/);
    expect(flat).toMatch(/textUrl/);
    expect(flat).toMatch(/textStrike/);
  });

  test('task list items stash taskChecked and keep clean text (no ☑/☐ glyph)', () => {
    const page = parseMarkdownToPage('- [x] done\n- [ ] todo');
    const list = page.blocks[0] as PageBlock.pageBlockList;
    const [done, todo] = list.items as Array<PageListItem.pageListItemText & {taskChecked?: boolean}>;
    expect(done.taskChecked).toBe(true);
    expect(todo.taskChecked).toBe(false);
    expect(done.text).toEqual({_: 'textPlain', text: 'done'});
    expect(todo.text).toEqual({_: 'textPlain', text: 'todo'});
    expect(JSON.stringify(list)).not.toMatch(/☑|☐/);
  });

  test('footnote reference [^id] becomes textSuperscript and definitions render at end', () => {
    const md = 'See note.[^a]\n\nMore text.[^b]\n\n[^a]: First note.\n[^b]: Second note with **bold**.';
    const page = parseMarkdownToPage(md);
    const flat = JSON.stringify(page.blocks);
    // Named footnotes are rendered as sequential numbers (definition order), not their raw ids.
    const p0 = JSON.stringify((page.blocks[0] as PageBlock.pageBlockParagraph).text);
    const p1 = JSON.stringify((page.blocks[1] as PageBlock.pageBlockParagraph).text);
    expect(p0).toMatch(/textSuperscript[^}]*"text":"1"/);
    expect(p1).toMatch(/textSuperscript[^}]*"text":"2"/);
    expect(flat).not.toContain('"text":"a"'); // the raw ids must not leak
    // Footer header
    const headers = page.blocks.filter((b) => b._ === 'pageBlockHeader' &&
      JSON.stringify((b as PageBlock.pageBlockHeader).text).includes('Footnotes'));
    expect(headers.length).toEqual(1);
    // Footnote bodies preserve formatting
    expect(flat).toMatch(/First note/);
    expect(flat).toMatch(/Second note/);
    expect(flat).toMatch(/textBold.*"text":"bold"/);
  });

  test('block math $$...$$ → pageBlockPreformatted with language "math"', () => {
    const page = parseMarkdownToPage('$$\nx^2 + y^2 = z^2\n$$');
    const block = page.blocks[0] as PageBlock.pageBlockPreformatted;
    expect(block._).toEqual('pageBlockPreformatted');
    expect(block.language).toEqual('math');
    expect(block.text).toEqual({_: 'textPlain', text: 'x^2 + y^2 = z^2'});
  });

  test('inline math $X$ → base64 math marker carrying the raw LaTeX source', () => {
    const page = parseMarkdownToPage('Pythagoras: $a^2 + b^2 = c^2$.');
    const text = (page.blocks[0] as PageBlock.pageBlockParagraph).text;
    // source must NOT leak as plain/monospace text — it is base64-encoded inside the marker
    expect(richTextToPlain(text)).not.toMatch(/a\^2/);
    expect(decodeFirstInlineMath(text)).toEqual('a^2 + b^2 = c^2');
  });

  test('inline math source survives markdown special chars (underscores, backslashes)', () => {
    const page = parseMarkdownToPage('Sum: $\\sum_{i=1}^{n} a_i$ end.');
    const text = (page.blocks[0] as PageBlock.pageBlockParagraph).text;
    expect(decodeFirstInlineMath(text)).toEqual('\\sum_{i=1}^{n} a_i');
  });

  test('definition list: term + : definition lines', () => {
    const page = parseMarkdownToPage('Term\n: First definition\n: Second definition');
    expect(page.blocks.length).toEqual(3);
    expect(page.blocks[0]._).toEqual('pageBlockParagraph');
    const para = page.blocks[0] as PageBlock.pageBlockParagraph;
    expect(para.text._).toEqual('textBold');
    expect(page.blocks[1]._).toEqual('pageBlockBlockquote');
    expect(page.blocks[2]._).toEqual('pageBlockBlockquote');
  });

  test('multi-line HTML comment is stripped before parsing', () => {
    const page = parseMarkdownToPage('Before.\n\n<!--\nthis is\nhidden\n-->\n\nAfter.');
    const types = page.blocks.map((b) => b._);
    expect(types).toEqual(['pageBlockParagraph', 'pageBlockParagraph']);
  });

  test('standalone bold line is a paragraph (not a header)', () => {
    const page = parseMarkdownToPage('intro\n\n**Section**\n\ncontent');
    expect(page.blocks.length).toEqual(3);
    page.blocks.forEach((b) => expectBlockType(b, 'pageBlockParagraph'));
  });

  test('page meta: pFlags empty, photos/documents empty, url passed', () => {
    const page = parseMarkdownToPage('text', 'https://example.com/x');
    expect(page.url).toEqual('https://example.com/x');
    expect(page.pFlags).toEqual({});
    expect(page.photos).toEqual([]);
    expect(page.documents).toEqual([]);
    expect(page.views).toBeUndefined();
  });
});

describe('parseMarkdownToPage: markdown-example.md fixture', () => {
  const raw = readFileSync(resolve(__dirname, 'markdown-example.md'), 'utf-8');
  const page = parseMarkdownToPage(raw, 'https://example.com/markdown-example');

  test('first block is Title with the document heading', () => {
    expectBlockType(page.blocks[0], 'pageBlockTitle');
    const title = page.blocks[0] as PageBlock.pageBlockTitle;
    expect(title.text).toEqual({_: 'textPlain', text: 'Markdown Display Test File'});
  });

  test('contains expected block types', () => {
    const types = new Set(page.blocks.map((b) => b._));
    expect(types.has('pageBlockTitle')).toBe(true);
    expect(types.has('pageBlockHeader')).toBe(true);
    expect(types.has('pageBlockSubheader')).toBe(true);
    expect(types.has('pageBlockParagraph')).toBe(true);
    expect(types.has('pageBlockBlockquote')).toBe(true);
    expect(types.has('pageBlockList')).toBe(true);
    expect(types.has('pageBlockOrderedList')).toBe(true);
    expect(types.has('pageBlockPreformatted')).toBe(true);
    expect(types.has('pageBlockDivider')).toBe(true);
    expect(types.has('pageBlockTable')).toBe(true);
  });

  test('reference-style link [Search Engine][search] resolves to duckduckgo URL', () => {
    const flat = JSON.stringify(page.blocks);
    expect(flat).toMatch(/"url":"https:\/\/duckduckgo\.com"/);
    expect(flat).toMatch(/"text":"Search Engine"/);
  });

  test('contains GFM tables (header + alignment + data)', () => {
    const tables = page.blocks.filter((b): b is PageBlock.pageBlockTable => b._ === 'pageBlockTable');
    expect(tables.length).toBeGreaterThanOrEqual(2);
    const alignment = tables[1];
    expect((alignment.rows[0].cells[1] as PageTableCell.pageTableCell).pFlags.align_center).toBe(true);
    expect((alignment.rows[0].cells[2] as PageTableCell.pageTableCell).pFlags.align_right).toBe(true);
  });

  test('task list items stash taskChecked with clean text (no ☑/☐ glyph)', () => {
    const flat = JSON.stringify(page.blocks);
    expect(flat).not.toMatch(/☑|☐/);
    expect(flat).toMatch(/"taskChecked":true/);
    expect(flat).toMatch(/"taskChecked":false/);
    expect(flat).toMatch(/Completed task/);
    expect(flat).toMatch(/Incomplete task/);
  });

  test('footnote definitions are appended at end, separated by a divider', () => {
    // section = divider, [header], anchor(fn-1), def-1, anchor(fn-2), def-2 → last 6 blocks.
    const lastFew = page.blocks.slice(-6);
    // the fixture already has a "## Footnotes" heading, so the auto header is suppressed;
    // a divider separates the appended definitions from the body instead.
    expect(lastFew.some((b) => b._ === 'pageBlockDivider')).toBe(true);
    // each definition is preceded by its anchor (#fn-N) so references can jump to it.
    expect(page.blocks.some((b) => b._ === 'pageBlockAnchor' && (b as PageBlock.pageBlockAnchor).name === 'fn-1')).toBe(true);
    // and no duplicate auto "Footnotes" header sits at the very end
    expect(lastFew.some((b) => b._ === 'pageBlockHeader' &&
      JSON.stringify((b as PageBlock.pageBlockHeader).text).includes('Footnotes'))).toBe(false);
    const flat = JSON.stringify(page.blocks);
    expect(flat).toMatch(/footnote number one/);
    expect(flat).toMatch(/longer footnote/);
  });

  test('inline footnote references rendered as sequential numbers, not raw ids', () => {
    const flat = JSON.stringify(page.blocks);
    expect(flat).toMatch(/textSuperscript[^}]*"text":"1"/);
    expect(flat).toMatch(/textSuperscript[^}]*"text":"2"/); // [^long-note] → 2
    expect(flat).not.toContain('"text":"long-note"');
  });

  test('inline math $X$ → decoded math marker in paragraph', () => {
    const mathParagraphs = page.blocks.filter((b): b is PageBlock.pageBlockParagraph =>
      b._ === 'pageBlockParagraph' && decodeFirstInlineMath((b as PageBlock.pageBlockParagraph).text) !== undefined);
    expect(mathParagraphs.length).toBeGreaterThan(0);
    expect(mathParagraphs.some((p) => decodeFirstInlineMath(p.text) === 'a^2 + b^2 = c^2')).toBe(true);
  });

  test('block math $$...$$ → pageBlockPreformatted with language "math"', () => {
    const mathBlocks = page.blocks.filter((b): b is PageBlock.pageBlockPreformatted =>
      b._ === 'pageBlockPreformatted' && (b as PageBlock.pageBlockPreformatted).language === 'math');
    expect(mathBlocks.length).toEqual(1);
    expect(JSON.stringify(mathBlocks[0].text)).toMatch(/int_0\^1/);
  });

  test('definition list term renders as bold paragraph + blockquoted definitions', () => {
    const blockTexts = page.blocks.map((b) => JSON.stringify(b));
    const term1 = blockTexts.findIndex((s) => s.includes('"text":"Term 1"'));
    expect(term1).toBeGreaterThan(0);
    expect(blockTexts[term1]).toMatch(/textBold/);
    expect(page.blocks[term1 + 1]._).toEqual('pageBlockBlockquote');
  });

  test('reference-style link definition is not rendered as a paragraph', () => {
    const stringified = JSON.stringify(page.blocks);
    expect(stringified).not.toMatch(/duckduckgo\.com.*DuckDuckGo/);
  });

  test('contains a fenced javascript code block with greet function', () => {
    const jsBlocks = page.blocks.filter((b): b is PageBlock.pageBlockPreformatted =>
      b._ === 'pageBlockPreformatted' && (b as PageBlock.pageBlockPreformatted).language === 'javascript');
    expect(jsBlocks.length).toEqual(1);
    expect(JSON.stringify(jsBlocks[0].text)).toMatch(/greet/);
  });

  test('contains a fenced python code block with fib function', () => {
    const pyBlocks = page.blocks.filter((b): b is PageBlock.pageBlockPreformatted =>
      b._ === 'pageBlockPreformatted' && (b as PageBlock.pageBlockPreformatted).language === 'python');
    expect(pyBlocks.length).toEqual(1);
    expect(JSON.stringify(pyBlocks[0].text)).toMatch(/fib/);
  });

  test('contains an indented code block', () => {
    const indented = page.blocks.filter((b): b is PageBlock.pageBlockPreformatted =>
      b._ === 'pageBlockPreformatted' && (b as PageBlock.pageBlockPreformatted).language === '' &&
      JSON.stringify((b as PageBlock.pageBlockPreformatted).text).includes('indented code block'));
    expect(indented.length).toBeGreaterThanOrEqual(1);
  });

  test('all top-level dividers are rendered (--- *** ___)', () => {
    const dividers = page.blocks.filter((b) => b._ === 'pageBlockDivider');
    expect(dividers.length).toBeGreaterThanOrEqual(4);
  });

  test('escape characters render literally (no markdown applied)', () => {
    const stringified = JSON.stringify(page.blocks);
    expect(stringified).toMatch(/\\\*not italic\\\*|\*not italic\*/);
  });

  test('autolink <URL> becomes a textUrl', () => {
    const stringified = JSON.stringify(page.blocks);
    expect(stringified).toMatch(/textUrl[^}]*example\.com\/path\?query=1&lang=en/);
  });

  test('blockquote with inline formatting parses', () => {
    const quotes = page.blocks.filter((b) => b._ === 'pageBlockBlockquote');
    expect(quotes.length).toBeGreaterThanOrEqual(3);
    const formatted = quotes.find((q) => JSON.stringify(q).includes('textBold'));
    expect(formatted).toBeTruthy();
  });

  test('h1 inside body becomes Header (first H1 already used as Title)', () => {
    const h1Inside = page.blocks.find((b, idx) =>
      idx > 0 && b._ === 'pageBlockHeader' &&
      JSON.stringify((b as PageBlock.pageBlockHeader).text).includes('H1 Heading'));
    expect(h1Inside).toBeTruthy();
  });

  test('every list block has at least one item', () => {
    const lists = page.blocks.filter((b) => b._ === 'pageBlockList' || b._ === 'pageBlockOrderedList');
    expect(lists.length).toBeGreaterThan(0);
    lists.forEach((l) => {
      const items = (l as PageBlock.pageBlockList | PageBlock.pageBlockOrderedList).items;
      expect(items.length).toBeGreaterThan(0);
    });
  });

  test('total block count is reasonable for the example file', () => {
    expect(page.blocks.length).toBeGreaterThan(20);
  });
});

// Flatten a RichText tree to its visible text (every wrapping node carries its child under `.text`).
function richTextToPlain(rt: RichText): string {
  if(!rt) return '';
  switch(rt._) {
    case 'textEmpty': return '';
    case 'textPlain': return rt.text;
    case 'textConcat': return rt.texts.map(richTextToPlain).join('');
    default: return richTextToPlain((rt as any).text);
  }
}

// Find the first inline-math marker in a RichText tree and decode its LaTeX source.
function decodeFirstInlineMath(rt: RichText): string {
  const s = richTextToPlain(rt);
  MATH_MARKER_RE.lastIndex = 0;
  const m = MATH_MARKER_RE.exec(s);
  return m ? decodeInlineMath(m[1]) : undefined;
}

// Sentinel control chars (\x04 \x06 \x07) and escape-placeholder PUA must never reach the output.
function hasLeakedChars(s: string): boolean {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F-]/.test(s);
}

// Find the first node of a given type anywhere in the tree.
function findNode(rt: RichText, type: string): RichText | undefined {
  if(!rt) return undefined;
  if(rt._ === type) return rt;
  if(rt._ === 'textConcat') {
    for(const t of rt.texts) {
      const found = findNode(t, type);
      if(found) return found;
    }
    return undefined;
  }
  return findNode((rt as any).text, type);
}

describe('regression: parseMarkdownToPage never hangs on unconsumed block-start lines', () => {
  test('a pipe-wrapped line that is not a GFM table renders as a paragraph (no infinite loop)', () => {
    const page = parseMarkdownToPage('| a | b |');
    expect(page.blocks.length).toBeGreaterThan(0);
    expect(page.blocks.some((b) => b._ === 'pageBlockParagraph')).toBe(true);
  });

  test('pipe line surrounded by real content', () => {
    const page = parseMarkdownToPage('intro\n\n| x | y |\n\nmore');
    const paras = page.blocks.filter((b) => b._ === 'pageBlockParagraph');
    expect(paras.length).toBe(3);
  });

  test('a second separator row inside a table body does not hang', () => {
    const page = parseMarkdownToPage('| h |\n| --- |\n| d |\n| --- |\n| e |');
    expect(page.blocks.length).toBeGreaterThan(0);
    expect(page.blocks.some((b) => b._ === 'pageBlockTable')).toBe(true);
  });

  test('a stray pipe line before a definition list does not hang', () => {
    const page = parseMarkdownToPage('| x |\n: def');
    expect(page.blocks.length).toBeGreaterThan(0);
  });
});

describe('regression: inlineMarkdownToRichText escapes inside emphasis', () => {
  test('escaped parens inside *italic* keep the italic and drop the backslashes', () => {
    expect(inlineMarkdownToRichText('*see \\(note\\)*')).toEqual({
      _: 'textItalic',
      text: {_: 'textPlain', text: 'see (note)'}
    });
  });

  test('escaped asterisk inside *italic* renders a literal asterisk', () => {
    expect(inlineMarkdownToRichText('*a\\*b*')).toEqual({
      _: 'textItalic',
      text: {_: 'textPlain', text: 'a*b'}
    });
  });

  test('escaped char inside **bold**', () => {
    expect(inlineMarkdownToRichText('**a\\_b**')).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'a_b'}
    });
  });
});

describe('regression: inlineMarkdownToRichText link URL never leaks control chars', () => {
  test('escaped underscore in a link URL is restored, not left as a placeholder', () => {
    const r = inlineMarkdownToRichText('[t](http://ex.com/a\\_b)') as RichText.textUrl;
    expect(r._).toEqual('textUrl');
    expect(r.url).toEqual('http://ex.com/a_b');
    expect(hasLeakedChars(r.url)).toBe(false);
  });
});

describe('regression: inline formatting inside <sub>/<sup>/<mark>', () => {
  test('<mark>**hot**</mark> renders bold inside the mark', () => {
    expect(inlineMarkdownToRichText('<mark>**hot**</mark>')).toEqual({
      _: 'textMarked',
      text: {_: 'textBold', text: {_: 'textPlain', text: 'hot'}}
    });
  });

  test('formatting that severs a sentinel pair never leaks a raw control char', () => {
    const r = inlineMarkdownToRichText('x<sup>a*b*c</sup>');
    expect(hasLeakedChars(richTextToPlain(r))).toBe(false);
    // the inner italic survives even though the superscript styling is dropped on the severed parts
    expect(findNode(r, 'textItalic')).toBeTruthy();
  });
});

describe('regression: parseMarkdownToPage footnotes and references', () => {
  test('an indented footnote definition after another is not swallowed', () => {
    const page = parseMarkdownToPage('Body[^1] and[^2].\n\n[^1]: first\n  [^2]: second');
    // Footnotes header + 2 footnote paragraphs at the end
    const headerIdx = page.blocks.findIndex((b) => b._ === 'pageBlockHeader');
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    const footnoteParas = page.blocks.slice(headerIdx + 1).filter((b) => b._ === 'pageBlockParagraph');
    expect(footnoteParas.length).toBe(2);
  });

  const countFootnoteHeaders = (page: {blocks: PageBlock[]}) => page.blocks.filter((b) =>
    b._ === 'pageBlockHeader' && JSON.stringify((b as PageBlock.pageBlockHeader).text).includes('Footnotes')).length;

  test('auto "Footnotes" header is suppressed when the document already has one', () => {
    const withHeading = parseMarkdownToPage('Ref[^x].\n\n## Footnotes\n\n[^x]: def');
    expect(countFootnoteHeaders(withHeading)).toBe(1); // only the author\'s, no duplicate
    expect(withHeading.blocks.some((b) => b._ === 'pageBlockDivider')).toBe(true);

    const withoutHeading = parseMarkdownToPage('Ref[^x].\n\n[^x]: def');
    expect(countFootnoteHeaders(withoutHeading)).toBe(1); // auto header added when none exists
  });

  test('footnote references are clickable (link to definition + anchored for back-links)', () => {
    const page = parseMarkdownToPage('See[^a] here.\n\n[^a]: The note.');
    const flat = JSON.stringify(page.blocks);
    // reference: a superscript link to #fn-1, wrapped in a #fnref-1 anchor for the back-link target
    expect(flat).toContain('"url":"#fn-1"');
    expect(flat).toContain('"name":"fnref-1"');
    expect(flat).toMatch(/textAnchor[\s\S]*?textSuperscript[\s\S]*?textUrl/);
    // definition: preceded by a #fn-1 anchor block; its leading number links back to #fnref-1
    expect(page.blocks.some((b) => b._ === 'pageBlockAnchor' &&
      (b as PageBlock.pageBlockAnchor).name === 'fn-1')).toBe(true);
    expect(flat).toContain('"url":"#fnref-1"');
    // the definition's leading marker is a superscript link (back-link), not plain text
    const defBlock = page.blocks.find((b) => b._ === 'pageBlockParagraph' &&
      JSON.stringify((b as PageBlock.pageBlockParagraph).text).includes('The note')) as PageBlock.pageBlockParagraph;
    expect(JSON.stringify(defBlock.text)).toMatch(/textSuperscript[\s\S]*?textUrl[\s\S]*?#fnref-1/);
  });

  test('duplicate footnote definitions keep the first and stay consistently numbered', () => {
    const page = parseMarkdownToPage('Ref[^a].\n\n[^a]: first\n[^a]: second');
    const fnAnchors = page.blocks.filter((b) => b._ === 'pageBlockAnchor' &&
      (b as PageBlock.pageBlockAnchor).name.startsWith('fn-'));
    expect(fnAnchors.length).toBe(1); // one anchor, not two
    expect((fnAnchors[0] as PageBlock.pageBlockAnchor).name).toBe('fn-1');
    const flat = JSON.stringify(page.blocks);
    expect(flat).toContain('first');
    expect(flat).not.toContain('second'); // the duplicate definition is dropped, not leaked
  });

  test('a 3-space-indented link reference still resolves', () => {
    const page = parseMarkdownToPage('Use [x][s].\n\n   [s]: https://example.com');
    const para = page.blocks.find((b) => b._ === 'pageBlockParagraph') as PageBlock.pageBlockParagraph;
    expect(findNode(para.text, 'textUrl')).toBeTruthy();
    // the indented definition line itself must not leak into the document
    expect(page.blocks.some((b) => richTextToPlain((b as any).text || {_: 'textEmpty'}).includes('https://example.com') &&
      b._ === 'pageBlockParagraph' && richTextToPlain((b as any).text).startsWith('[s]'))).toBe(false);
  });
});

describe('regression: parseMarkdownToPage fenced code with an info string', () => {
  test('fence whose info string has a space is recognised as code', () => {
    const page = parseMarkdownToPage('```js extra\ncode();\n```');
    const pre = page.blocks.find((b) => b._ === 'pageBlockPreformatted') as PageBlock.pageBlockPreformatted;
    expect(pre).toBeTruthy();
    expect(pre.language).toEqual('js');
    expect(richTextToPlain(pre.text)).toEqual('code();');
  });
});
