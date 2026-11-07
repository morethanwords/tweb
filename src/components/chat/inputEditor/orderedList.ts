import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {formatListItemMarker, orderedListValues} from '@lib/richTextProcessor/orderedList';

type OrderedListValueSource = Pick<ProseMirrorNode, 'attrs' | 'childCount'> & {
  child(index: number): Pick<ProseMirrorNode, 'attrs'>
};

export function orderedListItemValues(list: OrderedListValueSource) {
  return orderedListValues(list.childCount, list.attrs.start, !!list.attrs.reversed, (index) => list.child(index).attrs.value);
}

export function effectiveOrderedListItemValue(list: OrderedListValueSource, index: number) {
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
