/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Page, PageBlock, PageListItem, PageListOrderedItem, PageTableCell, PageTableRow, RichText} from '@layer';
import inlineMarkdownToRichText from '@lib/richTextProcessor/inlineMarkdownToRichText';

const FENCED_OPEN_RE = /^(`{3,}|~{3,})\s*(\S*).*$/;
const DIVIDER_RE = /^([-*_])\1{2,}\s*$/;
const ATX_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const UNORDERED_RE = /^(\s*)([*\-+•])\s+(.+)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.+)$/;
const INDENTED_CODE_RE = /^( {4}|\t)(.*)$/;
// up to 3 leading spaces are allowed before a link-reference / footnote definition (CommonMark)
const REF_LINK_DEF_RE = /^ {0,3}\[([^\]\n^][^\]\n]*)\]:\s+(\S+)(?:\s+["'][^"']*["'])?\s*$/;
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^([^\]\n]+)\]:\s+(.*)$/;
const TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const TABLE_CELL_SEP_RE = /^\s*:?-{3,}:?\s*$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;
const MATH_BLOCK_RE = /^\$\$\s*$/;
const DEFLIST_DEF_RE = /^:\s+(.+)$/;
const DETAILS_OPEN_RE = /^\s*<details\b[^>]*>/i;
const DETAILS_CLOSE_RE = /<\/details\s*>/i;
const SUMMARY_RE = /<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i;
// A trailing attribution line inside a blockquote — `— Author`, `– Author`, or `-- Author`. When it
// stands as its own paragraph it becomes the quote's `caption` (the attribution slot Telegram IV
// renders under the quote), matching the common markdown convention for cited quotes.
const BLOCKQUOTE_ATTRIBUTION_RE = /^(?:—|–|--)\s+(.+)$/;

type Refs = Map<string, string>;

function plainOrEmpty(text: string): RichText {
  return text ? {_: 'textPlain', text} : {_: 'textEmpty'};
}

// GitHub-style heading slug: lowercase, drop non-word/space/dash, spaces → dashes.
function slugifyHeading(text: string): string {
  return text
  .toLowerCase()
  .replace(/<[^<>]+>/g, '')
  .replace(/[`*_~]/g, '')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');
}

// Dynamic scope for the id→sequential-number map of the document currently being parsed. Set (with
// save/restore) at the top of parseMarkdownToPage so every inlineToRichText call — including those
// in module-level helpers (lists, tables) — renders `[^id]` references as their number, without
// threading the map through a dozen signatures. Safe because parsing is synchronous & single-pass;
// the recursive <details> parse save/restores it.
let activeFootnoteNumbers: Map<string, number> | undefined;

function inlineToRichText(raw: string, refs: Refs): RichText {
  return inlineMarkdownToRichText(raw, refs, activeFootnoteNumbers);
}

// Build a list-item, detecting markdown task syntax (`[x]` / `[ ]`). The task state is carried in
// the item's native `checkbox`/`checked` pFlags (layer 227) — not rendered as a ☑/☐ glyph — so the
// IV renderer can show a real square checkbox.
function makeListItem(content: string, num: string, isOrdered: boolean, refs: Refs): PageListItem | PageListOrderedItem {
  const task = TASK_RE.exec(content);
  const text = inlineToRichText(task ? task[2] : content, refs);
  const pFlags: PageListItem.pageListItemText['pFlags'] = {};
  if(task) {
    pFlags.checkbox = true;
    if(task[1].toLowerCase() === 'x') pFlags.checked = true;
  }
  return isOrdered ?
    {_: 'pageListOrderedItemText', pFlags, num, text} :
    {_: 'pageListItemText', pFlags, text};
}

function isBlockStart(line: string): boolean {
  return FENCED_OPEN_RE.test(line) ||
    DIVIDER_RE.test(line) ||
    ATX_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    UNORDERED_RE.test(line) ||
    ORDERED_RE.test(line) ||
    INDENTED_CODE_RE.test(line) ||
    TABLE_LINE_RE.test(line) ||
    MATH_BLOCK_RE.test(line) ||
    DETAILS_OPEN_RE.test(line) ||
    REF_LINK_DEF_RE.test(line) ||
    FOOTNOTE_DEF_RE.test(line);
}

function isFenceClose(line: string, openMarker: string): boolean {
  const m = line.match(/^(`{3,}|~{3,})\s*$/);
  if(!m) return false;
  return m[1][0] === openMarker[0] && m[1].length >= openMarker.length;
}

function splitTableCells(line: string): string[] {
  let s = line.trim();
  if(s.startsWith('|')) s = s.slice(1);
  if(s.endsWith('|')) s = s.slice(0, -1);
  s = s.replace(/\\\|/g, '\x05');
  return s.split('|').map((c) => c.trim().replace(/\x05/g, '|'));
}

function isTableSeparatorLine(line: string): boolean {
  if(!TABLE_LINE_RE.test(line)) return false;
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((c) => TABLE_CELL_SEP_RE.test(c));
}

function parseAlignments(separatorCells: string[]): Array<'left' | 'center' | 'right'> {
  return separatorCells.map((c) => {
    const trimmed = c.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if(left && right) return 'center';
    if(right) return 'right';
    return 'left';
  });
}

function makeTableCell(text: string, header: boolean, align: 'left' | 'center' | 'right', refs: Refs): PageTableCell {
  const pFlags: PageTableCell.pageTableCell['pFlags'] = {};
  if(header) pFlags.header = true;
  if(align === 'center') pFlags.align_center = true;
  else if(align === 'right') pFlags.align_right = true;
  const cell: PageTableCell = {_: 'pageTableCell', pFlags};
  if(text) cell.text = inlineToRichText(text, refs);
  return cell;
}

function lineIndent(line: string): number {
  let n = 0;
  for(const ch of line) {
    if(ch === ' ') ++n;
    else if(ch === '\t') n += 4;
    else break;
  }
  return n;
}

function parseListBlock(
  lines: string[],
  startIdx: number,
  baseIndent: number,
  refs: Refs,
  skipLines: Set<number>
): {endIdx: number, block: PageBlock | null} {
  let scan = startIdx;
  while(scan < lines.length && (skipLines.has(scan) || lines[scan].trim() === '')) ++scan;
  if(scan >= lines.length) return {endIdx: startIdx, block: null};

  const firstLine = lines[scan];
  const ordMatch = ORDERED_RE.exec(firstLine);
  const unMatch = ordMatch ? null : UNORDERED_RE.exec(firstLine);
  if(!ordMatch && !unMatch) return {endIdx: startIdx, block: null};

  const isOrdered = !!ordMatch;
  const itemIndent = lineIndent(firstLine);
  if(itemIndent < baseIndent) return {endIdx: startIdx, block: null};

  const items: Array<PageListItem | PageListOrderedItem> = [];
  let i = scan;

  while(i < lines.length) {
    if(skipLines.has(i)) { ++i; continue; }
    if(lines[i].trim() === '') break;
    const line = lines[i];
    const ind = lineIndent(line);
    if(ind < itemIndent) break;

    if(ind === itemIndent) {
      const m = isOrdered ? ORDERED_RE.exec(line) : UNORDERED_RE.exec(line);
      if(!m) break;
      const content = m[3];
      const newItem = makeListItem(content, m[2], isOrdered, refs);
      items.push(newItem);
      ++i;
    } else {
      // ind > itemIndent — possible nested list under previous item
      const nestedOrd = ORDERED_RE.exec(line);
      const nestedUn = nestedOrd ? null : UNORDERED_RE.exec(line);
      if((nestedOrd || nestedUn) && items.length > 0) {
        const {endIdx, block: nestedBlock} = parseListBlock(lines, i, itemIndent + 1, refs, skipLines);
        if(nestedBlock) {
          const last = items[items.length - 1];
          attachNestedBlock(items, items.length - 1, last, nestedBlock);
          i = endIdx;
          continue;
        }
      }
      break;
    }
  }

  if(items.length === 0) return {endIdx: i, block: null};
  const block: PageBlock = isOrdered ?
    {_: 'pageBlockOrderedList', pFlags: {}, items: items as PageListOrderedItem[]} :
    {_: 'pageBlockList', items: items as PageListItem[]};
  return {endIdx: i, block};
}

function attachNestedBlock(
  items: Array<PageListItem | PageListOrderedItem>,
  index: number,
  item: PageListItem | PageListOrderedItem,
  nested: PageBlock
): void {
  if(item._ === 'pageListItemBlocks' || item._ === 'pageListOrderedItemBlocks') {
    item.blocks.push(nested);
    return;
  }
  const text = (item as PageListItem.pageListItemText | PageListOrderedItem.pageListOrderedItemText).text;
  const paraBlock: PageBlock = {_: 'pageBlockParagraph', text};
  if(item._ === 'pageListOrderedItemText') {
    items[index] = {
      _: 'pageListOrderedItemBlocks',
      pFlags: item.pFlags,
      num: item.num,
      blocks: [paraBlock, nested]
    };
  } else {
    items[index] = {
      _: 'pageListItemBlocks',
      pFlags: item.pFlags,
      blocks: [paraBlock, nested]
    };
  }
}

// Build a blockquote block from its inner lines (a single leading `>` already stripped from each).
// The content is parsed recursively so nested blockquotes (`> >`), lists, code blocks, and multiple
// paragraphs survive as real child blocks. A lone paragraph collapses back to the flat
// `pageBlockBlockquote` (keeps simple quotes lightweight and matches native IV); anything richer
// becomes `pageBlockBlockquoteBlocks` carrying the parsed children.
function makeBlockquote(quoteLines: string[], refs: Refs): PageBlock {
  let caption: RichText = {_: 'textEmpty'};

  // Pull out a trailing `— Author` attribution as the caption when it stands on its own paragraph
  // (preceded by a blank line, with real quote content before it), leaving the body to be parsed.
  let last = quoteLines.length - 1;
  while(last >= 0 && quoteLines[last].trim() === '') --last;
  if(last >= 1 && quoteLines[last - 1].trim() === '' && quoteLines.slice(0, last - 1).some((l) => l.trim() !== '')) {
    const m = BLOCKQUOTE_ATTRIBUTION_RE.exec(quoteLines[last].trim());
    if(m) {
      caption = inlineToRichText(m[1], refs);
      quoteLines = quoteLines.slice(0, last);
    }
  }

  const innerBlocks = parseMarkdownToPage(quoteLines.join('\n')).blocks;

  // Empty quote (e.g. it held only an attribution) still renders as a flat, text-less blockquote.
  if(innerBlocks.length === 0) {
    return {_: 'pageBlockBlockquote', text: {_: 'textEmpty'}, caption};
  }

  // A single plain paragraph keeps the lighter inline blockquote (back-compat with flat quotes).
  if(innerBlocks.length === 1 && innerBlocks[0]._ === 'pageBlockParagraph') {
    return {_: 'pageBlockBlockquote', text: innerBlocks[0].text, caption};
  }

  return {_: 'pageBlockBlockquoteBlocks', blocks: innerBlocks, caption};
}

function preScan(lines: string[]): {refs: Refs, footnotes: Array<{id: string, content: string}>, skipLines: Set<number>} {
  const refs: Refs = new Map();
  const footnotes: Array<{id: string, content: string}> = [];
  const skipLines = new Set<number>();
  for(let i = 0; i < lines.length; ++i) {
    const line = lines[i];
    const fn = FOOTNOTE_DEF_RE.exec(line);
    if(fn) {
      let content = fn[2];
      let j = i + 1;
      // swallow indented continuation lines — but stop at the next footnote / link-reference
      // definition so it isn't absorbed and silently lost
      while(
        j < lines.length &&
        /^[ \t]+\S/.test(lines[j]) &&
        lines[j].trim() !== '' &&
        !FOOTNOTE_DEF_RE.test(lines[j]) &&
        !REF_LINK_DEF_RE.test(lines[j])
      ) {
        content += '\n' + lines[j].trim();
        skipLines.add(j);
        ++j;
      }
      // keep the FIRST definition of a given id; a duplicate `[^id]:` is still skipped (not leaked
      // as text) but doesn't create a second numbered entry / anchor.
      if(!footnotes.some((f) => f.id === fn[1])) {
        footnotes.push({id: fn[1], content});
      }
      skipLines.add(i);
      continue;
    }
    const ref = REF_LINK_DEF_RE.exec(line);
    if(ref) {
      refs.set(ref[1].toLowerCase(), ref[2]);
      skipLines.add(i);
    }
  }
  return {refs, footnotes, skipLines};
}

export default function parseMarkdownToPage(raw: string, url = ''): Page.page {
  raw = raw.replace(/<!--[\s\S]*?-->/g, '');
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const blocks: PageBlock[] = [];
  let firstHash = true;

  const {refs, footnotes, skipLines} = preScan(lines);
  // number footnotes in definition order; `[^id]` references render the number, and the section
  // below lists the definitions in the same order (self-consistent, GitHub-like).
  const footnoteNumbers = new Map<string, number>(footnotes.map((fn, idx) => [fn.id, idx + 1]));
  const prevFootnoteNumbers = activeFootnoteNumbers;
  activeFootnoteNumbers = footnoteNumbers;
  let hasFootnotesHeading = false;

  let i = 0;
  while(i < lines.length) {
    if(skipLines.has(i)) {
      ++i;
      continue;
    }

    const line = lines[i];

    if(line.trim() === '') {
      ++i;
      continue;
    }

    const fence = line.match(FENCED_OPEN_RE);
    if(fence) {
      const openMarker = fence[1];
      const language = fence[2] || '';
      const codeLines: string[] = [];
      let j = i + 1;
      while(j < lines.length && !isFenceClose(lines[j], openMarker)) {
        codeLines.push(lines[j]);
        ++j;
      }
      blocks.push({
        _: 'pageBlockPreformatted',
        text: plainOrEmpty(codeLines.join('\n')),
        language
      });
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    if(MATH_BLOCK_RE.test(line)) {
      const mathLines: string[] = [];
      let j = i + 1;
      while(j < lines.length && !MATH_BLOCK_RE.test(lines[j])) {
        mathLines.push(lines[j]);
        ++j;
      }
      blocks.push({
        _: 'pageBlockPreformatted',
        text: plainOrEmpty(mathLines.join('\n')),
        language: 'math'
      });
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    if(DIVIDER_RE.test(line)) {
      blocks.push({_: 'pageBlockDivider'});
      ++i;
      continue;
    }

    const atx = line.match(ATX_RE);
    if(atx) {
      const level = atx[1].length;
      const headingText = atx[2];
      if(headingText.trim().toLowerCase() === 'footnotes') {
        hasFootnotesHeading = true;
      }
      const inner = inlineToRichText(headingText, refs);
      const slug = slugifyHeading(headingText);
      let block: PageBlock;
      if(level === 1) {
        if(firstHash) {
          block = {_: 'pageBlockTitle', text: inner};
          firstHash = false;
        } else {
          block = {_: 'pageBlockHeader', text: inner};
        }
      } else if(level === 2) {
        block = {_: 'pageBlockHeader', text: inner};
      } else {
        block = {_: 'pageBlockSubheader', text: inner};
      }
      // Stash the original markdown level (1-6) so the renderer can pick the right
      // semantic tag (h2-h6) and a level-specific CSS class — pageBlockHeader/Subheader
      // alone collapses h2 with h1-rest and h3..h6 into one style each.
      if(block._ !== 'pageBlockTitle') {
        (block as PageBlock & {headingLevel: number}).headingLevel = level;
      }
      if(slug && block._ !== 'pageBlockTitle') {
        blocks.push({_: 'pageBlockAnchor', name: slug});
      }
      blocks.push(block);
      ++i;
      continue;
    }

    if(DETAILS_OPEN_RE.test(line)) {
      // <details><summary>…</summary>…</details> → native collapsible IV block. The inner content
      // is parsed recursively (reuses all block handling); the <summary> becomes the title.
      const openMatch = line.match(DETAILS_OPEN_RE);
      const firstRemainder = line.slice(openMatch[0].length);
      const innerLines: string[] = [];
      let next: number; // index of the line to resume at, after </details>
      if(DETAILS_CLOSE_RE.test(firstRemainder)) {
        // whole <details>…</details> sits on this one line
        innerLines.push(firstRemainder.slice(0, firstRemainder.search(DETAILS_CLOSE_RE)));
        next = i + 1;
      } else {
        if(firstRemainder.trim()) innerLines.push(firstRemainder);
        let j = i + 1;
        while(j < lines.length && !DETAILS_CLOSE_RE.test(lines[j])) {
          innerLines.push(lines[j]);
          ++j;
        }
        if(j < lines.length) {
          const before = lines[j].slice(0, lines[j].search(DETAILS_CLOSE_RE));
          if(before.trim()) innerLines.push(before);
        }
        next = j < lines.length ? j + 1 : j;
      }
      let innerText = innerLines.join('\n');
      let title: RichText = {_: 'textEmpty'};
      const sm = SUMMARY_RE.exec(innerText);
      if(sm) {
        title = inlineToRichText(sm[1].trim(), refs);
        innerText = innerText.replace(SUMMARY_RE, '');
      }
      blocks.push({
        _: 'pageBlockDetails',
        pFlags: {},
        title,
        blocks: parseMarkdownToPage(innerText).blocks
      });
      i = next;
      continue;
    }

    if(BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while(i < lines.length) {
        const m = lines[i].match(BLOCKQUOTE_RE);
        if(!m) break;
        quoteLines.push(m[1]);
        ++i;
      }
      blocks.push(makeBlockquote(quoteLines, refs));
      continue;
    }

    if(TABLE_LINE_RE.test(line) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const headerCells = splitTableCells(line);
      const aligns = parseAlignments(splitTableCells(lines[i + 1]));
      const rows: PageTableRow[] = [];
      rows.push({
        _: 'pageTableRow',
        cells: headerCells.map((c, idx) => makeTableCell(c, true, aligns[idx] || 'left', refs))
      });
      let j = i + 2;
      while(j < lines.length && TABLE_LINE_RE.test(lines[j]) && !isTableSeparatorLine(lines[j])) {
        const dataCells = splitTableCells(lines[j]);
        rows.push({
          _: 'pageTableRow',
          cells: dataCells.map((c, idx) => makeTableCell(c, false, aligns[idx] || 'left', refs))
        });
        ++j;
      }
      blocks.push({
        _: 'pageBlockTable',
        pFlags: {bordered: true},
        title: {_: 'textEmpty'},
        rows
      });
      i = j;
      continue;
    }

    if(UNORDERED_RE.test(line) || ORDERED_RE.test(line)) {
      const {endIdx, block: listBlock} = parseListBlock(lines, i, 0, refs, skipLines);
      if(listBlock) {
        blocks.push(listBlock);
        i = endIdx;
        continue;
      }
    }

    if(INDENTED_CODE_RE.test(line)) {
      const codeLines: string[] = [];
      while(i < lines.length) {
        const m = lines[i].match(INDENTED_CODE_RE);
        if(!m) break;
        codeLines.push(m[2]);
        ++i;
      }
      blocks.push({
        _: 'pageBlockPreformatted',
        text: plainOrEmpty(codeLines.join('\n')),
        language: ''
      });
      continue;
    }

    if(i + 1 < lines.length && DEFLIST_DEF_RE.test(lines[i + 1]) && !isBlockStart(line)) {
      const term = line;
      const definitions: string[] = [];
      let j = i + 1;
      while(j < lines.length) {
        const m = DEFLIST_DEF_RE.exec(lines[j]);
        if(!m) break;
        definitions.push(m[1]);
        ++j;
      }
      blocks.push({
        _: 'pageBlockParagraph',
        text: {_: 'textBold', text: inlineToRichText(term, refs)}
      });
      for(const def of definitions) {
        blocks.push({
          _: 'pageBlockBlockquote',
          text: inlineToRichText(def, refs),
          caption: {_: 'textEmpty'}
        });
      }
      i = j;
      continue;
    }

    const paragraphLines: string[] = [];
    while(i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i]) && !skipLines.has(i)) {
      paragraphLines.push(lines[i]);
      ++i;
    }
    if(paragraphLines.length) {
      blocks.push({
        _: 'pageBlockParagraph',
        text: inlineToRichText(paragraphLines.join('\n'), refs)
      });
    } else {
      // The line matched isBlockStart() (so the paragraph loop consumed nothing) yet no block
      // branch above claimed it — e.g. a pipe-wrapped line that isn't a real GFM table, or a stray
      // table separator. Emit it as a literal paragraph and advance: `i` MUST always move forward,
      // otherwise the outer while spins forever and hangs the thread.
      blocks.push({
        _: 'pageBlockParagraph',
        text: inlineToRichText(line, refs)
      });
      ++i;
    }
  }

  if(footnotes.length > 0) {
    // A divider separates the definitions from the body (GitHub-style). The auto "Footnotes" header
    // is skipped when the document already titles a section "Footnotes" (avoids a duplicate).
    blocks.push({_: 'pageBlockDivider'});
    if(!hasFootnotesHeading) {
      blocks.push({_: 'pageBlockHeader', text: {_: 'textPlain', text: 'Footnotes'}});
    }
    for(const fn of footnotes) {
      const n = footnoteNumbers.get(fn.id);
      // Anchor (#fn-N) that the reference jumps to.
      blocks.push({_: 'pageBlockAnchor', name: 'fn-' + n});
      blocks.push({
        _: 'pageBlockParagraph',
        text: {
          _: 'textConcat',
          texts: [
            // the leading marker links back to the reference (#fnref-N) — a clean, no-emoji back-link.
            {_: 'textSuperscript', text: {_: 'textUrl', url: '#fnref-' + n, text: {_: 'textPlain', text: '' + n}, webpage_id: 0}},
            {_: 'textPlain', text: ' '},
            inlineToRichText(fn.content, refs)
          ]
        }
      });
    }
  }

  activeFootnoteNumbers = prevFootnoteNumbers;
  return {
    _: 'page',
    pFlags: {},
    url,
    blocks,
    photos: [],
    documents: []
  };
}
