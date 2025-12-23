import wrapPhoto from './photo';
import {MediaComponentProps, MediaTsx} from './mediaTsx';

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
