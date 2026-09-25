import type {Node as ProseMirrorNode, NodeType} from '@tiptap/pm/model';
import {NodeSelection, Selection, TextSelection} from '@tiptap/pm/state';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import type {Document, PageBlock, Photo} from '@layer';
import type {ChatInputRichMediaLayout, ChatInputRichMediaUploadItem} from '@components/chat/inputEditor/types';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

export function withoutRichMediaUpload<T extends Record<string, unknown>>(attrs: T) {
  return {
    ...attrs,
    uploadAction: '',
    uploadActiveIndex: -1,
    uploadGrouped: false,
    uploadId: '',
    uploadItems: [] as ChatInputRichMediaUploadItem[],
    uploadPreviewUrls: [] as string[]
  };
}

export function preserveRichMediaSelection(
  transaction: Transaction,
  selection: Selection,
  from: number,
  to: number
) {
  if(selection instanceof NodeSelection && selection.from === from && selection.node.type.name === 'richMedia') {
    transaction.setSelection(NodeSelection.create(transaction.doc, from));
  } else if(selection instanceof TextSelection) {
    // The first replacement keeps the original caption. Map each endpoint
    // separately so a selection spanning this caption and another block survives.
    const map = (position: number) => position > from && position < to ?
      position : transaction.mapping.map(position, 1);
    transaction.setSelection(TextSelection.create(
      transaction.doc,
      map(selection.anchor),
      map(selection.head)
    ));
  }
  return transaction;
}

type VisualRichMediaBlock =
  PageBlock.pageBlockPhoto |
  PageBlock.pageBlockVideo;

type GroupedRichMediaBlock =
  PageBlock.pageBlockCollage |
  PageBlock.pageBlockSlideshow;

function emptyRichText() {
  return {_: 'textEmpty' as const};
}

function emptyPageCaption() {
  return {
    _: 'pageCaption' as const,
    text: emptyRichText(),
    credit: emptyRichText()
  };
}

function visualRichMediaBlock(block: unknown): block is VisualRichMediaBlock {
  return (
    !!block &&
    typeof(block) === 'object' &&
    (
      (block as PageBlock)._ === 'pageBlockPhoto' ||
      (block as PageBlock)._ === 'pageBlockVideo'
    )
  );
}

function groupedRichMediaBlock(block: unknown): block is GroupedRichMediaBlock {
  return (
    !!block &&
    typeof(block) === 'object' &&
    (
      (block as PageBlock)._ === 'pageBlockCollage' ||
      (block as PageBlock)._ === 'pageBlockSlideshow'
    )
  );
}

function hasCaptionOrCredit(node: ProseMirrorNode) {
  const credit = node.attrs.captionCredit as {_?: string} | undefined;
  return node.content.size > 0 || !!credit && credit._ !== 'textEmpty';
}

export function handleEmptyParagraphBackspaceAfterRichMedia(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    selection.$from.parent.type.name !== 'paragraph' ||
    selection.$from.parentOffset !== 0 ||
    selection.$from.parent.content.size
  ) return false;

  const depth = selection.$from.depth;
  if(depth < 1) return false;
  const parent = selection.$from.node(depth - 1);
  const index = selection.$from.index(depth - 1);
  const media = index > 0 ? parent.child(index - 1) : undefined;
  if(media?.type.name !== 'richMedia') return false;

  const paragraphPosition = selection.$from.before(depth);
  const mediaPosition = paragraphPosition - media.nodeSize;
  if(dispatch) {
    const transaction = state.tr;
    // Only the final top-level paragraph is the technical typing placeholder.
    // Remove an authored empty paragraph and move into the editable caption.
    if(depth !== 1 || index !== parent.childCount - 1) {
      transaction.delete(paragraphPosition, paragraphPosition + selection.$from.parent.nodeSize);
    }
    dispatch(transaction.setSelection(TextSelection.create(
      transaction.doc,
      mediaPosition + 1 + media.content.size
    )).scrollIntoView());
  }
  return true;
}

function withoutCaption(block: VisualRichMediaBlock): VisualRichMediaBlock {
  return {...block, caption: emptyPageCaption()};
}

function uniqueResources<T extends {_: string, id: Long}>(resources: T[]) {
  const ids = new Set<string>();
  return resources.filter((resource) => {
    const id = `${resource._}:${String(resource.id)}`;
    if(ids.has(id)) return false;
    ids.add(id);
    return true;
  });
}

export function handleRichMediaCaptionBackspace(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    selection.$from.parent.type.name !== 'richMedia' ||
    selection.$from.parentOffset !== 0
  ) return false;

  const position = selection.$from.before();
  if(selection.$from.parent.content.size) {
    if(dispatch) dispatch(state.tr.setSelection(NodeSelection.create(
      state.doc,
      position
    )));
    return true;
  }
  const transaction = state.tr.delete(
    position,
    position + selection.$from.parent.nodeSize
  );
  const target = Math.min(position, transaction.doc.content.size);
  transaction.setSelection(Selection.near(
    transaction.doc.resolve(target),
    -1
  ));
  if(dispatch) dispatch(transaction.scrollIntoView());
  return true;
}

export function richMediaSiblingInsertionPosition(state: EditorState) {
  const {selection} = state;
  if(selection instanceof NodeSelection && selection.node.type.name === 'richMedia') {
    return selection.to;
  }

  const {$from, $to} = selection;
  for(let depth = $from.depth; depth > 0; --depth) {
    const node = $from.node(depth);
    if(node.type.name !== 'richMedia') continue;
    const position = $from.before(depth);
    const end = position + node.nodeSize;
    return $to.pos <= end ? end : undefined;
  }
}

function resourcesForBlock(
  block: PageBlock,
  photos: Photo.photo[],
  documents: Document.document[]
) {
  switch(block._) {
    case 'pageBlockPhoto':
      return {
        documents: [] as Document.document[],
        photos: photos.filter((photo) => String(photo.id) === String(block.photo_id))
      };
    case 'pageBlockVideo':
      return {
        documents: documents.filter((document) => (
          String(document.id) === String(block.video_id)
        )),
        photos: [] as Photo.photo[]
      };
    case 'pageBlockAudio':
      return {
        documents: documents.filter((document) => (
          String(document.id) === String(block.audio_id)
        )),
        photos: [] as Photo.photo[]
      };
    default:
      return {
        documents: [] as Document.document[],
        photos: [] as Photo.photo[]
      };
  }
}

export function getRichMediaPreviewUrls(
  node: ProseMirrorNode,
  itemCount: number
) {
  const previewUrls = Array.isArray(node.attrs.previewUrls) ?
    [...node.attrs.previewUrls] as string[] :
    [];
  if(!previewUrls[0] && node.attrs.previewUrl) {
    previewUrls[0] = `${node.attrs.previewUrl}`;
  }
  while(previewUrls.length < itemCount) previewUrls.push('');
  return previewUrls.slice(0, itemCount);
}

export function groupRichMediaNodes(
  richMediaType: NodeType,
  nodes: ProseMirrorNode[],
  layout: ChatInputRichMediaLayout
) {
  if(nodes.length < 2 || nodes.some((node) => node.type !== richMediaType)) return;
  if(layout === 'collage' && nodes.length > MESSAGES_ALBUM_MAX_SIZE) return;
  const blocks = nodes.map((node) => node.attrs.block);
  if(!blocks.every(visualRichMediaBlock)) return;

  const first = nodes[0];
  const captionSources = nodes.filter(hasCaptionOrCredit);
  if(captionSources.length > 1) return;
  const captionSource = captionSources[0] || first;
  const block = {
    _: layout === 'slideshow' ? 'pageBlockSlideshow' : 'pageBlockCollage',
    items: blocks.map(withoutCaption),
    caption: emptyPageCaption()
  } as GroupedRichMediaBlock;
  const previewUrls = nodes.flatMap((node) => getRichMediaPreviewUrls(node, 1));
  return richMediaType.create({
    ...first.attrs,
    block,
    captionCredit: captionSource.attrs.captionCredit,
    documents: uniqueResources(nodes.flatMap((node) => (
      node.attrs.documents as Document.document[] || []
    ))),
    photos: uniqueResources(nodes.flatMap((node) => (
      node.attrs.photos as Photo.photo[] || []
    ))),
    previewUrl: previewUrls[0] || '',
    previewUrls
  }, captionSource.content);
}

export function ungroupRichMediaNode(
  richMediaType: NodeType,
  node: ProseMirrorNode
) {
  const block = node.attrs.block;
  if(node.type !== richMediaType || !groupedRichMediaBlock(block)) return;
  const photos = node.attrs.photos as Photo.photo[] || [];
  const documents = node.attrs.documents as Document.document[] || [];
  const previewUrls = getRichMediaPreviewUrls(node, block.items.length);

  return block.items.map((item, index) => {
    const resources = resourcesForBlock(item, photos, documents);
    return richMediaType.create({
      ...node.attrs,
      block: item,
      captionCredit: index === 0 ? node.attrs.captionCredit : emptyRichText(),
      documents: resources.documents,
      photos: resources.photos,
      previewUrl: previewUrls[index] || '',
      previewUrls: [previewUrls[index] || '']
    }, index === 0 ? node.content : undefined);
  });
}
