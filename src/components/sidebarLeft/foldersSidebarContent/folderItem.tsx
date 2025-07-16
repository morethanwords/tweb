import {createEffect, createMemo, createSignal, onCleanup, Show} from 'solid-js';
import ListenerSetter from '../../../helpers/listenerSetter';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import Badge from '../../badge';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';
import wrapFolderTitle from '../../wrappers/folderTitle';
import wrapSticker from '../../wrappers/sticker';
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

  const [iconContainer, setIconContainer] = createSignal<HTMLDivElement>();
  const [failedToFetchIconDoc, setFailedToFetchIconDoc] = createSignal(false);

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

  createEffect(() => {
    if(!iconContainer() && !props.iconDocId) return;
    setFailedToFetchIconDoc(false);

    const docId = props.iconDocId;
    const middleware = createMiddleware().get();

    const listenerSetter = new ListenerSetter;

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    (async() => {
      try {
        const doc = await rootScope.managers.appEmojiManager.getCustomEmojiDocument(props.iconDocId);

        if(!doc) {
          setFailedToFetchIconDoc(true);
          return;
        }

        if(!middleware() || !iconContainer() || docId !== props.iconDocId) return;

        wrapSticker({
          doc,
          div: iconContainer(),
          group: 'none',
          width: ICON_SIZE * window.devicePixelRatio,
          height: ICON_SIZE * window.devicePixelRatio,
          play: true,
          loop: true,
          withThumb: false,
          middleware,
          textColor: 'folders-sidebar-item-color'
        });
      } catch{
        setFailedToFetchIconDoc(true);
      }
    })();
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
        when={props.iconDocId && !failedToFetchIconDoc()}
        fallback={<IconTsx icon={props.icon} class="folders-sidebar__folder-item-icon" />}
      >
        <div ref={setIconContainer} class="folders-sidebar__folder-item-animated-icon"></div>
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
