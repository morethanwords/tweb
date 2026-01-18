import wrapPhoto from '@components/wrappers/photo';
import {MediaComponentProps, MediaTsx} from '@components/wrappers/mediaTsx';

export default function PhotoTsx(props: Parameters<typeof wrapPhoto>[0] & {
  onResult?: (result: Awaited<ReturnType<typeof wrapPhoto>>) => void;
} & MediaComponentProps) {
  return (
    <MediaTsx
      {...props}
      itemKey="photo"
      loader={wrapPhoto}
    />
  );
}
