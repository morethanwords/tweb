import {getOrderedListTypePresentation} from '@lib/richTextProcessor/orderedList';

export function orderedListTypeStyle(type: unknown) {
  const presentation = getOrderedListTypePresentation(type);
  return presentation ? `list-style-type: ${presentation.style}; --iv-list-style: ${presentation.style}` : '';
}

export function orderedListCounterStyle(start: number, reversed = false, type?: unknown) {
  const step = reversed ? -1 : 1;
  return `counter-reset: iv-list-item ${start - step}; --iv-list-step: ${step}; ${orderedListTypeStyle(type)}`;
}

export function orderedListItemStyle(value?: number, type?: unknown) {
  return [Number.isInteger(value) ? `--iv-list-value: ${value}` : '', orderedListTypeStyle(type)].filter(Boolean).join('; ');
}
