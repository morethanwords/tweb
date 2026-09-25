import type {JSONContent} from '@tiptap/core';
import {Fragment, Slice, type Node as ProseMirrorNode, type Schema} from '@tiptap/pm/model';
import type {Selection} from '@tiptap/pm/state';
import {tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';
import {effectiveOrderedListItemValue} from '@components/chat/inputEditor/orderedList';

export function withCopiedOrderedListStarts(slice: Slice, selection: Selection) {
  const adjust = (node: ProseMirrorNode, depth: number): ProseMirrorNode => {
    if(depth > slice.openStart || depth > selection.$from.depth) return node;
    const source = selection.$from.node(depth);
    if(source.type !== node.type) return node;
    const content = node.firstChild ? node.content.replaceChild(0, adjust(node.firstChild, depth + 1)) : node.content;
    const attrs = node.type.name === 'orderedList' ? {
      ...node.attrs,
      start: effectiveOrderedListItemValue(source, selection.$from.index(depth)),
      startExplicit: true
    } : node.attrs;
    return node.type.create(attrs, content, node.marks);
  };
  if(!slice.openStart || !slice.content.firstChild) return slice;
  return new Slice(slice.content.replaceChild(0, adjust(slice.content.firstChild, 1)), slice.openStart, slice.openEnd);
}

function paragraphsFromContent(content: JSONContent[], schema: Schema): JSONContent[] {
  return content.flatMap((node) => schema.nodes[node.type]?.isTextblock ? [{
    type: 'paragraph', content: node.content
  }] : paragraphsFromContent(node.content || [], schema));
}

function selectedNodeContent(node: ProseMirrorNode, openStart: number, openEnd: number): JSONContent[] {
  if(!openStart && !openEnd) return [node.toJSON()];
  const json = node.toJSON() as JSONContent;
  if(node.isTextblock) {
    if(node.type.name === 'richMedia' || node.type.name === 'richMap') {
      if(openStart) return [{type: 'paragraph', content: json.content}];
    }
    return [json];
  }

  const content: JSONContent[] = [];
  node.forEach((child, _offset, index) => {
    content.push(...selectedNodeContent(
      child,
      index === 0 ? Math.max(0, openStart - 1) : 0,
      index === node.childCount - 1 ? Math.max(0, openEnd - 1) : 0
    ));
  });
  const selected = {...json, content};
  // A partial author/title without its required body cannot stand alone as
  // a quote/details/table. Keep its selected text instead of dropping it.
  if(node.type.isInGroup('block') && !tiptapToRichMessage({type: 'doc', content: [selected]}).input.blocks.length) {
    return paragraphsFromContent(content, node.type.schema);
  }
  return [selected];
}

export function selectedRichContent(slice: Slice) {
  const content: JSONContent[] = [];
  slice.content.forEach((node, _offset, index) => {
    content.push(...selectedNodeContent(
      node,
      index === 0 ? slice.openStart : 0,
      index === slice.content.childCount - 1 ? slice.openEnd : 0
    ));
  });
  return content;
}

function isBoundaryFiller(node: ProseMirrorNode, parent: ProseMirrorNode) {
  return node.isTextblock && !node.content.size && (
    ['blockquoteCaption', 'pullquoteCaption', 'detailsSummary', 'chatTableTitle'].includes(node.type.name) ||
    node.type.name === 'paragraph' && ['listItem', 'taskItem'].includes(parent.type.name)
  );
}

function alignOpenBoundary(node: ProseMirrorNode, original: ProseMirrorNode, depth: number, end: boolean): ProseMirrorNode {
  // A selected subset of a mixed bullet list can contain only checkboxes.
  // The wire format decodes that subset as taskList; keep its flags while
  // fitting it back into the original mixed list.
  if(depth && node.type.name === 'taskList' && original?.type.name === 'bulletList') {
    const items: ProseMirrorNode[] = [];
    node.forEach((item) => items.push(original.type.schema.nodes.listItem.create(
      {...item.attrs, checkbox: true}, item.content, item.marks
    )));
    node = original.type.create(node.attrs, items, node.marks);
  }
  if(depth < 2 || node.type !== original?.type || !node.childCount) return node;
  const content: ProseMirrorNode[] = [];
  node.forEach((child) => content.push(child));
  const originalChild = end ? original.lastChild : original.firstChild;
  const edge = () => end ? content.length - 1 : 0;
  while(content.length && content[edge()].type !== originalChild?.type && isBoundaryFiller(content[edge()], node)) {
    content.splice(edge(), 1);
  }
  if(content.length && originalChild) {
    content[edge()] = alignOpenBoundary(content[edge()], originalChild, depth - 1, end);
  }
  return node.copy(Fragment.from(content));
}

function compatibleOpenDepth(node: ProseMirrorNode, original: ProseMirrorNode, limit: number, end: boolean) {
  let depth = 0;
  while(depth < limit && node && original && node.type === original.type && !node.isLeaf) {
    ++depth;
    node = end ? node.lastChild : node.firstChild;
    original = end ? original.lastChild : original.firstChild;
  }
  return depth;
}

function wrapOpenParagraph(node: ProseMirrorNode, original: ProseMirrorNode, depth: number, end: boolean): ProseMirrorNode {
  if(!original || !depth) return node;
  if(depth === 1 || original.isTextblock) return original.copy(node.content);
  const child = end ? original.lastChild : original.firstChild;
  return original.copy(Fragment.from(wrapOpenParagraph(node, child, depth - 1, end)));
}

export function richReplacementSlice(content: Fragment, selection: Selection) {
  const original = selection.content();
  const nodes: ProseMirrorNode[] = [];
  content.forEach((node) => nodes.push(node));
  if(!nodes.length) return Slice.empty;
  const last = nodes.length - 1;
  if(original.openStart && nodes[0].type.name === 'paragraph' && selection.$from.parent.isTextblock) {
    nodes[0] = wrapOpenParagraph(nodes[0], original.content.firstChild, original.openStart, false);
  }
  if(original.openEnd && nodes[last].type.name === 'paragraph' && selection.$to.parent.isTextblock) {
    nodes[last] = wrapOpenParagraph(nodes[last], original.content.lastChild, original.openEnd, true);
  }
  nodes[0] = alignOpenBoundary(nodes[0], original.content.firstChild, original.openStart, false);
  nodes[last] = alignOpenBoundary(nodes[last], original.content.lastChild, original.openEnd, true);
  const fragment = Fragment.from(nodes);
  const maximum = Slice.maxOpen(fragment);
  const startLimit = Math.min(original.openStart, maximum.openStart);
  const endLimit = Math.min(original.openEnd, maximum.openEnd);
  const openStart = startLimit && nodes[0].type.name === 'paragraph' && selection.$from.parent.isTextblock ? 1 :
    compatibleOpenDepth(nodes[0], original.content.firstChild, startLimit, false);
  const openEnd = endLimit && nodes[last].type.name === 'paragraph' && selection.$to.parent.isTextblock ? 1 :
    compatibleOpenDepth(nodes[last], original.content.lastChild, endLimit, true);
  return new Slice(fragment, openStart, openEnd);
}
