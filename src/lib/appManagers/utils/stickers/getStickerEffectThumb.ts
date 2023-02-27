import {MyDocument} from '../../appDocsManager';
import {VideoSize} from '../../../../layer';

export default function getStickerEffectThumb(doc: MyDocument) {
  return doc.video_thumbs?.[0] as Extract<VideoSize, VideoSize.videoSize>;
}
