import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {Plugin, PluginKey, type Transaction} from '@tiptap/pm/state';
import {AddMarkStep, RemoveMarkStep} from '@tiptap/pm/transform';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import emojiRegExp from '@vendor/emoji/regex';
import getEmojiUnified from '@lib/richTextProcessor/getEmojiUnified';
import {areAllEmojiNative, getEmojiImageUrl, isEmojiNative} from '@lib/richTextProcessor/emojiImage';

export const CHAT_INPUT_EMOJI_IMAGE_CLASS = 'chat-input-emoji-image';
const CHAT_INPUT_EMOJI_IMAGE_SELECTED_CLASS = 'chat-input-emoji-image-selected';
const CHAT_INPUT_EMOJI_IMAGE_REST_CLASS = 'chat-input-emoji-image-rest';

const EMOJI_REG_EXP = new RegExp(emojiRegExp, 'g');

/**
 * One emoji can be split over text nodes whose marks differ (a skin tone in bold): it is the run
 * of adjacent text that is scanned, and a match crossing a node boundary is drawn once — the
 * image on its first part, the parts after it folded away.
 */
function addRunDecorations(text: string, start: number, boundaries: number[], decorations: Decoration[]) {
  EMOJI_REG_EXP.lastIndex = 0;
  for(let match: RegExpExecArray; match = EMOJI_REG_EXP.exec(text);) {
    const unicode = getEmojiUnified(match[0]);
    if(!unicode || isEmojiNative(unicode)) continue;
    const from = start + match.index;
    const to = from + match[0].length;
    const ends = [...boundaries.filter((boundary) => boundary > from && boundary < to), to];
    decorations.push(Decoration.inline(from, ends[0], {
      'class': CHAT_INPUT_EMOJI_IMAGE_CLASS,
      'style': `background-image: url("${getEmojiImageUrl(unicode)}")`
    }, {emojiImage: true}));
    for(let index = 1; index < ends.length; ++index) {
      decorations.push(Decoration.inline(ends[index - 1], ends[index], {class: CHAT_INPUT_EMOJI_IMAGE_REST_CLASS}));
    }
  }
}

function addTextblockDecorations(block: ProseMirrorNode, contentStart: number, decorations: Decoration[]) {
  // code shows what was typed, character by character
  if(block.type.spec.code) return;
  // a textblock holds inline nodes only, and adjacent text nodes have adjacent positions
  let text = '', start = 0;
  const boundaries: number[] = [];
  const flush = () => {
    if(text) addRunDecorations(text, start, boundaries, decorations);
    text = '';
    boundaries.length = 0;
  };
  block.forEach((node, offset) => {
    const position = contentStart + offset;
    // an inline atom (a custom emoji, a break) or code ends a run
    if(!node.isText || node.marks.some((mark) => mark.type.spec.code)) return flush();
    if(text) boundaries.push(position);
    else start = position;
    text += node.text;
  });
  flush();
}

function textblocksTouching(doc: ProseMirrorNode, from: number, to: number, blocks: Map<number, ProseMirrorNode>) {
  // a change that only removed something is a point: widen it to the textblocks on either side
  doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node, position) => {
    if(!node.isTextblock) return true;
    blocks.set(position, node);
    return false;
  });
}

/** Where the transaction changed content, in the coordinates of the document it produced. */
function changedTextblocks(transaction: Transaction) {
  const blocks = new Map<number, ProseMirrorNode>();
  const {mapping, doc, steps} = transaction;
  steps.forEach((step, index) => {
    const rest = mapping.slice(index + 1);
    mapping.maps[index].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      textblocksTouching(doc, rest.map(newStart, -1), rest.map(newEnd, 1), blocks);
    });
    // a mark added or removed moves nothing, so its map is empty — yet code in or out changes
    // whether an emoji is drawn, and a mark can split one emoji over text nodes or join it back
    if(step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      textblocksTouching(doc, rest.map(step.from, -1), rest.map(step.to, 1), blocks);
    }
  });
  return blocks;
}

function decorateDocument(doc: ProseMirrorNode) {
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if(!node.isTextblock) return true;
    addTextblockDecorations(node, position + 1, decorations);
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const chatEmojiImagesKey = new PluginKey<DecorationSet>('chatEmojiImages');

/**
 * The app draws emoji as its own images wherever the platform's font would not
 * (everywhere but Apple's, and there the versions its font lacks), and a field
 * has to show them as the message will. The document keeps the emoji as text —
 * caret, selection, IME and the clipboard stay the browser's — and only the
 * view paints the image over a glyph it makes transparent.
 *
 * Only the textblocks a transaction touched are scanned again: this runs on
 * every keystroke of the chat input.
 */
export const ChatEmojiImages = Extension.create({
  name: 'chatEmojiImages',

  addProseMirrorPlugins() {
    if(areAllEmojiNative()) return [];
    return [new Plugin<DecorationSet>({
      key: chatEmojiImagesKey,
      state: {
        init: (_config, {doc}) => decorateDocument(doc),
        apply(transaction, decorations) {
          if(!transaction.docChanged) return decorations;
          decorations = decorations.map(transaction.mapping, transaction.doc);
          changedTextblocks(transaction).forEach((block, position) => {
            const fresh: Decoration[] = [];
            addTextblockDecorations(block, position + 1, fresh);
            decorations = decorations
            .remove(decorations.find(position, position + block.nodeSize))
            .add(transaction.doc, fresh);
          });
          return decorations;
        }
      },
      props: {
        decorations: (state) => {
          const decorations = chatEmojiImagesKey.getState(state);
          const {from, to, empty} = state.selection;
          if(empty) return decorations;
          // the glyph under an image is transparent, and the browser paints the selection
          // only behind a glyph: a selected emoji would be a hole in it without this
          const selected = decorations.find(from, to, (spec) => spec.emojiImage)
          .filter((decoration) => decoration.from >= from && decoration.to <= to);
          if(!selected.length) return decorations;
          return decorations.add(state.doc, selected.map((decoration) => Decoration.inline(
            decoration.from,
            decoration.to,
            {class: CHAT_INPUT_EMOJI_IMAGE_SELECTED_CLASS}
          )));
        }
      }
    })];
  }
});
