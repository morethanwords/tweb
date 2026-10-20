import {PINNED_DIALOG_CLASS_NAME} from '@components/dialogsPinnedReorder';
import attachDialogFolderTags, {DialogFolderTags, DialogFolderTagsContext} from '@components/folderTags/dialogFolderTags';
import rootScope from '@lib/rootScope';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import Button from '@components/button';
import SetTransition from '@components/singleTransition';
import Modes from '@config/modes';
import PeerTitle from '@components/peerTitle';
import I18n from '@lib/langPack';
import findUpTag from '@helpers/dom/findUpTag';
import crossfadeContent, {getCrossfadingTo, STATUS_CROSSFADE_DURATION} from '@helpers/dom/crossfadeContent';
import {TextHighlight} from '@helpers/dom/textHighlight';
import isInDOM from '@helpers/dom/isInDOM';
import {NULL_PEER_ID} from '@appManagers/constants';
import groupCallActiveIcon from '@components/groupCallActiveIcon';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import middlewarePromise from '@helpers/middlewarePromise';
import cancelEvent from '@helpers/dom/cancelEvent';
import noop from '@helpers/noop';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {attachRowController, createRowSortableIcon, RowMediaSizeType, type RowTsxController} from '@components/rowTsxController'
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import {isForumTopic, isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import {ChatType} from '@components/chat/chatType';
import {BADGE_TRANSITION_TIME} from '@components/autonomousDialogList/constants';
import {setRollingText} from '@components/animatedCounter';
import {createUniqueId} from 'solid-js';

import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export const DIALOG_LIST_ELEMENT_TAG = 'A';

export function findDialogListElement(target: EventTarget) {
  return findUpTag(target, DIALOG_LIST_ELEMENT_TAG);
}

export type DialogDom = {
  avatarEl: ReturnType<typeof avatarNew>,
  captionDiv: HTMLElement,
  titleSpan: HTMLSpanElement,
  titleSpanContainer: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  pinnedBadge?: HTMLElement,
  /** the grip a pinned row is dragged by while its list can be reordered */
  sortableIcon?: HTMLElement,
  unreadBadge?: HTMLElement,
  unreadAvatarBadge?: HTMLElement,
  callIcon?: ReturnType<typeof groupCallActiveIcon>,
  mentionsBadge?: HTMLElement,
  reactionsBadge?: HTMLElement,
  pollVotesBadge?: HTMLElement,
  /** opens a bot's main mini app without opening the chat */
  botAppButton?: HTMLElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLElement,
  listEl: HTMLElement,
  subtitleEl: HTMLElement,
  mutedIcon?: HTMLElement,

  titleWrapOptions?: WrapSomethingOptions;

  /**
   * Signature of the last successfully rendered subtitle. Every dialog event
   * (read, mark unread, notify settings, filter update) runs the whole
   * `setLastMessage` pipeline, so without it the subtitle is torn down and
   * rebuilt — custom emoji, media thumbs and all — for updates that cannot
   * have changed a single character of it.
   */
  lastMessageRenderKey?: string,
  /**
   * The nodes that signature was rendered as. Plenty of other places
   * (community dialogs, search results, sidebar pickers) write their own
   * subtitle into `lastMessageSpan`, so a matching key alone does not mean the
   * rendered subtitle is still the one in the DOM.
   */
  lastMessageRenderParts?: HTMLElement[],
  /** search-result rows: the query lit up inside the rendered message text */
  textHighlight?: TextHighlight,
  /**
   * The row shows an activity ("typing…", `setDialogTyping`) and the subtitle leaves it alone until
   * it is over. Not read off `user-typing`: the class only goes when the subtitle is rendered back
   * in, and that render can be cut short by the next dialog update - which would then see the class
   * and skip its own render too, leaving the row typing for good.
   */
  showsActivity?: boolean,

  setLastMessagePromise?: CancellablePromise<void>,
  setUnreadMessagePromise?: CancellablePromise<void>
};

export function setPromiseMiddleware<T extends {[smth in K as K]?: CancellablePromise<void>}, K extends keyof T>(obj: T, key: K) {
  const oldPromise: CancellablePromise<void> = obj[key] as any;
  oldPromise?.reject();

  // @ts-ignore
  const deferred = obj[key] = deferredPromise<void>();
  deferred.catch(() => {}).finally(() => {
    if((obj[key] as any) === deferred) {
      delete obj[key];
    }
  });

  const middleware = middlewarePromise(() => (obj[key] as any) === deferred);
  return {deferred, middleware};
}

export function disposeTextHighlight(dom: DialogDom) {
  dom.textHighlight?.dispose();
  dom.textHighlight = undefined;
}

/**
 * Puts the subtitle of a row in - crossfading from the activity it takes the place of, which
 * came in the same way (`setDialogTyping`)
 */
export function setDialogSubtitle(dom: DialogDom, nodes: Node[]) {
  const {lastMessageSpan} = dom;
  const wasTyping = lastMessageSpan.classList.contains('user-typing');
  lastMessageSpan.classList.remove('user-typing');
  dom.showsActivity = false;
  crossfadeContent(
    lastMessageSpan,
    nodes,
    wasTyping ? 'crossfade' : 'update',
    wasTyping ? {duration: STATUS_CROSSFADE_DURATION} : undefined
  );
}

/**
 * Whether the subtitle in the DOM is still exactly what `setLastMessage` put
 * there — anyone else writing into `lastMessageSpan` (a community dialog
 * falling back to its chat count, a search result, a sidebar picker) has to
 * invalidate the skip.
 */
export function isRenderedSubtitleIntact(dom: DialogDom) {
  const parts = dom.lastMessageRenderParts;
  // * crossfading in, the parts are what it fades to (`setDialogSubtitle`)
  const childNodes = getCrossfadingTo(dom.lastMessageSpan) ?? dom.lastMessageSpan.childNodes;
  return !!parts &&
    parts.length === childNodes.length &&
    parts.every((part, idx) => part === childNodes[idx]);
}

export function getFolderTitleTextColor(active: boolean) {
  return active ? 'primary-color' : 'secondary-text-color';
}

const BADGE_SIZE = 22;

export const DIALOG_AVATAR_SIZES: {[k in DialogElementSize]?: number} = {
  bigger: 54,
  abitbigger: 42,
  small: 32
};

export type DialogElementSize = RowMediaSizeType;
export type AsAllChatsType = 'monoforum' | 'topics';

export type DialogElementOptions = {
  peerId: PeerId,
  rippleEnabled?: boolean,
  onlyFirstName?: boolean,
  meAsSaved?: boolean,
  avatarSize?: RowMediaSizeType,
  autonomous?: boolean,
  loadPromises?: Promise<any>[],
  fromName?: string,
  noIcons?: boolean,
  threadId?: number,
  monoforumParentPeerId?: PeerId,
  wrapOptions: WrapSomethingOptions,
  isMainList?: boolean,
  withStories?: boolean,
  controlled?: boolean,
  dontSetActive?: boolean,
  asAllChats?: AsAllChatsType,
  autoDeletePeriod?: number,
  avatarElement?: HTMLElement,
  /** the row is in a folder's chat list, and wears the tags of the other folders its chat is in */
  folderTags?: DialogFolderTagsContext,
  /** the peer's account, when the tab may show another one meanwhile (a call's participants) */
  accountNumber?: ActiveAccountNumber
};

export type DialogElementBadgeState = {
  muted: boolean,
  pinned: boolean,
  unread: boolean,
  unreadText?: string,
  /** the count `unreadText` stands for - tells which way a changed one rolls */
  unreadCount?: number,
  unreadMention?: boolean,
  unreadAvatar: boolean,
  unreadAvatarText?: string,
  mentions: boolean,
  reactions: boolean,
  pollVotes: boolean,
  botApp?: boolean,
  transitionDuration?: number
};

type DialogElementAppliedBadgeState = {
  [key in Parameters<DialogElement['toggleBadgeByKey']>[0]]: boolean
} & {
  hasOnlyPinnedBadge: boolean,
  unreadText?: string,
  unreadCount?: number,
  unreadMention?: boolean,
  unreadAvatarText?: string
};

export interface DialogElement extends RowTsxController {}

export class DialogElement {
  public dom: DialogDom;
  public isMainList: boolean;
  /** what the row last saw of its bot's main mini app - `user_update` redraws it on a change */
  public hasBotMainApp: boolean;
  public middlewareHelper: MiddlewareHelper;
  public folderTags?: DialogFolderTags;
  private peerTitle: PeerTitle;
  private lastBadgeState: DialogElementAppliedBadgeState;

  constructor({
    peerId,
    rippleEnabled = true,
    onlyFirstName = false,
    meAsSaved = true,
    avatarSize = 'bigger',
    autonomous,
    loadPromises,
    fromName,
    noIcons,
    threadId,
    monoforumParentPeerId,
    wrapOptions = {},
    isMainList,
    withStories,
    controlled,
    dontSetActive,
    asAllChats,
    autoDeletePeriod,
    avatarElement,
    folderTags,
    accountNumber
  }: DialogElementOptions) {
    const wrapMiddleware = wrapOptions?.middleware;
    this.middlewareHelper = wrapMiddleware ? wrapOptions.middleware.create() : (controlled ? getMiddleware() : undefined);

    attachRowController(this, {
      clickable: true,
      noRipple: !rippleEnabled,
      havePadding: !threadId && asAllChats !== 'topics',
      title: true,
      titleRightSecondary: true,
      subtitle: true,
      subtitleRight: true,
      noWrap: true,
      asLink: true,
      middleware: this.middlewareHelper?.get()
    });

    this.isMainList = isMainList;
    this.subtitleRight.remove();

    const newWrapOptions: WrapSomethingOptions = {
      ...wrapOptions
    };

    if(this.middlewareHelper) {
      newWrapOptions.middleware = this.middlewareHelper.get();
    }

    const isSavedDialog = !!threadId && peerId === rootScope.myId;
    const isForumTopic = !!threadId && !isSavedDialog;

    const usePeerId = isSavedDialog ? threadId : peerId;

    const avatar = avatarElement || isForumTopic || asAllChats === 'topics' ?
      undefined :
      avatarNew({
        middleware: this.middlewareHelper.get(),
        size: DIALOG_AVATAR_SIZES[avatarSize],

        lazyLoadQueue: newWrapOptions.lazyLoadQueue,
        isDialog: !!meAsSaved,
        peerId: fromName ? NULL_PEER_ID : usePeerId,
        peerTitle: fromName,
        withStories,
        // Animate video avatars only in the primary chat list (withStories), not
        // in compact pickers / search rows.
        withVideoAvatar: withStories,
        wrapOptions: newWrapOptions,
        meAsNotes: isSavedDialog,
        asAllChats: asAllChats === 'monoforum',
        autoDeletePeriod,
        accountNumber
      });
    loadPromises?.push(avatar?.readyThumbPromise);
    const avatarEl = avatarElement || avatar?.node;
    if(avatarEl) {
      avatarEl.classList.add('dialog-avatar');
      this.applyMediaElement(avatarEl, avatarSize);
    }

    const captionDiv = this.container;

    const titleSpanContainer = this.title;
    titleSpanContainer.classList.add('user-title');

    this.titleRow.classList.add('dialog-title');

    const isActive = !dontSetActive && !autonomous &&
      hotReloadGuard.appImManager.chat &&
      hotReloadGuard.appImManager.isSamePeer(hotReloadGuard.appImManager.chat, {
        peerId: monoforumParentPeerId || peerId,
        monoforumThreadId: monoforumParentPeerId ? peerId : undefined,
        threadId: threadId,
        type: isSavedDialog ? ChatType.Saved : ChatType.Chat
      });

    const titleWrapOptions: WrapSomethingOptions = {
      textColor: hotReloadGuard.appDialogsManager.getTextColor(isActive),
      ...newWrapOptions
    };

    const peerTitle = this.peerTitle = new PeerTitle();
    const peerTitlePromise = peerTitle.update({
      peerId: usePeerId,
      fromName,
      dialog: meAsSaved,
      onlyFirstName,
      withIcons: !noIcons,
      threadId: isSavedDialog ? undefined : threadId,
      wrapOptions: titleWrapOptions,
      iconsColor: hotReloadGuard.appDialogsManager.getPrimaryColor(isActive),
      meAsNotes: isSavedDialog,
      asAllChats,
      accountNumber
    });

    loadPromises?.push(peerTitlePromise);
    titleSpanContainer.append(peerTitle.element);

    // const titleIconsPromise = generateTitleIcons(peerId).then((elements) => {
    //   titleSpanContainer.append(...elements);
    // });

    // if(loadPromises) {
    //   loadPromises.push(titleIconsPromise);
    // }
    // }

    const span = this.subtitle;
    // span.classList.add('user-last-message');

    const li = this.container;
    li.classList.add('chatlist-chat', 'chatlist-chat-' + avatarSize);
    if(!autonomous) {
      (li as HTMLAnchorElement).href = '#' + peerId;
    }
    // if(rippleEnabled) {
    //   ripple(li);
    // }

    if(avatarSize === 'bigger') {
      this.container.classList.add('row-big');
    } else if(avatarSize === 'small') {
      this.container.classList.add('row-small');
    }

    li.dataset.peerId = '' + peerId;

    if(threadId) li.dataset.threadId = '' + threadId;
    if(monoforumParentPeerId) li.dataset.monoforumParentPeerId = '' + monoforumParentPeerId;
    if(asAllChats) li.dataset.isAllChats = 'true';

    const statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status', 'sending-status'/* , 'transition', 'reveal' */);

    const lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    const rightSpan = this.titleRight;
    rightSpan.classList.add('dialog-title-details');
    rightSpan.append(statusSpan, lastTimeSpan);

    this.subtitleRow.classList.add('dialog-subtitle', 'has-multiple-badges');

    // if(I18n.isRTL) {
    //   // this.subtitle.dir = '';
    //   // this.subtitle.dir = 'rtl';
    // }

    const dom: DialogDom = this.dom = {
      avatarEl: avatar,
      captionDiv,
      titleSpan: peerTitle.element,
      titleSpanContainer,
      statusSpan,
      lastTimeSpan,
      lastMessageSpan: span,
      containerEl: li,
      listEl: li,
      subtitleEl: this.subtitleRow,
      titleWrapOptions
    };

    if(folderTags && this.middlewareHelper) {
      this.folderTags = attachDialogFolderTags({
        listEl: li,
        after: this.subtitleRow,
        context: folderTags,
        middleware: this.middlewareHelper.get()
      });
    }

    // this will never happen for migrated legacy chat
    if(!autonomous) {
      (li as any).dialogDom = dom;

      if(isMainList && !asAllChats && hotReloadGuard.appDialogsManager.forumTab?.peerId === peerId && !threadId) {
        li.classList.add('is-forum-open');
      }
    }

    if(isActive) {
      hotReloadGuard.appDialogsManager.setDialogActive(li, true);
    }
  }

  public destroy() {
    this.dispose();
    this.middlewareHelper?.destroy();
    disposeTextHighlight(this.dom);
  }

  public updateTitle(fromName: string) {
    return this.peerTitle.update({fromName});
  }

  public remove() {
    this.destroy();
    this.dom.listEl.remove();
  }

  public setMuted(isMuted: boolean, transitionDuration = 0) {
    const {dom} = this;
    const wasMuted = dom.listEl.classList.contains('is-muted') &&
      !dom.listEl.classList.contains('backwards');
    if(isMuted === wasMuted) {
      return;
    }

    if(isMuted && !dom.mutedIcon) {
      dom.mutedIcon = Icon('nosound_filled', 'dialog-muted-icon');
      dom.titleSpanContainer.append(dom.mutedIcon);
    }

    SetTransition({
      element: dom.listEl,
      className: 'is-muted',
      forwards: isMuted,
      duration: transitionDuration,
      onTransitionEnd: !isMuted ? (() => {
        dom.mutedIcon?.remove();
        delete dom.mutedIcon;
      }) : undefined
    });
  }

  public createPinnedBadge() {
    if(this.dom.pinnedBadge) return;
    const badge = this.dom.pinnedBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-icon badge-${BADGE_SIZE} dialog-subtitle-badge-pinned`;
    badge.append(Icon('chatspinned'));
    this.dom.subtitleEl.append(badge);
  }

  /** The grip a pinned row is dragged by, shown only while its list can be reordered */
  public createSortableIcon() {
    if(this.dom.sortableIcon) return;
    const icon = this.dom.sortableIcon = createRowSortableIcon();
    this.dom.listEl.append(icon);
  }

  public createUnreadBadge() {
    if(this.dom.unreadBadge) return;
    const badge = this.dom.unreadBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} dialog-subtitle-badge-unread`;
    this.dom.subtitleEl.append(badge);
  }

  public createUnreadAvatarBadge() {
    if(this.dom.unreadAvatarBadge) return;
    const badge = this.dom.unreadAvatarBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} avatar-badge`;
    this.dom.listEl.append(badge);
  }

  public createMentionsBadge() {
    if(this.dom.mentionsBadge) return;
    const badge = this.dom.mentionsBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} mention mention-badge dialog-subtitle-badge-mention`;
    badge.innerText = '@';
    this.dom.subtitleEl.append(badge);
  }

  public createReactionsBadge() {
    if(this.dom.reactionsBadge) return;
    const badge = this.dom.reactionsBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} reaction-badge dialog-subtitle-badge-reaction`;
    badge.append(Icon('reactions_filled'));
    this.dom.subtitleEl.append(badge);
  }

  public createPollVotesBadge() {
    if(this.dom.pollVotesBadge) return;
    const badge = this.dom.pollVotesBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} poll-vote-badge dialog-subtitle-badge-pollvote`;
    badge.append(Icon('poll'));
    this.dom.subtitleEl.append(badge);
  }

  public createBotAppButton() {
    if(this.dom.botAppButton) return;
    const button = this.dom.botAppButton = Button(
      `dialog-subtitle-badge badge badge-${BADGE_SIZE} btn-color-primary dialog-subtitle-badge-bot-app`,
      {text: 'Open', noRipple: true, asDiv: !Modes.a11y}
    );
    // * every such button says "Open" - it is the bot's name that tells them apart
    const {titleSpan} = this.dom;
    titleSpan.id ||= createUniqueId();
    button.setAttribute('aria-describedby', titleSpan.id);
    // * the list opens the chat on a press anywhere in the row (setListClickListener), but not on this
    button.dataset.dialogListAction = 'true';
    button.addEventListener('click', (e) => {
      cancelEvent(e); // * the row is a link
      const peerId = this.dom.listEl.dataset.peerId.toPeerId();
      // * turning the confirmation down rejects, and leaves nothing to do
      hotReloadGuard.appImManager.openWebApp({botId: peerId.toUserId(), main: true, peerId}).catch(noop);
    });
    this.dom.subtitleEl.append(button);
  }

  public setBadgeState(options: DialogElementBadgeState) {
    const transitionDuration = options.transitionDuration || 0;
    this.setMuted(options.muted, transitionDuration);

    const previous = this.lastBadgeState;
    const botApp = !!options.botApp;
    // * the bot's button takes the pin's place instead of covering it, as the unread badge does
    const pinned = options.pinned && !botApp;

    // * `toggleBadgeByKey` writes what it toggles into the very state `previous` is
    const wasVisible = {
      unreadBadge: !!previous?.unreadBadge,
      unreadAvatarBadge: !!previous?.unreadAvatarBadge
    };

    const mounted = {
      pinnedBadge: !!this.dom.pinnedBadge,
      unreadBadge: !!this.dom.unreadBadge,
      unreadAvatarBadge: !!this.dom.unreadAvatarBadge,
      mentionsBadge: !!this.dom.mentionsBadge,
      reactionsBadge: !!this.dom.reactionsBadge,
      pollVotesBadge: !!this.dom.pollVotesBadge,
      botAppButton: !!this.dom.botAppButton
    };

    const states: Array<[
      Parameters<DialogElement['toggleBadgeByKey']>[0],
      boolean
    ]> = [
      ['pinnedBadge', pinned],
      ['unreadBadge', options.unread],
      ['unreadAvatarBadge', options.unreadAvatar],
      ['mentionsBadge', options.mentions],
      ['reactionsBadge', options.reactions],
      ['pollVotesBadge', options.pollVotes],
      ['botAppButton', botApp]
    ];

    // * the bot's button and the badges of the subtitle take turns in one place, so whatever
    // * leaves it to the other leaves from where it stands - measured before the newcomer is
    // * appended and pushes it aside
    if(transitionDuration && previous && previous.botAppButton !== botApp) {
      this.holdBadgesInPlace(states
      .filter(([key, visible]) => key !== 'unreadAvatarBadge' && !visible && previous[key] && this.dom[key])
      .map(([key]) => this.dom[key]));
    }

    // * the pinned rows of a list form the block that can be reordered within itself, and
    // * `Sortable` reads that block off the DOM - see attachPinnedDialogsReorder
    this.dom.listEl.classList.toggle(PINNED_DIALOG_CLASS_NAME, !!options.pinned);

    if(options.pinned) this.createSortableIcon();
    if(pinned) this.createPinnedBadge();
    if(options.unread) this.createUnreadBadge();
    if(options.unreadAvatar) this.createUnreadAvatarBadge();
    if(options.mentions) this.createMentionsBadge();
    if(options.reactions) this.createReactionsBadge();
    if(options.pollVotes) this.createPollVotesBadge();
    if(botApp) this.createBotAppButton();

    const subtitleBadgesLength = [
      pinned,
      options.unread,
      options.mentions,
      options.reactions,
      options.pollVotes,
      botApp
    ].filter(Boolean).length;
    const hasOnlyPinnedBadge = pinned && subtitleBadgesLength === 1;
    // * `SetTransition` keeps `animating` on the element for the whole duration,
    // * and `.has-only-pinned-badge:not(.animating)` drops the subtitle's trailing
    // * margin while it is there. Replaying it for an unchanged state makes the
    // * subtitle of every pinned row widen and snap back — a visible blink.
    if(!previous || previous.hasOnlyPinnedBadge !== hasOnlyPinnedBadge) {
      SetTransition({
        element: this.subtitleRow,
        className: 'has-only-pinned-badge',
        forwards: hasOnlyPinnedBadge,
        duration: transitionDuration
      });
    }

    for(const [key, visible] of states) {
      if(!this.dom[key]) {
        continue;
      }

      // an already mounted badge that keeps its visibility needs no transition
      if(mounted[key] && previous?.[key] === visible) {
        continue;
      }

      this.toggleBadgeByKey(key, visible, mounted[key], !transitionDuration);
    }

    // * a count that changes on a badge already in sight rolls to the new one, character by
    // * character, as it does in the official apps; one that comes in with its badge does not,
    // * nor does the `@` of a mention, whose badge is cut differently (`.mention`) and would
    // * swell on its way to a number
    const unreadDirection = (options.unreadCount ?? 0) - (previous?.unreadCount ?? 0);
    const rollUnread = !!transitionDuration && !!previous && !previous.unreadMention === !options.unreadMention;
    const setUnreadText = (key: 'unreadBadge' | 'unreadAvatarBadge', text: string) => {
      setRollingText({
        element: this.dom[key],
        text,
        direction: unreadDirection,
        animate: rollUnread && mounted[key] && wasVisible[key]
      });
    };

    if(options.unread && this.dom.unreadBadge) {
      if(options.unreadText !== undefined && options.unreadText !== previous?.unreadText) {
        setUnreadText('unreadBadge', options.unreadText);
        if(this.dom.unreadAvatarBadge) {
          setUnreadText('unreadAvatarBadge', options.unreadText);
        }
      }
      this.dom.unreadBadge.classList.add('unread');
      this.dom.unreadBadge.classList.toggle('mention', !!options.unreadMention);
    }

    if(options.unreadAvatar && this.dom.unreadAvatarBadge) {
      if(options.unreadAvatarText !== undefined && options.unreadAvatarText !== previous?.unreadAvatarText) {
        setUnreadText('unreadAvatarBadge', options.unreadAvatarText);
      }
      this.dom.unreadAvatarBadge.classList.add('unread');
      this.dom.unreadAvatarBadge.classList.toggle('mention', !!options.unreadMention);
    }

    this.lastBadgeState = {
      pinnedBadge: pinned,
      unreadBadge: options.unread,
      unreadAvatarBadge: options.unreadAvatar,
      mentionsBadge: options.mentions,
      reactionsBadge: options.reactions,
      pollVotesBadge: options.pollVotes,
      botAppButton: botApp,
      hasOnlyPinnedBadge,
      unreadText: options.unreadText,
      unreadCount: options.unreadCount,
      unreadMention: options.unreadMention,
      unreadAvatarText: options.unreadAvatarText
    };
  }

  /** what the unread badge says - its DOM holds the plain text only while the count stands still */
  public get unreadText() {
    return this.lastBadgeState?.unreadText;
  }

  /**
   * Lifts the leaving badges out of the subtitle's flow, each where it stands: the one coming
   * in their place does not push them aside, and their going leaves no gap to snap shut
   */
  private holdBadgesInPlace(badges: HTMLElement[]) {
    const row = this.subtitleRow;
    if(!badges.length || !row.isConnected) {
      return;
    }

    // * all measured before any is lifted, as lifting one moves the rest
    const isRTL = I18n.getIsRTL();
    const width = row.clientWidth;
    const places = badges.map((badge) => ({
      badge,
      top: badge.offsetTop,
      inlineEnd: isRTL ? badge.offsetLeft : width - badge.offsetLeft - badge.offsetWidth
    }));

    for(const {badge, top, inlineEnd} of places) {
      badge.style.setProperty('--held-top', top + 'px');
      badge.style.setProperty('--held-inline-end', inlineEnd + 'px');
      badge.classList.add('is-held-in-place');
    }
  }

  public toggleBadgeByKey(
    key: Extract<keyof DialogDom, 'unreadBadge' | 'unreadAvatarBadge' | 'mentionsBadge' | 'reactionsBadge' | 'pollVotesBadge' | 'pinnedBadge' | 'botAppButton'>,
    hasBadge: boolean,
    justCreated: boolean,
    batch?: boolean
  ) {
    // * `setBadgeState` skips a badge whose visibility `lastBadgeState` says is unchanged, so
    // * out-of-band toggles (`toggleAvatarUnreadBadges` on sidebar collapse / forum tab) must
    // * keep it in sync — otherwise reading the last unread topic can't hide the avatar badge
    if(this.lastBadgeState) {
      this.lastBadgeState[key] = hasBadge;
    }

    // * called back before it was gone
    if(hasBadge) {
      this.dom[key].classList.remove('is-held-in-place');
    }

    SetTransition({
      element: this.dom[key],
      className: 'is-visible',
      forwards: hasBadge,
      duration: batch ? 0 : BADGE_TRANSITION_TIME,
      onTransitionEnd: hasBadge ? undefined : () => {
        this.dom[key].remove();
        delete this.dom[key];
      },
      useRafs: !justCreated || !isInDOM(this.dom[key]) ? 2 : 0
    });
  }
}


