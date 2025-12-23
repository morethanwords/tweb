import wrapVideo from './video';
import {MediaComponentProps, MediaTsx} from './mediaTsx';

type VideoProps = Omit<Parameters<typeof wrapVideo>[0], 'middleware'>;

export default function VideoTsx(props: VideoProps & {
  onResult?: (result: Awaited<ReturnType<typeof wrapVideo>>) => void
} & MediaComponentProps) {
  return (
    <MediaTsx<VideoProps, Awaited<ReturnType<typeof wrapVideo>>>
      {...props}
      itemKey="doc"
      loader={wrapVideo}
    />
  );
}
