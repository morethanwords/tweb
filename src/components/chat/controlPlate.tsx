import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';

/**
 * Marker class for the unified chat-input plate layout. Anything carrying this
 * class is one of the new uniform-width footer plates (as opposed to the bare
 * single buttons the control container used to hold).
 */
export const CHAT_INPUT_PLATE_CLASS = 'chat-input-plate';

/**
 * Unified chat-input control plate.
 *
 * Every non-typing state of the chat-input footer — join channel, unblock,
 * bot start, pinned, message selection, … — renders through this single
 * layout instead of the bespoke per-state markup that used to live in the
 * control container and the selection wrapper.
 *
 * The layout mirrors the topbar translation plate (`translation.tsx`): an
 * optional icon button on each side and a centered main button —
 * `Button.Icon + Button + Button.Icon`. The side slots reserve symmetric
 * space even when empty so the centre button always stays centred, which
 * makes every plate exactly the same width as the message-input row. Plates
 * therefore cross-fade in place (opacity only) instead of morphing width.
 */
export default function ChatInputPlate(props: {
  class?: string,
  /** Optional leading icon button (`Button.Icon`). */
  left?: JSX.Element,
  /** Main centered button (`Button`). */
  center: JSX.Element,
  /** Optional trailing icon button (`Button.Icon`). */
  right?: JSX.Element
}): JSX.Element {
  return (
    <div class={classNames(CHAT_INPUT_PLATE_CLASS, 'rows-wrapper-row', props.class)}>
      <div class={`${CHAT_INPUT_PLATE_CLASS}-side`}>{props.left}</div>
      <div class={`${CHAT_INPUT_PLATE_CLASS}-center`}>{props.center}</div>
      <div class={`${CHAT_INPUT_PLATE_CLASS}-side`}>{props.right}</div>
    </div>
  );
}
