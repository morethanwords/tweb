import type {TextLayerInfo} from '@components/mediaEditor/types';
import {getEditorFontCss, loadEditorFont} from '@components/mediaEditor/fonts';
import {fontInfoMap} from '@components/mediaEditor/utils';
import getTextAppearance from '@components/mediaEditor/textAppearance';
import getLinesRenderingInfo from '@components/mediaEditor/canvas/textLineMetrics';
import {getGraphemeOffsets} from '@lib/richTextProcessor/graphemes';
import stage from '@components/mediaEditor/native/stageTextDom';
import '@components/mediaEditor/canvas/textLine.scss';

/** Read-only recovery from a single, untransformed, already laid-out text block.
 * Source order is retained; sorting bidi fragments by x would corrupt Arabic.
 * Compare the centre of each grapheme's glyph box with the fixed line-height
 * band, not glyph tops (emoji/fallback fonts have different ascenders).
 */
export function recoverDesktopTextBlock(block: HTMLDivElement, lineHeight: number): string[] {
  const text = block.textContent;
  if(!text) return [''];
  const node = block.firstChild;
  if(node?.nodeType !== Node.TEXT_NODE || block.childNodes.length !== 1) {
    throw new Error('Desktop measurement requires a normalized text-only block');
  }
  const offsets = getGraphemeOffsets(text);
  const range = block.ownerDocument.createRange();
  const top = block.getBoundingClientRect().top;
  const lines: string[] = [];
  let start = 0;
  let previousRow: number;
  for(let i = 0; i < offsets.length - 1; ++i) {
    range.setStart(node, offsets[i]);
    range.setEnd(node, offsets[i + 1]);
    const rects = Array.from(range.getClientRects());
    // Zero-width bidi controls still belong to the source line. A browser that
    // provides no box for one leaves it attached to its preceding grapheme.
    let row: number;
    for(const rect of rects) {
      if(rect.height <= 0) continue;
      const band = Math.max(0, Math.floor((rect.top + rect.height / 2 - top) / lineHeight));
      // The shared grapheme helper also keeps complete internal math markers
      // atomic. If such a token spans rows, fail rather than silently truncate
      // its visual lines or split it by UTF-16 offsets.
      if(row !== undefined && row !== band) throw new Error('A grapheme spans multiple visual lines');
      row = band;
    }
    row ??= previousRow;
    if(previousRow !== undefined && row !== undefined && row !== previousRow) {
      lines.push(text.slice(start, offsets[i]));
      start = offsets[i];
    }
    if(row !== undefined) previousRow = row;
  }
  lines.push(text.slice(start));
  return lines;
}

/** Hidden-copy adapter used by the Desktop editing session.
 * Input is a canonical text snapshot with explicit '\n' paragraph boundaries.
 * wrapWidth/font size/results are LOCAL untransformed CSS geometry. A connected
 * hidden measuring tree is necessary: detached DOM has no Range layout boxes.
 * No live editable is accepted, rewritten, focused, or read after an await.
 */
export async function measureDesktopText({text, info: inputInfo, wrapWidth, boxWidth, ownerDocument = document, signal}: {
  text: string;
  info: TextLayerInfo;
  wrapWidth: number;
  boxWidth?: number;
  ownerDocument?: Document;
  signal?: AbortSignal;
}) {
  const info = {...inputInfo};
  if(!Number.isFinite(wrapWidth) || wrapWidth <= 0 || !Number.isFinite(info.size) || info.size <= 0) {
    throw new RangeError('Invalid Desktop text measurement size');
  }
  const check = () => {
    if(signal?.aborted) throw new DOMException('Desktop text measurement aborted', 'AbortError');
  };
  check();
  const font = fontInfoMap[info.font];
  const loading = loadEditorFont(font, info.size, text, ownerDocument);
  if(signal) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new DOMException('Desktop text measurement aborted', 'AbortError'));
      signal.addEventListener('abort', abort, {once: true});
      loading.then(() => resolve(), reject).finally(() => signal.removeEventListener('abort', abort));
    });
  } else await loading;
  check();
  const lineHeight = info.size * 1.33;
  const root = ownerDocument.createElement('div');
  root.dataset.desktopTextMeasurement = '';
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  // No class/inherited editor transforms. All dimensions here are local.
  Object.assign(root.style, {
    position: 'fixed', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none',
    contain: 'layout style paint', boxSizing: 'border-box', width: `${wrapWidth}px`, padding: '0', border: '0', margin: '0',
    font: getEditorFontCss(font, info.size), lineHeight: `${lineHeight}px`,
    whiteSpace: 'break-spaces', overflowWrap: 'anywhere', wordBreak: 'normal',
    textAlign: info.alignment, letterSpacing: 'normal', textTransform: 'none'
  });
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = paragraphs.map(content => {
    const block = ownerDocument.createElement('div');
    block.dir = 'auto';
    block.textContent = content;
    block.style.minHeight = `${lineHeight}px`;
    block.style.boxSizing = 'border-box';
    root.append(block);
    return block;
  });
  try {
    await stage('mutate', () => {
      check();
      ownerDocument.body.append(root);
    });
    const recovered = await stage('measure', () => {
      check();
      return {
        blocks: blocks.map(block => recoverDesktopTextBlock(block, lineHeight)),
        documentHeight: root.getBoundingClientRect().height
      };
    });
    // Re-measure committed no-wrap line boxes using the SAME routine as the
    // existing renderer, rather than passing glyph rectangles to canvas export.
    await stage('mutate', () => {
      check();
      root.style.width = boxWidth === undefined ? 'max-content' : `${boxWidth}px`;
      root.style.whiteSpace = 'pre';
      root.style.overflowWrap = 'normal';
      const background = !!getTextAppearance(info).backgroundColor;
      root.style.setProperty('--text-line-padding', background ? '.3em' : '.2em');
      root.style.setProperty('--text-line-min-width', background ? '2em' : '0');
      root.style.setProperty('--text-line-margin-left', info.alignment === 'left' ? '0' : 'auto');
      root.style.setProperty('--text-line-margin-right', info.alignment === 'right' ? '0' : 'auto');
      root.replaceChildren(...recovered.blocks.flat().map(content => {
        const line = ownerDocument.createElement('div');
        line.className = 'media-editor__text-line';
        line.dir = 'auto';
        line.textContent = content;
        return line;
      }));
    });
    return await stage('measure', () => {
      check();
      return {
        recoveredBlocks: recovered.blocks,
        documentHeight: recovered.documentHeight,
        font: getEditorFontCss(font, info.size), fontSize: info.size, lineHeight,
        renderingInfo: {
          width: root.clientWidth, height: root.clientHeight,
          lines: getLinesRenderingInfo(root, info.alignment, true)
        }
      };
    });
  } finally {
    await stage('mutate', () => root.remove());
  }
}
