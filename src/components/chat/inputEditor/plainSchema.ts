import type {MarkupTooltipTypes} from '@components/chat/markupTooltip';
import type {InputFormattingTypes} from '@helpers/dom/getInputFormattingTypes';

/**
 * What a message can carry as plain text plus entities.
 *
 * The chat composer uses these sets to decide whether a document still fits the
 * plain representation (`getMode`). A field that may only ever produce a caption
 * — a media caption, a forward comment, a poll description — builds its schema
 * from the same sets, so a rich block cannot exist there at all instead of being
 * detected after the fact. One source, two uses: a node added to the composer
 * has to be classified here once, and both the mode check and the plain field
 * follow.
 *
 * A list is not here: entities have no list, and what a field shows as one must
 * not leave as `1. ` text. The official clients send a list as a rich message
 * too, and keep list-looking text literal where a message carries entities only.
 */
export const PLAIN_MESSAGE_NODE_NAMES = new Set([
  'blockquote',
  'blockquoteCaption',
  'codeBlock',
  'customEmoji',
  'hardBreak',
  'paragraph',
  'text'
]);

export const PLAIN_MESSAGE_MARK_NAMES = new Set([
  'bold',
  'code',
  'formattedDate',
  'inlineQuote',
  'italic',
  'link',
  'mentionName',
  'spoiler',
  'strike',
  'underline'
]);

/**
 * Schemaless extensions the plain field keeps. Plugins carry no node to classify
 * them by, so they are listed: everything driving lists, rich blocks, tables,
 * media uploads or block reordering is left out, and what remains is caret and
 * emoji behaviour, pasted lists kept as text, pasted text kept line by line,
 * plus history.
 */
const PLAIN_MESSAGE_PLUGIN_NAMES = new Set([
  'chatCopiedMessagePaste',
  'chatCustomEmojiText',
  'chatEmojiImages',
  'chatEmptyDocumentSelection',
  'chatInlineAtomNavigation',
  'chatInputPlaceholders',
  'chatPlainListPaste',
  'chatRichMessageAttributes',
  'chatTextPaste',
  'undoRedo'
]);

/** The blocks a plain message has besides its paragraphs. */
const PLAIN_MESSAGE_BLOCK_NAMES = new Set([
  'blockquote',
  'codeBlock'
]);

/**
 * What a field holding a single line cannot have. A poll option, a checklist
 * item or a folder name is one line by definition — there is no second line to
 * put a quote, a list or a code block on, and a break would make one. The inline
 * content is the same as a plain message's: text, custom emoji and their marks.
 */
const BLOCK_STRUCTURE_NODE_NAMES = new Set([
  ...PLAIN_MESSAGE_BLOCK_NAMES,
  'blockquoteCaption',
  'hardBreak'
]);

/**
 * Whether a plain field's schema can hold a block — a quote or code — and so may
 * end with one, which then needs a line after it to type on.
 */
export function holdsPlainMessageBlocks(extensions: readonly ClassifiableExtension[]) {
  return extensions.some(({type, name}) => type === 'node' && PLAIN_MESSAGE_BLOCK_NAMES.has(name));
}

type ClassifiableExtension = {
  name: string,
  type: string
};

export default function isPlainMessageExtension(extension: ClassifiableExtension) {
  switch(extension.type) {
    // `doc` carries no content of its own and every schema needs it.
    case 'node': return extension.name === 'doc' || PLAIN_MESSAGE_NODE_NAMES.has(extension.name);
    case 'mark': return PLAIN_MESSAGE_MARK_NAMES.has(extension.name);
    default: return PLAIN_MESSAGE_PLUGIN_NAMES.has(extension.name);
  }
}

export function isSingleLineMessageExtension(extension: ClassifiableExtension) {
  if(!isPlainMessageExtension(extension)) return false;
  return extension.type !== 'node' || !BLOCK_STRUCTURE_NODE_NAMES.has(extension.name);
}

/**
 * What each formatting type a field can declare (`can-format`, see
 * `getInputFormattingTypes`) puts into the schema. A field builds its schema
 * without the parts of the types it does not declare, so neither a shortcut, nor
 * markdown typed or pasted, nor formatted HTML pasted in can produce what the
 * field cannot carry — and its tooltip, asking the schema, offers none of it.
 */
const FORMATTING_SCHEMA_NAMES: Record<MarkupTooltipTypes, readonly string[]> = {
  bold: ['bold'],
  italic: ['italic'],
  underline: ['underline'],
  strikethrough: ['strike'],
  monospace: ['code', 'codeBlock'],
  spoiler: ['spoiler'],
  quote: ['blockquote', 'blockquoteCaption'],
  link: ['link'],
  date: ['formattedDate'],
  highlight: ['highlight'],
  subscript: ['subscript'],
  superscript: ['superscript']
};

const FORMATTING_TYPE_BY_SCHEMA_NAME = new Map<string, MarkupTooltipTypes>(
  (Object.entries(FORMATTING_SCHEMA_NAMES) as [MarkupTooltipTypes, readonly string[]][])
  .flatMap(([type, names]) => names.map((name) => [name, type] as const))
);

export function isDeclaredFormattingExtension(extension: ClassifiableExtension, formatting: InputFormattingTypes) {
  if(formatting === 'all') return true;
  const type = FORMATTING_TYPE_BY_SCHEMA_NAME.get(extension.name);
  return !type || formatting.has(type);
}
