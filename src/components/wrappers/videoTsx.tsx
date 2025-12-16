import wrapVideo from './video';
import {Ref} from 'solid-js';
import {MediaTsx} from './mediaTsx';

type VideoProps = Omit<Parameters<typeof wrapVideo>[0], 'middleware'>;

export default function VideoTsx(props: VideoProps & {
  class?: string
  ref?: Ref<HTMLElement>,
  onResult?: (result: Awaited<ReturnType<typeof wrapVideo>>) => void
}) {
  return (
    <MediaTsx<VideoProps, Awaited<ReturnType<typeof wrapVideo>>>
      {...props}
      itemKey="doc"
      loader={wrapVideo}
    />
  );
}
