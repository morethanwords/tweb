import type {Node as ProseMirrorNode} from '@tiptap/pm/model';

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
