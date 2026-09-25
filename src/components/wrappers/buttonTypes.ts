import type {
  ButtonType,
  InlineButtonType,
  KeyboardButtonStyle,
  PageBlock,
  PageButton,
  RichButtonStyle,
  RichText
} from '@layer';

/**
 * What a bot keyboard button and a rich message's button have in common before anything is
 * clicked: the icon a type wears, the colours a style asks for. Kept apart from the actions
 * (`keyboardButton.ts`), which pull in half the popups — a page draws its buttons with this alone
 * and loads the actions on the first click. It imports nothing, so the composer's serializer
 * shares it too; the link a link button is lives in `urlButtonAnchor.ts`.
 */
export type AnyButtonType = ButtonType | InlineButtonType;
/** A button laid out inside a rich message or a page (layer 229): its label is rich text. */
export type RichPageButton = PageButton | RichText.textButton;
export type ButtonBackground = 'success' | 'danger' | 'primary';
export type ButtonRowAlign = 'left' | 'center' | 'right';

/**
 * What a page read outside a chat can still do. The rest act on the message the button belongs
 * to, so a page opened in the in-app browser shows them disabled, as desktop and WebA do.
 */
export const CHATLESS_BUTTON_TYPES = new Set<AnyButtonType['_']>([
  'inlineButtonTypeUrl',
  'inlineButtonTypeCopy',
  'inlineButtonTypeUserProfile',
  'inlineButtonTypeDisabled'
]);

const BUTTON_TYPE_ICONS: {[type in AnyButtonType['_']]?: Icon} = {
  inlineButtonTypeUrl: 'arrow_next',
  inlineButtonTypeSwitchInline: 'forward_filled',
  inlineButtonTypeBuy: 'card_filled',
  inlineButtonTypeWebView: 'webview',
  buttonTypeSimpleWebView: 'webview',
  inlineButtonTypeGame: 'play_filled',
  inlineButtonTypeCopy: 'copy'
};

export function getButtonTypeIcon(type: AnyButtonType): Icon | undefined {
  return BUTTON_TYPE_ICONS[type._];
}

/** A keyboard button's style and a rich page button's style carry the same three colours. */
export function getButtonBackground(style?: KeyboardButtonStyle | RichButtonStyle): ButtonBackground | undefined {
  if(!style) return;
  if(style.pFlags.bg_success) return 'success';
  if(style.pFlags.bg_danger) return 'danger';
  if(style.pFlags.bg_primary) return 'primary';
}

/** Where a row of buttons sits on its line; a row without an alignment stretches across it. */
export function getPageButtonRowAlign(block: PageBlock.pageBlockButtonRow): ButtonRowAlign | undefined {
  const {align_left, align_center, align_right} = block.pFlags;
  return align_left ? 'left' : align_center ? 'center' : align_right ? 'right' : undefined;
}
