import {onMount, Show} from 'solid-js';

import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';
import Badge from '../../badge';

import {FolderItemPayload} from './types';

type FolderItemProps = FolderItemPayload & {
  ref?: (el: HTMLDivElement | null) => void,
  class?: string,
  selected?: boolean,
  onClick?: () => void
};

export default function FolderItem(props: FolderItemProps) {
  let container: HTMLDivElement;

  onMount(() => {
    ripple(container);
  });

  const hasNotifications = () => !!props.notifications?.count;
  return (
    <div
      ref={(el) => {
        container = el;
        props.ref?.(el);
      }}
      class="folders-sidebar__folder-item"
      classList={{
        [props.class]: !!props.class,
        'folders-sidebar__folder-item--selected': props.selected
      }}
      {...(props.id !== undefined ?
        {'data-filter-id': props.id} :
        {}
      )}
      onClick={props.onClick}
    >
      <IconTsx icon={props.icon} class="folders-sidebar__folder-item-icon" />
      <Show when={props.name}>
        <div class="folders-sidebar__folder-item-name">{props.name}</div>
      </Show>
      <Show when={hasNotifications()}>
        <Badge
          class="folders-sidebar__folder-item-badge"
          tag="div"
          color={props.notifications.muted && !props.selected ? 'gray' : 'primary'}
          size={18}
        >
          {'' + props.notifications.count}
        </Badge>
      </Show>
    </div>
  );
}
