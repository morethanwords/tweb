import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {formatListItemMarker} from '@lib/richTextProcessor/orderedList';

export function* orderedListItemValues(list: ProseMirrorNode) {
  const reversed = !!list.attrs.reversed;
  let value = Number.isInteger(list.attrs.start) ?
    list.attrs.start : reversed ? list.childCount : 1;
  for(let current = 0; current < list.childCount; ++current) {
    const explicit = list.child(current).attrs.value;
    if(Number.isInteger(explicit)) value = explicit;
    yield value;
    value += reversed ? -1 : 1;
  }
}

export function effectiveOrderedListItemValue(list: ProseMirrorNode, index: number) {
  for(const value of orderedListItemValues(list)) {
    if(index-- === 0) return value;
  }
}

/** Each item's marker of a list node, as the list's plain text writes it. */
export function listItemMarkers(list: ProseMirrorNode) {
  const ordered = list.type.name === 'orderedList';
  const values = ordered ? [...orderedListItemValues(list)] : [];
  const markers: string[] = [];
  list.forEach((item, _offset, index) => markers.push(formatListItemMarker({
    ordered,
    value: values[index],
    type: item.attrs.type || list.attrs.type,
    checkbox: list.type.name === 'taskList' || item.attrs.checkbox,
    checked: item.attrs.checked
  })));
  return markers;
}
