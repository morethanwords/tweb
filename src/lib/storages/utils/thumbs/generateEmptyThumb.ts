import type {ThumbCache} from '../../thumbs';

export default function generateEmptyThumb(type: string): ThumbCache {
  return {downloaded: 0, url: '', type};
}
