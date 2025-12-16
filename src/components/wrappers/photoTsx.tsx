import {Ref} from 'solid-js';
import wrapPhoto from './photo';
import {MediaTsx} from './mediaTsx';

export default function PhotoTsx(props: Parameters<typeof wrapPhoto>[0] & {
  class?: string;
  ref?: Ref<HTMLElement>;
  onResult?: (result: Awaited<ReturnType<typeof wrapPhoto>>) => void;
}) {
  return (
    <MediaTsx
      {...props}
      itemKey="photo"
      loader={wrapPhoto}
    />
  );
}
