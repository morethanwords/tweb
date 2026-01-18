import type {ThumbCache} from '@lib/storages/thumbs';

export default function generateEmptyThumb(type: string): ThumbCache {
  return {downloaded: 0, url: '', type};
}
