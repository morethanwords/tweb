import {Document} from '@tiptap/extension-document';
import {HardBreak} from '@tiptap/extension-hard-break';
import {BulletList, OrderedList} from '@tiptap/extension-list';
import {Strike} from '@tiptap/extension-strike';
import {Text} from '@tiptap/extension-text';
import {Underline} from '@tiptap/extension-underline';
import {UndoRedo} from '@tiptap/extensions';
import {getSchema, type AnyExtension} from '@tiptap/core';
import type {Schema} from '@tiptap/pm/model';
import isPlainMessageExtension, {isDeclaredFormattingExtension, isSingleLineMessageExtension} from '@components/chat/inputEditor/plainSchema';
import type {InputFormattingTypes} from '@helpers/dom/getInputFormattingTypes';
import classNames from '@helpers/string/classNames';
import {instantViewStyles} from '@components/instantViewFormatting';
import {CHAT_INPUT_HISTORY_NEW_GROUP_DELAY} from '@components/chat/inputEditor/history';
import ChatRichMediaUploadHistory from '@components/chat/inputEditor/mediaUploadHistory';
import {ChatListBehavior, ChatListKeymap} from '@components/chat/inputEditor/listExtension';
import {ChatInputPlaceholders} from '@components/chat/inputEditor/placeholders';
import {ChatTableClipboard} from '@components/chat/inputEditor/tableClipboard';
import {ChatCopiedMessagePaste, ChatInputRichClipboard, ChatPlainListPaste, ChatTextPaste} from '@components/chat/inputEditor/richClipboard';
import {ChatHeading, ChatParagraph} from '@components/chat/inputEditor/extensions/textBlocks';
import {
  ChatBlockquote,
  ChatBlockquoteCaption,
  ChatPullquote,
  ChatPullquoteText,
  ChatPullquoteCaption
} from '@components/chat/inputEditor/extensions/quotes';
import {ChatDetails, ChatDetailsSummary, ChatDetailsBody} from '@components/chat/inputEditor/extensions/details';
import {ChatRichBlockEditing} from '@components/chat/inputEditor/extensions/blockEditing';
import {ChatCodeBlock} from '@components/chat/inputEditor/extensions/codeBlock';
import {
  ChatTableWrapper,
  ChatTableTitle,
  ChatTableSelectAll,
  ChatTableCell,
  ChatTableHeader,
  ChatTableContentGuard
} from '@components/chat/inputEditor/extensions/tableNodes';
import {ChatTableKit, ChatTableChrome} from '@components/chat/inputEditor/extensions/tableView';
import {ChatTableNavigation} from '@components/chat/inputEditor/extensions/tableNavigation';
import {ChatRichMessageAttributes} from '@components/chat/inputEditor/extensions/attributes';
import {
  ChatListBackspace,
  ChatListItem,
  ChatTaskList,
  ChatTaskItem
} from '@components/chat/inputEditor/extensions/listNodes';
import {
  ChatBold,
  ChatInlineCode,
  ChatItalic,
  ChatSpoiler,
  ChatHighlight,
  ChatFormattedDate,
  ChatLink,
  ChatMentionName,
  ChatSubscript,
  ChatSuperscript
} from '@components/chat/inputEditor/extensions/marks';
import {ChatInlineRichAnchor, ChatRichAnchor} from '@components/chat/inputEditor/extensions/anchors';
import {ChatInlineMath, ChatBlockMath} from '@components/chat/inputEditor/extensions/math';
import {ChatRichMedia} from '@components/chat/inputEditor/extensions/media';
import {ChatRichFooter, ChatRichDivider, ChatOpaqueRichBlock} from '@components/chat/inputEditor/extensions/richBlocks';
import {ChatRichMap} from '@components/chat/inputEditor/extensions/map';
import {ChatCustomEmoji, ChatCustomEmojiText} from '@components/chat/inputEditor/extensions/customEmoji';
import {ChatEmojiImages} from '@components/chat/inputEditor/extensions/emojiImages';
import {ChatInlineAtomNavigation, ChatEmptyDocumentSelection} from '@components/chat/inputEditor/extensions/navigation';
import {ChatBlockReorder} from '@components/chat/inputEditor/extensions/blockReorder';
import {ChatButtonRow, ChatRichButton} from '@components/chat/inputEditor/extensions/richButtons';

const LIST_HTML_ATTRIBUTES = (ordered: boolean) => ({
  class: classNames(
    'browser-default chat-input-list',
    ordered ? 'chat-input-list-ordered' : 'chat-input-list-bullet',
    instantViewStyles.List,
    ordered ? instantViewStyles.ListOrdered : instantViewStyles.ListBullet,
    instantViewStyles.BlockContainer,
    instantViewStyles.BlockGutter
  )
});

/**
 * StarterKit's own extensions, listed explicitly and in its order.
 *
 * It is a barrel: it statically imports every extension it can compose, so the
 * eleven this composer replaces with its own nodes (paragraphs, headings,
 * quotes, code, list items, …) shipped in the bundle regardless of being
 * configured off — and `link` dragged `linkifyjs` along with it. Keep the order
 * in sync with StarterKit's `addExtensions`: schema node order decides the
 * default block type.
 */
export const TIPTAP_BASE_EXTENSIONS = [
  ChatBold,
  BulletList.configure({HTMLAttributes: LIST_HTML_ATTRIBUTES(false), keepMarks: true}),
  Document,
  HardBreak,
  UndoRedo.configure({newGroupDelay: CHAT_INPUT_HISTORY_NEW_GROUP_DELAY}),
  ChatItalic,
  ChatLink,
  OrderedList.configure({HTMLAttributes: LIST_HTML_ATTRIBUTES(true), keepMarks: true}),
  Strike,
  Text,
  Underline
];

// what a list pasted into a field without lists is read with (ChatPlainListPaste)
let richSchema: Schema;

export const CHAT_INPUT_EXTENSIONS: AnyExtension[] = [
  ChatHeading,
  ChatParagraph,
  ChatBlockquote,
  ChatBlockquoteCaption,
  ChatPullquote,
  ChatPullquoteText,
  ChatPullquoteCaption,
  ChatDetails,
  ChatDetailsSummary,
  ChatDetailsBody,
  ChatInputPlaceholders,
  ChatRichBlockEditing,
  ChatCodeBlock,
  ChatTableWrapper,
  ChatTableTitle,
  ChatTableKit,
  ChatTableChrome,
  ChatTableSelectAll,
  ChatTableCell,
  ChatTableHeader,
  ChatTableContentGuard,
  ChatTableNavigation,
  ChatRichMessageAttributes,
  ChatInputRichClipboard,
  ChatPlainListPaste.configure({richSchema: () => richSchema ??= getSchema([...TIPTAP_BASE_EXTENSIONS, ...CHAT_INPUT_EXTENSIONS])}),
  ChatTextPaste,
  ChatTableClipboard,
  ChatCopiedMessagePaste,
  ChatListBackspace,
  ChatListKeymap,
  ChatListBehavior,
  ChatListItem,
  ChatTaskList,
  ChatTaskItem,
  ChatInlineCode,
  ChatSpoiler,
  ChatHighlight,
  ChatFormattedDate,
  ChatMentionName,
  ChatSubscript,
  ChatSuperscript,
  ChatInlineRichAnchor,
  ChatInlineMath,
  ChatBlockMath,
  ChatRichMedia,
  ChatRichMediaUploadHistory,
  ChatRichFooter,
  ChatRichDivider,
  ChatRichMap,
  ChatRichAnchor,
  ChatRichButton,
  ChatButtonRow,
  ChatOpaqueRichBlock,
  ChatCustomEmoji,
  ChatCustomEmojiText,
  ChatEmojiImages,
  ChatInlineAtomNavigation,
  ChatEmptyDocumentSelection,
  ChatBlockReorder
];

type MarkSpecConfig = {
  excludes?: unknown,
  marks?: unknown
};

/**
 * ProseMirror resolves `excludes` and a node's `marks` against the schema and
 * throws on a name it cannot find, so a mark kept here may not keep pointing at
 * one that was dropped. Rewriting the spec beats hand-maintaining a second set
 * of exclusions that would drift from the first.
 */
function withResolvableMarkNames(
  extension: AnyExtension,
  keptMarkNames: ReadonlySet<string>
): AnyExtension {
  const rewrite = (value: unknown) => {
    if(typeof(value) !== 'string' || value === '' || value === '_') return value;
    return value.split(' ').filter((name) => keptMarkNames.has(name)).join(' ');
  };

  const spec = extension.config as MarkSpecConfig;
  const config: MarkSpecConfig = {};
  (['excludes', 'marks'] as const).forEach((key) => {
    const next = rewrite(spec[key]);
    if(next !== spec[key]) config[key] = next;
  });

  return Object.keys(config).length ? extension.extend(config) : extension;
}

function composeExtensions(keep: (extension: AnyExtension) => boolean): AnyExtension[] {
  const kept = [...TIPTAP_BASE_EXTENSIONS, ...CHAT_INPUT_EXTENSIONS].filter(keep);
  const keptMarkNames = new Set(kept.filter(({type}) => type === 'mark').map(({name}) => name));
  return kept.map((extension) => withResolvableMarkNames(extension, keptMarkNames));
}

/**
 * The composer's extensions minus everything a plain message cannot represent.
 * Derived rather than listed again: a rich node added above is excluded here
 * automatically, and a plain one has to be classified in `plainSchema.ts`, which
 * is the same place `getMode` reads.
 */
export const PLAIN_MESSAGE_EXTENSIONS: AnyExtension[] = composeExtensions(isPlainMessageExtension);

/** The same, minus the block structure a one-line field has nowhere to put. */
export const SINGLE_LINE_MESSAGE_EXTENSIONS: AnyExtension[] = composeExtensions(isSingleLineMessageExtension);

const declaredFormattingExtensions = new Map<string, AnyExtension[]>();

/**
 * A plain field's extensions, narrowed to the formatting it declares. A field
 * declaring all of it — a caption, a forward comment — shares the sets above;
 * the rest are composed once per combination, since a field is mounted often.
 */
export function getPlainMessageExtensions(singleLine: boolean, formatting: InputFormattingTypes): AnyExtension[] {
  if(formatting === 'all') return singleLine ? SINGLE_LINE_MESSAGE_EXTENSIONS : PLAIN_MESSAGE_EXTENSIONS;
  const key = `${+singleLine}:${[...formatting].sort().join(',')}`;
  let extensions = declaredFormattingExtensions.get(key);
  if(!extensions) {
    const isPlain = singleLine ? isSingleLineMessageExtension : isPlainMessageExtension;
    extensions = composeExtensions((extension) => isPlain(extension) && isDeclaredFormattingExtension(extension, formatting));
    declaredFormattingExtensions.set(key, extensions);
  }

  return extensions;
}
