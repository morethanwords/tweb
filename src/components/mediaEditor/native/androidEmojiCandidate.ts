import type {Document, StickerPack} from '@layer';
import {makeMediaSize} from '@helpers/mediaSize';
import {androidPaintingSize, androidPaintingToSource} from '@components/mediaEditor/native/androidPaintAdapter';
import {androidGifFrame} from '@components/mediaEditor/native/androidGifSize';
import type {NumberPair} from '@components/mediaEditor/types';

export type AndroidEmojiSelection = {kind: 'unicode'; unicode: string} | {kind: 'document'; id: string | number};
type EmojiCandidateDocument = {
  id: string | number;
  status: 'document';
  document: Document.document;
  nativeTint: 'white-src-in' | 'none';
} | {
  id: string | number;
  status: 'unsupported';
  reason: 'missing-document' | 'not-emoji-document';
};

/** StaticEmoji is supplied by the caller. No fetch, normalization, preferred ID,
 * variation-selector rewriting or plain-text fallback is performed here. */
export function mapAndroidEmojiSelection(packs: readonly StickerPack[], documents: readonly Document[], selection: AndroidEmojiSelection) {
  const ids: (string | number)[] = [];
  const seen = new Set<string>();
  const add = (id: string | number) => {
    const key = String(id);
    if(!seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  };
  if(selection.kind === 'document') add(selection.id);
  else for(const pack of packs) {
    if(pack.emoticon === selection.unicode) pack.documents.forEach(add);
  }
  const byId = new Map(documents.map(doc => [String(doc.id), doc]));
  const candidates: EmojiCandidateDocument[] = ids.map(id => {
    const doc = byId.get(String(id));
    if(!doc || doc._ !== 'document') return {id, status: 'unsupported', reason: 'missing-document'};
    const emoji = doc.attributes?.find(attribute => attribute._ === 'documentAttributeCustomEmoji');
    // A normalized `sticker` flag, MIME or alt text alone is not proof that
    // this is an Emoji document (ordinary stickers and GIFs are not accepted).
    if(!emoji) return {id, status: 'unsupported', reason: 'not-emoji-document'};
    return {id, status: 'document', document: doc, nativeTint: emoji.pFlags?.text_color ? 'white-src-in' : 'none'};
  });
  if(!ids.length) return {status: 'unsupported' as const, reason: 'missing-mapping' as const, candidates};
  // Even one resolved document among several missing ones is still ambiguous.
  return {status: ids.length > 1 ? 'choices' as const : candidates[0].status, candidates};
}

/** Explicit native crop state, NOT the Web editor's crop state. null means
 * verified absence; undefined/other profiles must never imply no crop. */
export type AndroidEmojiCrop = {
  profile: 'android-crop-v1';
  cropScale: number;
  cropPx: number;
  cropPy: number;
  transformRotation: number;
  cropRotate: number;
};

export type AndroidEmojiCreationCandidate = {
  version: 'android-ordinary-emoji-candidate-v1';
  painting: {
    size: NumberPair;
    center: NumberPair;
    baseSize: {width: number; height: number};
    scale: number;
    angleDegrees: number;
  };
  source: {
    center: NumberPair;
    /** Full scaled, rotated square edges, not an orthogonal scalar frame. */
    basisX: NumberPair;
    basisY: NumberPair;
  };
};

/** Creation-only proposal. No layer schema, migration, insertion or renderer.
 * Same low-tier WEB painting policy as androidGifFrame; Emoji never uses the
 * GIF callback's absolute 1.5 scale. Native reference: 21f7d109, 2887–2928. */
export function planAndroidEmojiCreation(source: readonly [number, number], crop: AndroidEmojiCrop | null):
  {status: 'candidate'; candidate: AndroidEmojiCreationCandidate} | {status: 'unsupported'; reason: string} {
  const unsupported = (reason: string) => ({status: 'unsupported' as const, reason});
  const f = Math.fround;
  if(crop !== null && (!crop || crop.profile !== 'android-crop-v1' ||
    ![crop.cropScale, crop.cropPx, crop.cropPy, crop.transformRotation, crop.cropRotate].every(n => Number.isFinite(n) && Number.isFinite(f(n))) ||
    f(crop.cropScale) <= 0 || !Number.isInteger(crop.transformRotation) || crop.transformRotation % 90 !== 0)) {
    return unsupported('unknown-or-invalid-crop');
  }
  let painting: NumberPair;
  try {
    painting = androidPaintingSize(source);
  } catch{
    return unsupported('unsupported-source-frame');
  }
  // Native Size.width is a float; multiplication by 0.5 is double, then floor.
  const baseSize = makeMediaSize(Math.floor(painting[0] * .5));
  if(baseSize.width < 1) return unsupported('unsupported-source-frame');
  const angleDegrees = crop ? -f(f(crop.transformRotation) + f(crop.cropRotate)) : 0;
  const scale = crop ? f(.75 / f(crop.cropScale)) : .75;
  const center: NumberPair = [f(painting[0] / 2), f(painting[1] / 2)];
  if(crop) {
    // Math.toRadians is double, narrowed before Math.sin/cos. Offsets are
    // double trig expressions narrowed BEFORE the float multiply/subtract.
    const radians = f(angleDegrees * (Math.PI / 180));
    const px = f(f(crop.cropPx) * Math.cos(radians) - f(crop.cropPy) * Math.sin(radians));
    const py = f(f(crop.cropPx) * Math.sin(radians) + f(crop.cropPy) * Math.cos(radians));
    center[0] = f(center[0] - f(px * painting[0]));
    center[1] = f(center[1] - f(py * painting[1]));
  }
  const side = f(baseSize.width * scale);
  if(![...center, angleDegrees, side].every(Number.isFinite) || side <= 0) return unsupported('unsupported-source-frame');
  const radians = angleDegrees * (Math.PI / 180);
  // Reuse the existing GIF edge-aligned per-axis size policy without changing
  // its active bridge. Undo that callback's absolute 1.5 and apply OUR float
  // scaled side. Rotation is in painting space, before the unequal axis map.
  const gifSize = androidGifFrame([source[0], source[1]]).size;
  const relativeSide = side / (baseSize.width * 1.5);
  const axisX = gifSize[0] * relativeSide, axisY = gifSize[1] * relativeSide;
  return {status: 'candidate', candidate: {
    version: 'android-ordinary-emoji-candidate-v1',
    painting: {size: painting, center, baseSize, scale, angleDegrees},
    source: {
      center: androidPaintingToSource(center, source, painting),
      basisX: [axisX * Math.cos(radians), axisY * Math.sin(radians)],
      basisY: [-axisX * Math.sin(radians), axisY * Math.cos(radians)]
    }
  }};
}
