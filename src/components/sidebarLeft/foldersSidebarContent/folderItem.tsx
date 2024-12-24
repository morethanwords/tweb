import {createEffect, onCleanup, onMount, Show} from 'solid-js';

import createBadge from '../../../helpers/createBadge';
import setBadgeContent from '../../../helpers/setBadgeContent';

import {IconTsx} from '../../iconTsx';

import {FolderItemPayload} from './types';

type FolderItemProps = FolderItemPayload & {
  ref?: (el: HTMLDivElement | null) => void;
  class?: string;
  selected?: boolean;
  onClick?: () => void;
  onCleanup?: () => void;
};

export default function FolderItem(props: FolderItemProps) {
  let container: HTMLDivElement;
  let content: HTMLDivElement;
  let showAddFoldersButton: HTMLDivElement;

  onCleanup(() => {
    props.onCleanup?.();
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
      {...(props.id !== undefined ?
        {'data-filter-id': props.id} :
        {}
      )}
    >
      <div ref={content} class="folders-sidebar__folder-item-content" onClick={props.onClick}>
        <IconTsx icon={props.icon} />
        <Show when={props.name}>
          <div class="folders-sidebar__folder-item-name">{props.name}</div>
        </Show>
        <Show when={hasNotifications()}>
          {badge}
        </Show>
      </div>
    </div>
  );
}

// const invertedCornerSvg = (cls: string) => (
//   <svg class={cls} width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
//     <path d="M0 0V8H8C3 8 0 5 0 0Z" fill="#212121"/>
//   </svg>
// );
