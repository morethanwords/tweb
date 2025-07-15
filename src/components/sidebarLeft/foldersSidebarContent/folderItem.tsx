import {createMemo, onMount, Show} from 'solid-js';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import Badge from '../../badge';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';
import wrapFolderTitle from '../../wrappers/folderTitle';
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

  const title = createMemo(() => {
    if(props.name) return props.name;
    if(!props.title) return;

    const middleware = createMiddleware().get();

    const span = document.createElement('span');
    const fragment = wrapFolderTitle(props.title, middleware, true);

    span.append(fragment);

    return span;
  });

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
      <Show when={title()}>
        <div class="folders-sidebar__folder-item-name">{title()}</div>
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
