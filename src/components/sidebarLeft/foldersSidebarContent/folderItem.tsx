import {createEffect, onMount, Show} from 'solid-js';

import createBadge from '../../../helpers/createBadge';
import setBadgeContent from '../../../helpers/setBadgeContent';

import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';

import {FolderItemPayload} from './types';

type FolderItemProps = FolderItemPayload & {
  ref?: (el: HTMLDivElement | null) => void;
  class?: string;
  selected?: boolean;
  onClick?: () => void;
};

export default function FolderItem(props: FolderItemProps) {
  let container: HTMLDivElement;

  onMount(() => {
    ripple(container);
  });

  const hasNotifications = () => !!props.notifications;

  const badge = createBadge('div', 18, 'primary');

  if(hasNotifications())
    setBadgeContent(badge, props.notifications?.toString());

  createEffect(() => {
    if(!hasNotifications()) return;

    setBadgeContent(badge, props.notifications?.toString());
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
      onClick={props.onClick}
      {...(props.id !== undefined ?
        {'data-filter-id': props.id} :
        {}
      )}
    >
      <IconTsx icon={props.icon} />
      <Show when={props.name}>
        <div class="folders-sidebar__folder-item-name">{props.name}</div>
      </Show>
      <Show when={hasNotifications()}>
        {badge}
      </Show>
    </div>
  );
}
