import type {MarkupTooltipTypes} from '@components/chat/markupTooltip';

export type InputFormattingTypes = 'all' | ReadonlySet<MarkupTooltipTypes>;

const NO_FORMATTING: ReadonlySet<MarkupTooltipTypes> = new Set();

/**
 * The formatting a field declares: the types its `can-format` lists, or every type
 * for a message field (`.input-message-input` — the chat input, a media caption, a
 * forward comment) that lists none. Any other field — a folder name, a poll option,
 * a contact note — declares none, and carries none: the tooltip offers it nothing,
 * and the composer's engine builds it a schema without it.
 */
export default function getInputFormattingTypes(input: Element): InputFormattingTypes {
  const canFormat = input.getAttribute('can-format');
  if(canFormat === null) {
    return input.classList.contains('input-message-input') ? 'all' : NO_FORMATTING;
  }

  return new Set(canFormat.split(',').map((type) => type.trim()).filter(Boolean) as MarkupTooltipTypes[]);
}
