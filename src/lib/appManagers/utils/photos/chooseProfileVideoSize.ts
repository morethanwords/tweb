import type {Photo, VideoSize} from '@layer';

type VS = Extract<VideoSize, VideoSize.videoSize>;

export default function chooseProfileVideoSize(
  photo: Photo.photo,
  want: 'preview' | 'full' = 'preview'
): VS | undefined {
  const sizes = photo.video_sizes?.filter((s): s is VS => s._ === 'videoSize');
  if(!sizes?.length) return undefined;

  if(want === 'preview') {
    return sizes.find((s) => s.type === 'p') ||
      sizes.reduce((min, s) => (s.size < min.size ? s : min), sizes[0]);
  }

  return sizes.find((s) => s.type === 'u') ||
    sizes.reduce((max, s) => (s.size > max.size ? s : max), sizes[0]);
}
