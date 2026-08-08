import type {Chat} from '@layer';
import CommunityAvatar from '@components/communities/communityAvatar';
import {
  getCommunityPeerSubtitle
} from '@components/communities/communityPeerStatus';
import {AvatarNewTsx} from '@components/avatarNew';
import createContextMenu from '@helpers/dom/createContextMenu';
import type {Middleware} from '@helpers/middleware';
import appDialogsManager, {
  DialogElement,
  DialogElementSize
} from '@lib/appDialogsManager';
import createCommunityDialogElement
from '@components/autonomousDialogList/createCommunityDialogElement';
import {i18n} from '@lib/langPack';
import {useCommunityFulls} from '@stores/communities';
import {usePeer} from '@stores/peers';
import {
  createEffect,
  createRoot,
  createSignal,
  JSX,
  onCleanup,
  Show
} from 'solid-js';
import {insert, render} from 'solid-js/web';
import styles from '@components/communities/communityPeerDialogList.module.scss';
import sharedStyles from '@components/communities/communityShared.module.scss';

export type CommunityPeerDialogContextMenu = Omit<
  Parameters<typeof createContextMenu>[0],
  'findElement' | 'listenTo' | 'listenerSetter'
>;

export type CommunityPeerDialogListProps<T> = {
  items: readonly T[],
  middleware: Middleware,
  getPeerId: (item: T) => PeerId,
  getSubtitle?: (item: T) => JSX.Element,
  getTitleAccessory?: (item: T) => JSX.Element,
  getRight?: (item: T) => JSX.Element,
  isRightInteractive?: (item: T) => boolean,
  getAvatarOverlayPeerId?: (item: T) => PeerId,
  getCommunity?: (item: T) => Chat.community | Chat.communityForbidden,
  onClick?: (item: T, event: MouseEvent) => void,
  getContextMenu?: (item: T) => CommunityPeerDialogContextMenu,
  // hand the rows to the shared dialog context menu (DialogsContextMenu), which reads
  // what it needs off the row — see `getDataset`
  withDialogContextMenu?: boolean,
  getDataset?: (item: T) => Record<string, string>,
  class?: string,
  getClass?: (item: T) => string,
  avatarSize?: DialogElementSize,
  listRef?: (list: HTMLUListElement) => void
};

export type CommunityDialogListProps = {
  communities: ReadonlyArray<Chat.community | Chat.communityForbidden>,
  middleware: Middleware,
  onClick?: (community: Chat.community | Chat.communityForbidden, event: MouseEvent) => void,
  getContextMenu?: (
    community: Chat.community | Chat.communityForbidden
  ) => CommunityPeerDialogContextMenu,
  class?: string
};

type DialogRecord<T> = {
  dialogElement: DialogElement,
  dispose: VoidFunction,
  getItem: () => T,
  setItem: (item: T) => void
};

function getClassTokens(value?: string) {
  return value?.split(/\s+/).filter(Boolean) || [];
}

export default function CommunityPeerDialogList<T>(
  props: CommunityPeerDialogListProps<T>
) {
  const list = appDialogsManager.createChatList();
  const records = new Map<PeerId, DialogRecord<T>>();
  const rightActionRows = new Map<HTMLElement, HTMLElement>();
  let rightResizeObserver: ResizeObserver;
  let listClassTokens: string[] = [];

  const syncRightActionWidth = (right: HTMLElement) => {
    const element = rightActionRows.get(right);
    if(!element) {
      return;
    }

    element.style.setProperty(
      '--community-peer-dialog-action-width',
      `${right.getBoundingClientRect().width}px`
    );
  };
  const getRightResizeObserver = () => {
    if(!rightResizeObserver && window.ResizeObserver) {
      const ResizeObserverConstructor = window.ResizeObserver;
      rightResizeObserver = new ResizeObserverConstructor((entries) => {
        for(const entry of entries) {
          syncRightActionWidth(entry.target as HTMLElement);
        }
      });
    }

    return rightResizeObserver;
  };
  const observeRightAction = (
    right: HTMLElement,
    element: HTMLElement
  ) => {
    if(rightActionRows.get(right) !== element) {
      rightActionRows.set(right, element);
      getRightResizeObserver()?.observe(right);
    }
    queueMicrotask(() => syncRightActionWidth(right));
  };
  const unobserveRightAction = (
    right: HTMLElement,
    element: HTMLElement
  ) => {
    if(rightActionRows.get(right) === element) {
      rightResizeObserver?.unobserve(right);
      rightActionRows.delete(right);
    }
    element.style.removeProperty(
      '--community-peer-dialog-action-width'
    );
  };

  const onListClick = (event: MouseEvent) => {
    if(
      event.button !== 0 ||
      !props.onClick ||
      (event.target as HTMLElement)
      .closest?.('[data-dialog-list-action]')
    ) {
      return;
    }

    const element = (event.target as HTMLElement)
    .closest?.<HTMLElement>('[data-community-peer-dialog]');
    if(!element || element.parentElement !== list) {
      return;
    }

    const record = records.get(element.dataset.peerId.toPeerId());
    if(record) {
      props.onClick(record.getItem(), event);
    }
  };
  list.addEventListener('click', onListClick, {capture: true});

  appDialogsManager.setListClickListener({
    list,
    onFound: () => false,
    withContext: props.withDialogContextMenu
  });
  props.listRef?.(list);

  createEffect(() => {
    const nextTokens = getClassTokens(props.class);
    for(const token of listClassTokens) {
      if(!nextTokens.includes(token)) {
        list.classList.remove(token);
      }
    }
    for(const token of nextTokens) {
      list.classList.add(token);
    }
    listClassTokens = nextTokens;
  });

  const createDialogRecord = (
    peerId: PeerId,
    initialItem: T
  ): DialogRecord<T> => {
    let record: DialogRecord<T>;
    const dispose = createRoot((disposeRoot) => {
      const [item, setItem] = createSignal(initialItem);
      const initialCommunity = props.getCommunity?.(initialItem);
      const peer = usePeer(() => peerId);
      const dialogElement = initialCommunity ?
        appDialogsManager.addDialogNew({
          peerId,
          container: false,
          autonomous: true,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          meAsSaved: false,
          fromName: initialCommunity.title,
          noIcons: true,
          wrapOptions: {
            middleware: props.middleware
          }
        }) :
        createCommunityDialogElement(
          appDialogsManager,
          peerId,
          {middleware: props.middleware},
          {
            avatarSize: props.avatarSize,
            dontSetActive: true
          },
          false
        );
      const {dom} = dialogElement;
      const element = dom.listEl;
      element.dataset.communityPeerDialog = 'true';

      const activateFromKeyboard = (event: KeyboardEvent) => {
        const MouseEventConstructor =
          element.ownerDocument.defaultView?.MouseEvent || MouseEvent;
        element.dispatchEvent(new MouseEventConstructor('click', {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey
        }));
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if(
          event.target !== element ||
          !props.onClick ||
          event.key !== 'Enter' && event.key !== ' '
        ) {
          return;
        }

        event.preventDefault();
        if(event.key === 'Enter' && !event.repeat) {
          activateFromKeyboard(event);
        }
      };
      element.addEventListener('keydown', onKeyDown);
      const onKeyUp = (event: KeyboardEvent) => {
        if(
          event.target !== element ||
          !props.onClick ||
          event.key !== ' '
        ) {
          return;
        }

        event.preventDefault();
        activateFromKeyboard(event);
      };
      element.addEventListener('keyup', onKeyUp);

      createEffect(() => {
        const clickable = !!props.onClick;
        if(clickable) {
          element.setAttribute('role', 'button');
          element.tabIndex = 0;
        } else {
          element.removeAttribute('role');
          element.removeAttribute('tabindex');
        }
      });

      let itemDatasetKeys: string[] = [];
      createEffect(() => {
        const next = props.getDataset?.(item()) || {};
        for(const key of itemDatasetKeys) {
          if(!(key in next)) {
            delete element.dataset[key];
          }
        }
        for(const [key, value] of Object.entries(next)) {
          element.dataset[key] = value;
        }
        itemDatasetKeys = Object.keys(next);
      });

      let itemClassTokens: string[] = [];
      createEffect(() => {
        const nextTokens = getClassTokens(props.getClass?.(item()));
        for(const token of itemClassTokens) {
          if(!nextTokens.includes(token)) {
            element.classList.remove(token);
          }
        }
        for(const token of nextTokens) {
          element.classList.add(token);
        }
        itemClassTokens = nextTokens;
      });

      const disposeSubtitle = render(
        () => (
          <>
            {props.getSubtitle ?
              props.getSubtitle(item()) :
              getCommunityPeerSubtitle(peer())}
          </>
        ),
        dom.lastMessageSpan
      );
      onCleanup(disposeSubtitle);

      const titleAccessoryMarker = document.createComment(
        'community-peer-title-accessory'
      );
      dom.titleSpan.after(titleAccessoryMarker);
      insert(
        dom.titleSpan.parentElement,
        () => props.getTitleAccessory?.(item()),
        titleAccessoryMarker
      );
      onCleanup(() => {
        let node = dom.titleSpan.nextSibling;
        while(node && node !== titleAccessoryMarker) {
          const next = node.nextSibling;
          node.remove();
          node = next;
        }
        titleAccessoryMarker.remove();
      });

      const right = document.createElement('span');
      dialogElement.titleRight.replaceChildren(right);
      const disposeRight = render(
        () => <>{props.getRight?.(item())}</>,
        right
      );
      onCleanup(disposeRight);
      onCleanup(() => unobserveRightAction(right, element));
      createEffect(() => {
        const interactive = !!props.isRightInteractive?.(item());
        element.classList.toggle(styles.withRightInteractive, interactive);
        if(interactive) {
          right.classList.add(styles.rightInteractive);
          right.dataset.dialogListAction = 'true';
          element.append(right);
          observeRightAction(right, element);
        } else {
          unobserveRightAction(right, element);
          right.classList.remove(styles.rightInteractive);
          delete right.dataset.dialogListAction;
          dialogElement.titleRight.append(right);
        }
      });

      if(initialCommunity) {
        dom.titleSpan.replaceChildren();
        const disposeTitle = render(
          () => <>{props.getCommunity?.(item())?.title || ''}</>,
          dom.titleSpan
        );
        onCleanup(disposeTitle);
      }

      if(props.getAvatarOverlayPeerId || props.getCommunity) {
        const avatar = dom.avatarEl?.node;
        const avatarMedia = document.createElement('div');
        avatarMedia.classList.add(
          'row-media',
          'row-media-abitbigger',
          sharedStyles.avatarMedia
        );
        if(avatar) {
          avatar.classList.remove('row-media', 'row-media-abitbigger');
          avatar.classList.add(sharedStyles.peerAvatar);
          avatar.replaceWith(avatarMedia);
          avatarMedia.append(avatar);
        } else {
          element.append(avatarMedia);
        }
        dialogElement.media = avatarMedia;

        const communityAvatar = document.createElement('span');
        avatarMedia.append(communityAvatar);
        const disposeCommunityAvatar = render(() => (
          <Show when={props.getCommunity?.(item())}>
            {(community) => (
              <CommunityAvatar
                class={sharedStyles.peerAvatar}
                community={community()}
                title={community().title}
                size={42}
              />
            )}
          </Show>
        ), communityAvatar);
        onCleanup(disposeCommunityAvatar);
        createEffect(() => {
          avatar?.classList.toggle(
            'hide',
            !!props.getCommunity?.(item())
          );
        });

        const avatarOverlay = document.createElement('span');
        avatarMedia.append(avatarOverlay);
        const disposeAvatarOverlay = render(() => (
          <Show when={props.getAvatarOverlayPeerId?.(item())}>
            {(overlayPeerId) => (
              <AvatarNewTsx
                class={sharedStyles.peerAvatarOverlay}
                peerId={overlayPeerId()}
                size={18}
              />
            )}
          </Show>
        ), avatarOverlay);
        onCleanup(disposeAvatarOverlay);
      }

      createEffect(() => {
        const options = props.getContextMenu?.(item());
        if(!options) {
          return;
        }

        const {destroy} = createContextMenu({
          ...options,
          listenTo: element
        });
        onCleanup(destroy);
      });

      onCleanup(() => {
        element.removeEventListener('keydown', onKeyDown);
        element.removeEventListener('keyup', onKeyUp);
        dialogElement.remove();
      });

      record = {
        dialogElement,
        dispose: disposeRoot,
        getItem: item,
        setItem
      };
      return disposeRoot;
    });
    record.dispose = dispose;
    return record;
  };

  createEffect(() => {
    const nextPeerIds: PeerId[] = [];
    const nextItems = new Map<PeerId, T>();
    for(const item of props.items) {
      const peerId = props.getPeerId(item);
      if(!nextItems.has(peerId)) {
        nextPeerIds.push(peerId);
      }
      nextItems.set(peerId, item);
    }

    for(const [peerId, record] of records) {
      if(nextItems.has(peerId)) {
        continue;
      }
      records.delete(peerId);
      record.dispose();
    }

    for(const peerId of nextPeerIds) {
      const item = nextItems.get(peerId);
      let record = records.get(peerId);
      if(record) {
        record.setItem(item);
      } else {
        record = createDialogRecord(peerId, item);
        records.set(peerId, record);
      }
      list.append(record.dialogElement.dom.listEl);
    }
  });

  onCleanup(() => {
    list.removeEventListener('click', onListClick, {capture: true});
    for(const record of records.values()) {
      record.dispose();
    }
    records.clear();
    rightResizeObserver?.disconnect();
    rightActionRows.clear();
  });

  return list;
}

export function CommunityDialogList(props: CommunityDialogListProps) {
  const communityFulls = useCommunityFulls();

  return (
    <CommunityPeerDialogList
      items={props.communities}
      middleware={props.middleware}
      getPeerId={(community) => community.id.toPeerId(true)}
      getCommunity={(community) => community}
      getSubtitle={(community) => {
        const full = communityFulls[community.id.toChatId()];
        return full ?
          i18n('Community.ChatsCount', [full.linked_peers.length]) :
          i18n('Community.Title');
      }}
      onClick={props.onClick}
      getContextMenu={props.getContextMenu}
      class={props.class}
    />
  );
}
