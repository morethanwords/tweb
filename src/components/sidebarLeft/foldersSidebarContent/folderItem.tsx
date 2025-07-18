import {createComputed, createEffect, createMemo, createSignal, Show} from 'solid-js';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {CustomEmojiRendererElement} from '../../../lib/customEmoji/renderer';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import Badge from '../../badge';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';
import wrapFolderTitle from '../../wrappers/folderTitle';
import FolderAnimatedIcon from './folderAnimatedIcon';
import {FolderItemPayload} from './types';
ripple; // keep


type FolderItemProps = FolderItemPayload & {
  ref?: (el: HTMLDivElement | null) => void,
  class?: string,
  selected?: boolean,
  onClick?: () => void
};

const ICON_SIZE = 30;

export default function FolderItem(props: FolderItemProps) {
  const {rootScope} = useHotReloadGuard();

  const [failedToFetchIconDoc, setFailedToFetchIconDoc] = createSignal(false);

  const hasNotifications = () => !!props.notifications?.count;

  const hasCustomIcon = () => props.iconDocId || props.emojiIcon;
  const showCustomIcon = () => hasCustomIcon() && !failedToFetchIconDoc();

  const title = createMemo(() => {
    if(props.name) return props.name;
    if(!props.title) return;

    const middleware = createMiddleware().get();

    const span = document.createElement('span');
    const fragment = wrapFolderTitle(props.title, middleware, true);

    createEffect(() => {
      const renderer: CustomEmojiRendererElement = span.querySelector('custom-emoji-renderer-element');
      renderer?.setTextColor(props.selected ? 'primary-color' : 'folders-sidebar-item-color')
    });

    span.append(fragment);

    return span;
  });

  createComputed(() => {
    hasCustomIcon() && setFailedToFetchIconDoc(false);
  });

  return (
    <div
      use:ripple
      ref={(el) => {
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
      <Show
        when={showCustomIcon()}
        fallback={<IconTsx icon={props.icon} class="folders-sidebar__folder-item-icon" />}
      >
        <FolderAnimatedIcon
          docId={props.iconDocId}
          emoji={props.emojiIcon}
          color={props.selected ? 'primary-color' : 'folders-sidebar-item-color'}
          managers={rootScope.managers}
          size={ICON_SIZE}
          class="folders-sidebar__folder-item-animated-icon"
          onFail={() => setFailedToFetchIconDoc(true)}
          dontAnimate={props.dontAnimate}
        />
      </Show>
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
