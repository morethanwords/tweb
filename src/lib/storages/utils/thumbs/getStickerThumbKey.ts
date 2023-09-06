export default function getStickerThumbKey(docId: DocId, toneIndex?: number | string) {
  return docId + (toneIndex !== undefined ? '-' + toneIndex : '');
}
