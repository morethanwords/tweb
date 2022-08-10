import {MyDocument} from '../../appDocsManager';

export default function getStickerEffectThumb(doc: MyDocument) {
  return doc.video_thumbs?.[0];
}
