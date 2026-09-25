import type {JSONContent} from '@tiptap/core';
import type {InlineButtonType, RichButtonStyle} from '@layer';
import {getButtonBackground} from '@components/wrappers/buttonTypes';
import type {
  ChatInputButtonRowAlign,
  ChatInputRichButton,
  ChatInputRichButtonAction,
  ChatInputRichButtonColor
} from '@components/chat/inputEditor/types';

/**
 * Layer 229's buttons in the composer, without the editor: the node names, and how a node's
 * attributes map to what the message carries. The nodes themselves live in
 * `extensions/richButtons.ts`; the serializer only needs this much.
 *
 * Both nodes are leaves. A button's label — text, custom emoji, dates — is inline content kept
 * as JSON in its `label` attribute, and a row keeps its buttons' attributes in `buttons`: a label
 * is edited in the button's box, never in place, so there is no text in there for the caret, the
 * arrows or a block command to find.
 */
export const RICH_BUTTON_NODE_NAME = 'richButton';
export const BUTTON_ROW_NODE_NAME = 'buttonRow';
// WebA's limit for a row; more would not fit a bubble anyway
export const MAX_BUTTONS_PER_ROW = 8;

const ACTIONS = new Set<ChatInputRichButtonAction>(['url', 'copy', 'userProfile', 'disabled']);
const COLORS = new Set<ChatInputRichButtonColor>(['primary', 'success', 'danger']);
const ALIGNS = new Set<ChatInputButtonRowAlign>(['left', 'center', 'right']);

export function isRichButtonAction(value: unknown): value is ChatInputRichButtonAction {
  return ACTIONS.has(value as ChatInputRichButtonAction);
}

export function getButtonRowAlign(value: unknown): ChatInputButtonRowAlign | null {
  return ALIGNS.has(value as ChatInputButtonRowAlign) ? value as ChatInputButtonRowAlign : null;
}

export type RichButtonAttributes = ReturnType<typeof richButtonAttributes>;

export function richButtonLabelContent(text: string): JSONContent[] {
  return text ? [{type: 'text', text}] : [];
}

/** The label as the box edits it: text, and each custom emoji as its own emoji. */
export function richButtonLabelText(label: JSONContent[] = []): string {
  return label.map((node) => node.type === 'text' ? node.text || '' : `${node.attrs?.emoji || ''}`).join('');
}

/** A button node's attributes; `label` keeps what a custom emoji or a date carries beyond the text. */
export function richButtonAttributes(
  button: Omit<ChatInputRichButton, 'text'> & {text?: string},
  label: JSONContent[] = richButtonLabelContent(button.text)
) {
  return {
    action: button.action,
    url: button.action === 'url' ? button.url || '' : '',
    copyText: button.action === 'copy' ? button.copyText || '' : '',
    userId: button.action === 'userProfile' && button.userId ? String(button.userId) : null,
    color: button.color || null,
    link: !!button.link,
    label
  };
}

export function richButtonFromAttributes(attrs: Record<string, any> = {}): ChatInputRichButton {
  return {
    text: richButtonLabelText(attrs.label),
    action: isRichButtonAction(attrs.action) ? attrs.action : 'disabled',
    url: attrs.url || undefined,
    copyText: attrs.copyText || undefined,
    userId: attrs.userId ? Number(attrs.userId) as UserId : undefined,
    color: COLORS.has(attrs.color) ? attrs.color : undefined,
    link: !!attrs.link || undefined
  };
}

/**
 * The button a user may have in a message of their own: desktop and WebA author a link, a text
 * to copy, a profile or nothing. Anything else acts on a bot's message — no such button can be
 * edited back into the composer.
 */
export function richButtonFromInlineType(
  type: InlineButtonType,
  style?: RichButtonStyle
): Omit<ChatInputRichButton, 'text'> | undefined {
  const common = {color: getButtonBackground(style), link: style?.pFlags.link || undefined};
  switch(type._) {
    case 'inlineButtonTypeUrl':
      return {...common, action: 'url', url: type.url};
    case 'inlineButtonTypeCopy':
      return {...common, action: 'copy', copyText: type.copy_text};
    case 'inlineButtonTypeUserProfile':
      return {...common, action: 'userProfile', userId: Number(type.user_id) as UserId};
    case 'inputInlineButtonTypeUserProfile':
      return type.user_id._ === 'inputUser' ?
        {...common, action: 'userProfile', userId: Number(type.user_id.user_id) as UserId} :
        undefined;
    case 'inlineButtonTypeDisabled':
      return {...common, action: 'disabled'};
    default:
      return;
  }
}

/** The profile button goes by user id; the manager adds the user to the message's `users`. */
export function richButtonInlineType(button: Omit<ChatInputRichButton, 'text'>): InlineButtonType | undefined {
  switch(button.action) {
    case 'url':
      return button.url ? {_: 'inlineButtonTypeUrl', url: button.url} : undefined;
    case 'copy':
      return button.copyText ? {_: 'inlineButtonTypeCopy', copy_text: button.copyText} : undefined;
    case 'userProfile':
      return button.userId ? {_: 'inlineButtonTypeUserProfile', user_id: button.userId} : undefined;
    case 'disabled':
      return {_: 'inlineButtonTypeDisabled'};
  }
}

export function richButtonStyle(button: Omit<ChatInputRichButton, 'text'>): RichButtonStyle | undefined {
  if(!button.color && !button.link) return;
  return {
    _: 'richButtonStyle',
    pFlags: {
      bg_primary: button.color === 'primary' || undefined,
      bg_success: button.color === 'success' || undefined,
      bg_danger: button.color === 'danger' || undefined,
      link: button.link || undefined
    }
  };
}
