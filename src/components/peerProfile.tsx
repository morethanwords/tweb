import {batch, createContext, createEffect, createMemo, createResource, createSignal, JSX, onCleanup, Show, untrack, useContext} from 'solid-js';
import {render} from 'solid-js/web';
import Section from '@components/section';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {useChat, usePeer} from '@stores/peers';
import {BusinessWorkHours, Chat, ChatFull, GeoPoint, HelpTimezonesList, Timezone, User, UserFull, UserStatus} from '@layer';
import {useFullPeer} from '@stores/fullPeers';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import createMiddleware from '@helpers/solid/createMiddleware';
import {Skeleton} from '@components/skeleton';
import {Middleware} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import classNames from '@helpers/string/classNames';
import Row from '@components/rowTsx';
import formatUserPhone from '@components/wrappers/formatUserPhone';
import {copyTextToClipboard} from '@helpers/clipboard';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import anchorCopy from '@helpers/dom/anchorCopy';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {useAppConfig} from '@stores/appState';
import detectLanguageForTranslation from '@helpers/detectLanguageForTranslation';
import usePeerTranslation from '@hooks/usePeerTranslation';
import makeGoogleMapsUrl from '@helpers/makeGoogleMapsUrl';
import getWebFileLocation from '@helpers/getWebFileLocation';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import type Scrollable from '@components/scrollable';
import {wrapStarsRatingLevel} from '@components/wrappers/starsRating';
import cancelEvent from '@helpers/dom/cancelEvent';
import {HIDDEN_PEER_ID} from '@appManagers/constants';
import {rgbIntToHex} from '@helpers/color';
import {makeMediaSize} from '@helpers/mediaSize';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import IS_PARALLAX_SUPPORTED from '@environment/parallaxSupport';
import {generateDelimiter} from '@components/generateDelimiter';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import {resolveFirst} from '@solid-primitives/refs';
import differenceInYears from '@helpers/date/differenceInYears';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import generateVerifiedIcon from '@components/generateVerifiedIcon';

type PeerProfileContextValue = {
  peerId: PeerId,
  threadId: number,
  scrollable: Scrollable,
  setCollapsedOn: HTMLElement,
  isDialog: boolean,
  onPinnedGiftsChange: (gifts: MyStarGift[]) => void,

  peer: ReturnType<typeof usePeer>,
  fullPeer: ReturnType<ReturnType<typeof useFullPeer>>,
  canBeDetailed: () => boolean,
  isSavedDialog: boolean,
  isTopic: boolean,
  isBotforum: boolean,
  needSimpleAvatar: boolean,
  getDetailsForUse: () => {peerId: PeerId, threadId?: number},
  verifyContext: (peerId: PeerId, threadId?: number) => boolean,
};

const PeerProfileContext = createContext<PeerProfileContextValue>();

function getUsernamesAlso(usernames: string[]) {
  const {i18n, join} = useHotReloadGuard();
  const also = usernames.slice(1);
  if(also.length) {
    const a = also.map((username) => anchorCopy({username}));
    const i = i18n('UsernameAlso', [join(a, false)]);
    return i;
  }
}

function getStatusHiddenShow(peerId: PeerId) {
  const {i18n, PopupElement, PopupToggleReadDate} = useHotReloadGuard();
  return (
    <span
      class="show-when"
      onClick={(e) => {
        cancelEvent(e);
        PopupElement.createPopup(
          PopupToggleReadDate,
          peerId,
          'lastSeen'
        );
      }}
    >
      {i18n('StatusHiddenShow')}
    </span>
  );
}

const PeerProfile = (props: {
  peerId: PeerId,
  threadId?: number,
  isDialog?: boolean,
  scrollable: Scrollable,
  setCollapsedOn: HTMLElement,
  searchSuperContainer?: HTMLElement,
  onPinnedGiftsChange?: (gifts: MyStarGift[]) => void,
  changeAvatarBtn?: HTMLElement
}) => {
  const {rootScope} = useHotReloadGuard();
  const fullPeer = useFullPeer(props.peerId);
  const value: PeerProfileContextValue = {
    peerId: props.peerId,
    threadId: props.threadId,
    scrollable: props.scrollable,
    setCollapsedOn: props.setCollapsedOn,
    isDialog: props.isDialog,
    onPinnedGiftsChange: props.onPinnedGiftsChange,

    peer: usePeer(props.peerId),
    get fullPeer() {
      return fullPeer();
    },
    isSavedDialog: !!(props.peerId === rootScope.myId && props.threadId),
    get isTopic() {
      return !!(props.threadId && ((value.peer as Chat.channel).pFlags.forum || value.isBotforum));
    },
    get isBotforum() {
      return !!(value.peer as User.user).pFlags.bot_forum_view;
    },
    get needSimpleAvatar() {
      return value.isTopic;
    },
    canBeDetailed: () => value.peerId !== rootScope.myId || !value.isDialog,
    getDetailsForUse: () => {
      const {peerId, threadId} = value;
      return value.isSavedDialog ? {
        peerId: threadId,
        threadId: undefined
      } : {
        peerId,
        threadId
      };
    },
    verifyContext: (peerId: PeerId, threadId?: number) => {
      if(value.peerId !== peerId) {
        return false;
      }

      const isForum = !!(value.peer as Chat.channel).pFlags.forum;
      if(isForum && value.threadId ? value.threadId === threadId : true) {
        return true;
      }

      return false;
    }
  };

  props.setCollapsedOn.classList.add('profile-container');

  if(!IS_PARALLAX_SUPPORTED) {
    props.scrollable.container.classList.add('no-parallax');
  }

  if(value.peerId.isUser() && value.peerId !== rootScope.myId) {
    const refreshCurrentUser = () => {
      rootScope.managers.appUsersManager.getApiUsers([value.peerId.toUserId()]);
    };

    // * refresh user online status
    subscribeOn(rootScope)('premium_toggle', refreshCurrentUser);
    subscribeOn(rootScope)('privacy_update', (updatePrivacy) => {
      if(updatePrivacy.key._ === 'privacyKeyStatusTimestamp') {
        refreshCurrentUser();
      }
    });
  }

  return (
    <PeerProfileContext.Provider value={value}>
      <div
        class={classNames(
          'profile-content',
          value.peerId === rootScope.myId && 'is-me'
        )}
      >
        <Show when={!value.needSimpleAvatar}>
          <PeerProfile.AutoAvatar />
        </Show>
        <Show when={props.changeAvatarBtn}>
          <div class="profile-change-avatar-container">
            {props.changeAvatarBtn}
          </div>
        </Show>
        <PeerProfile.PersonalChannel />
        <PeerProfile.MainSection />
        <PeerProfile.BotVerification />
        <PeerProfile.BotPermissions />
        {IS_PARALLAX_SUPPORTED && generateDelimiter()}
        {props.searchSuperContainer}
      </div>
    </PeerProfileContext.Provider>
  );
};

PeerProfile.Avatar = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope, PeerProfileAvatars, avatarNew} = useHotReloadGuard();
  const {peerId, threadId} = context.getDetailsForUse();

  const name = (<PeerProfile.Name />) as HTMLElement;
  const subtitle = (<PeerProfile.Subtitle />) as HTMLElement;

  if(!context.needSimpleAvatar) {
    const avatars = new PeerProfileAvatars(
      context.scrollable,
      rootScope.managers,
      context.setCollapsedOn
    );

    avatars.setPeer(context.peerId);
    avatars.info.append(name, subtitle);
    avatars.container.append(
      (<PeerProfile.PinnedGifts />) as HTMLElement
    );

    onCleanup(() => {
      avatars.cleanup();
    });

    if(IS_PARALLAX_SUPPORTED) {
      context.scrollable.container.classList.add('parallax');
    }

    return avatars.container;
  }

  const middleware = createMiddleware().get();
  const avatar = avatarNew({
    middleware,
    size: 120,
    isDialog: context.isDialog,
    peerId,
    threadId: context.isTopic ? threadId : undefined,
    wrapOptions: {
      customEmojiSize: makeMediaSize(120, 120),
      middleware
    },
    withStories: true,
    meAsNotes: !!(peerId === rootScope.myId && threadId)
  });
  avatar.node.classList.add('profile-avatar', 'avatar-120');
  if(IS_PARALLAX_SUPPORTED) {
    context.scrollable.container.classList.remove('parallax');
  }
  return (
    <>
      {avatar.node}
      {name}
      {subtitle}
    </>
  );
};

PeerProfile.AutoAvatar = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope} = useHotReloadGuard();
  const [needAvatar, setNeedAvatar] = createSignal(true);
  subscribeOn(rootScope)('avatar_update', (data) => {
    if(context.verifyContext(data.peerId, data.threadId)) {
      setNeedAvatar(!needAvatar());
    }
  });

  return (
    <Show when={needAvatar()} fallback={<PeerProfile.Avatar />}><PeerProfile.Avatar /></Show>
  );
};

PeerProfile.Name = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope, wrapPeerTitle} = useHotReloadGuard();
  const {peerId} = context.getDetailsForUse();
  const [element] = createResource(() => {
    return wrapPeerTitle({
      peerId,
      dialog: context.isDialog,
      withIcons: !context.threadId,
      threadId: context.threadId,
      wrapOptions: {
        middleware: createMiddleware().get(),
        textColor: context.setCollapsedOn.classList.contains('need-white') ? 'white' : undefined
      },
      meAsNotes: !!(peerId === rootScope.myId && context.threadId),
      clickableEmojiStatus: true
    });
  });

  return (
    <div class="profile-name">{element()}</div>
  );
};

PeerProfile.Subtitle = () => {
  return (
    <div class="profile-subtitle">
      <PeerProfile.SubtitleRating />
      <PeerProfile.SubtitleStatus />
    </div>
  );
};

PeerProfile.SubtitleRating = () => {
  const context = useContext(PeerProfileContext);
  const {showStarsRatingPopup} = useHotReloadGuard();
  const starsRating = createMemo(() => (context.fullPeer as UserFull.userFull)?.stars_rating);
  return (
    <Show when={starsRating()}>
      <div
        class="profile-subtitle-rating"
        onClick={(e) => {
          cancelEvent(e);
          showStarsRatingPopup({
            user: context.peer as User.user,
            userFull: context.fullPeer as UserFull
          });
        }}
      >
        {wrapStarsRatingLevel(starsRating().level)}
      </div>
    </Show>
  );
};

PeerProfile.SubtitleStatus = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope, appImManager, wrapTopicNameButton} = useHotReloadGuard();
  const needWhen = createMemo(() => {
    const user = (context.peer as User.user);
    return !!(user.status as UserStatus.userStatusRecently)?.pFlags?.by_me;
  });
  const needStatus = createMemo(() => {
    const {peerId, isDialog} = context;
    return !(!peerId || (rootScope.myId === peerId && isDialog)) &&
      peerId !== HIDDEN_PEER_ID;
  });
  const status = createMemo(() => {
    if(!needStatus()) {
      return;
    }

    const {peerId, isDialog} = context;
    const middleware = createMiddleware().get();
    if(context.isTopic) {
      const [element] = createResource(() => {
        const listenerSetter = new ListenerSetter();
        onCleanup(() => listenerSetter.removeAll());
        return wrapTopicNameButton({
          peerId,
          withIcons: false,
          noAvatarAndLink: true,
          wrapOptions: {
            middleware
          }
        }).then(({element}) => {
          attachClickEvent(element, (e) => {
            appImManager.setPeer({peerId});
          }, {listenerSetter});
          return element;
        });
      });

      return (
        <Show when={element()}>{element()}</Show>
      );
    }

    let span: HTMLSpanElement;
    const ret = (<span ref={span}></span>);
    let first = true;
    const [ready, {refetch}] = createResource(() => {
      const _first = first;
      first = false;
      return appImManager.setPeerStatus({
        peerId,
        element: span,
        needClear: _first,
        useWhitespace: true,
        middleware,
        ignoreSelf: !isDialog
      }).then((callback) => (callback?.(), true));
    });

    subscribeOn(rootScope)('peer_typings', ({peerId}) => {
      if(context.peerId === peerId) {
        refetch();
      }
    });

    if(context.peerId.isUser()) {
      subscribeOn(rootScope)('user_update', (userId) => {
        if(context.peerId === userId.toPeerId(false)) {
          refetch();
        }
      });
    }

    const interval = window.setInterval(() => refetch(), 60e3);
    onCleanup(() => {
      clearInterval(interval);
    });

    return (
      <Show when={!ready.loading || ready.latest}>
        {ret}
      </Show>
    );
  });

  return (
    <div class="profile-subtitle-text">
      {status()}
      <Show when={needWhen()}>
        {getStatusHiddenShow(context.peerId)}
      </Show>
    </div>
  );
};

PeerProfile.PinnedGifts = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope, wrapSticker} = useHotReloadGuard();
  const {peerId} = context.getDetailsForUse();
  const giftsCount = createMemo(() => (context.fullPeer as UserFull.userFull)?.stargifts_count);
  const [pinnedGifts] = createResource(giftsCount, (count) => {
    if(!peerId.isUser() || !count) {
      return;
    }

    return rootScope.managers.appGiftsManager.getPinnedGifts(peerId);
  });
  const [elements] = createResource(pinnedGifts, async(gifts) => {
    context.onPinnedGiftsChange?.(gifts);
    if(!gifts) {
      return;
    }

    const middleware = createMiddleware().get();
    const promises = gifts
    .filter((it) => it.saved.pFlags.pinned_to_top)
    .map(async(gift, idx) => {
      const div = document.createElement('div');
      div.className = 'profile-pinned-gift';
      div.setAttribute('data-idx', idx.toString());
      div.style.setProperty(
        '--halo-color',
        rgbIntToHex(gift.collectibleAttributes.backdrop.center_color)
      );
      await wrapSticker({
        doc: gift.sticker,
        static: true,
        middleware,
        width: 30,
        height: 30,
        div
      }).then((r) => r.render);
      return div;
    });

    return Promise.all(promises);
  });

  return (
    <div class="profile-pinned-gifts">
      {elements()}
    </div>
  );
};

PeerProfile.PersonalChannel = () => {
  const context = useContext(PeerProfileContext);
  const {appDialogsManager, apiManagerProxy, rootScope, i18n} = useHotReloadGuard();
  const channelId = createMemo(() => (context.fullPeer as UserFull)?.personal_channel_id);
  const chat = createMemo(() => useChat(channelId()));

  const list = createMemo(() => {
    if(!channelId()) {
      return;
    }

    const peerId = channelId().toPeerId(true);
    const mid = (context.fullPeer as UserFull).personal_channel_message;
    const middleware = createMiddleware().get();

    const loadPromises: Promise<any>[] = [];
    const list = appDialogsManager.createChatList();
    const dialogElement = appDialogsManager.addDialogNew({
      peerId: peerId,
      container: list,
      rippleEnabled: true,
      avatarSize: 'abitbigger',
      append: true,
      wrapOptions: {middleware},
      withStories: true,
      loadPromises
    });

    dialogElement.container.classList.add('personal-channel');

    const makeSkeleton = (props: {
      element: HTMLElement,
      middleware: Middleware
    }) => {
      const [children, setChildren] = createSignal<JSX.Element>();
      const dispose = render(() => {
        return Skeleton({
          children,
          loading: createMemo(() => !children())
        });
      }, props.element);

      props.element.classList.add('skeleton-container');
      props.middleware.onDestroy(dispose);

      return setChildren;
    };

    const TEST = false;
    const isCached = !!apiManagerProxy.getMessageByPeer(peerId, mid) && !TEST;
    const messagePromise = rootScope.managers.appMessagesManager.reloadMessages(peerId, mid);
    const readyPromise = messagePromise.then(async(message) => {
      TEST && await pause(1000);
      await appDialogsManager.setLastMessageN({
        dialog: {
          _: 'dialog',
          peerId
        } as any,
        lastMessage: message,
        dialogElement
      });

      setSubtitleChildren?.(dialogElement.subtitle);
      setTimeChildren?.(dialogElement.dom.lastTimeSpan);
    });

    let setSubtitleChildren: (children: JSX.Element) => void, setTimeChildren: (children: JSX.Element) => void;
    if(!isCached) {
      const _subtitle = dialogElement.subtitle.cloneNode(true) as HTMLElement;
      dialogElement.subtitle.replaceWith(_subtitle);
      setSubtitleChildren = makeSkeleton({
        element: _subtitle,
        middleware
      });

      const timeSpan = dialogElement.dom.lastTimeSpan.cloneNode(true) as HTMLElement;
      dialogElement.dom.lastTimeSpan.replaceWith(timeSpan);
      setTimeChildren = makeSkeleton({
        element: timeSpan,
        middleware
      });
    }

    if(isCached) {
      loadPromises.push(readyPromise);
    }

    return list;
  });

  return (
    <Show when={channelId()}>
      <Section
        ref={(element) => {
          appDialogsManager.setListClickListener({
            list: element,
            autonomous: false,
            openInner: true
          });
        }}
        name={
          <>
            <span class="personal-channel-name">
              {i18n('AccDescrChannel')}
              <span class="personal-channel-counter">
                {i18n('Subscribers', [
                  numberThousandSplitter((chat() as Chat.channel).participants_count)
                ])}
              </span>
            </span>
          </>
        }
      >
        {list()}
      </Section>
    </Show>
  );
};

PeerProfile.Phone = () => {
  const context = useContext(PeerProfileContext);
  const {I18n, i18n, toast} = useHotReloadGuard();
  const appConfig = useAppConfig();

  const phoneDetails = createMemo(() => {
    if(!context.peerId.isUser() || !context.canBeDetailed()) {
      return;
    }

    const phone = (context.peer as User.user).phone;
    if(!phone) {
      return;
    }

    return {
      phone,
      isAnonymous: appConfig.fragment_prefixes.some((prefix) => phone.startsWith(prefix)),
      formatted: formatUserPhone(phone)
    };
  });

  const copyPhoneNumber = () => {
    copyTextToClipboard(phoneDetails().formatted.replace(/\s/g, ''));
    toast(I18n.format('PhoneCopied', true));
  };

  return (
    <Show when={!!phoneDetails()?.phone}>
      <Row
        clickable={copyPhoneNumber}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Text.CopyLabel_PhoneNumber',
            onClick: copyPhoneNumber
          }, {
            icon: 'info',
            text: 'PeerInfo.Phone.AnonymousInfo',
            textArgs: [(() => {
              const a = document.createElement('a');
              return a;
            })()],
            onClick: () => {
              safeWindowOpen('https://fragment.com/numbers');
            },
            separator: true,
            secondary: true,
            verify: () => phoneDetails().isAnonymous
          }]
        }}
      >
        <Row.Icon icon="phone" />
        <Row.Title>{phoneDetails().formatted}</Row.Title>
        <Row.Subtitle>{i18n(phoneDetails().isAnonymous ? 'AnonymousNumber' : 'Phone')}</Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.Username = () => {
  const context = useContext(PeerProfileContext);
  const {I18n, i18n, toast} = useHotReloadGuard();
  const usernames = createMemo(() => {
    if(!context.peerId.isUser() || !context.canBeDetailed()) {
      return;
    }

    return getPeerActiveUsernames(context.peer as User.user);
  });

  const mainUsername = createMemo(() => usernames()?.[0]);

  const onClick = () => {
    copyTextToClipboard('@' + mainUsername());
    toast(I18n.format('UsernameCopied', true));
  };

  return (
    <Show when={usernames()?.length}>
      <Row
        clickable={onClick}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Text.CopyLabel_Username',
            onClick: onClick
          }]
        }}
      >
        <Row.Icon icon="username" />
        <Row.Title>{mainUsername()}</Row.Title>
        <Row.Subtitle>{
          getUsernamesAlso(usernames()) || i18n('Username')
        }</Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.Birthday = () => {
  const context = useContext(PeerProfileContext);
  const {I18n, i18n, wrapEmojiText, rootScope, PopupElement, PopupSendGift, showBirthdayPopup, saveMyBirthday, toastNew} = useHotReloadGuard();
  const birthday = createMemo(() => (context.fullPeer as UserFull.userFull)?.birthday);
  const isToday = createMemo(() => {
    const birthday$ = birthday();
    if(!birthday$) return false;

    const today = new Date();
    return birthday$.day === today.getDate() && birthday$.month === today.getMonth() + 1;
  });

  const text = createMemo(() => {
    const birthday$ = birthday();
    if(!birthday$) return '';

    const date = new Date();
    date.setDate(birthday$.day);
    date.setMonth(birthday$.month - 1);
    if(birthday$.year) {
      date.setFullYear(birthday$.year);
    }

    const el = new I18n.IntlDateElement({
      date,
      options: {
        day: 'numeric',
        month: 'long',
        year: birthday$.year ? 'numeric' : undefined
      }
    }).element;

    if(isToday()) el.prepend(wrapEmojiText('🎂 '));

    if(birthday$.year) {
      const years = differenceInYears(date, new Date());
      el.append(i18n('BirthdayYearsOld', [years]));
    }

    return el;
  });

  const onCopyClick = () => {
    copyTextToClipboard((text() as HTMLElement).textContent);
    toastNew({langPackKey: 'TextCopied'});
  };

  const onClick = createMemo(() => {
    if(context.peerId === rootScope.myId) {
      return () => showBirthdayPopup({
        initialDate: birthday(),
        fromProfile: true,
        onSave: saveMyBirthday
      });
    }

    if(isToday()) {
      return () => PopupElement.createPopup(PopupSendGift, {peerId: context.peerId});
    }

    return onCopyClick;
  });


  return (
    <Show when={birthday()}>
      <Row
        clickable={onClick()}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Copy',
            onClick: onCopyClick
          }]
        }}
      >
        <Row.Icon icon="gift" />
        <Row.Title>{text()}</Row.Title>
        <Row.Subtitle>
          {i18n('Birthday')}
        </Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.ContactNote = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, wrapEmojiText, toastNew} = useHotReloadGuard();
  const note = createMemo(() => (context.fullPeer as UserFull.userFull)?.note);
  const text = createMemo(() => {
    const note$ = note();
    if(!note$) return;

    return wrapEmojiText(note$.text, false, note$.entities);
  });

  const onClick = () => {
    const {text, html} = prepareTextWithEntitiesForCopying(note());
    copyTextToClipboard(text, html);
    toastNew({langPackKey: 'TextCopied'});
  };

  return (
    <Show when={text()}>
      <Row
        clickable={onClick}
        class="profile-notes"
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Text.CopyLabel_Note',
            onClick
          }]
        }}
      >
        <Row.Icon icon="edit" />
        <Row.Title>{text()}</Row.Title>
        <Row.Subtitle subtitleRight={i18n('ContactNoteRowDesc')}>
          {i18n('ContactNoteRow')}
        </Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.Location = () => {
  const context = useContext(PeerProfileContext);
  const {i18n} = useHotReloadGuard();

  const location = createMemo(() => {
    const location = (context.fullPeer as ChatFull.channelFull)?.location;
    if(location?._ === 'channelLocation') {
      return location;
    }
  });

  return (
    <Show when={location()}>
      <Row>
        <Row.Icon icon="location" />
        <Row.Title>{location()?.address}</Row.Title>
        <Row.Subtitle>{i18n('ChatLocation')}</Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.Bio = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, PopupPremium, PopupElement, PopupTranslate, I18n, wrapRichText, toast} = useHotReloadGuard();
  const appConfig = useAppConfig();
  const peerTranslation = usePeerTranslation(context.peerId);

  const about = createMemo(() => context.fullPeer?.about);
  const bioLanguagePromise = createMemo(() => detectLanguageForTranslation(about()));

  const aboutWrapped = createMemo(() => {
    if(!about()) {
      return;
    }

    return wrapRichText(about(), {
      whitelistedDomains: (context.peer as User.user).pFlags.premium ? undefined : appConfig.whitelisted_domains
    });
  });

  const onClick = (e: MouseEvent | TouchEvent) => {
    if((e.target as HTMLElement).tagName === 'A') {
      return;
    }

    copyTextToClipboard(about());
    toast(I18n.format('BioCopied', true));
  };

  return (
    <Show when={about()}>
      <Row
        clickable={onClick}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Text.CopyLabel_About',
            onClick,
            verify: () => !context.peerId.isUser()
          }, {
            icon: 'copy',
            text: 'Text.CopyLabel_Bio',
            onClick,
            verify: () => context.peerId.isUser()
          }, {
            icon: 'premium_translate',
            text: 'TranslateMessage',
            onClick: async() => {
              if(!peerTranslation.canTranslate(true)) {
                PopupPremium.show({feature: 'translations'});
              } else {
                PopupElement.createPopup(PopupTranslate, {
                  peerId: context.peerId,
                  textWithEntities: {
                    _: 'textWithEntities',
                    text: about(),
                    entities: []
                  },
                  detectedLanguage: await bioLanguagePromise()
                });
              }
            },
            verify: async() => !!(await bioLanguagePromise())
          }]
        }}
      >
        <Row.Icon icon="info" />
        <Row.Title class="pre-wrap">{aboutWrapped()}</Row.Title>
        <Row.Subtitle>{i18n(context.peerId.isUser() ? 'UserBio' : 'Info')}</Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.Link = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, I18n, toast} = useHotReloadGuard();

  const toFill = createMemo<Partial<{url: string, also: JSX.Element}>>(() => {
    if(context.peerId.isUser()) {
      return;
    }

    const usernames = getPeerActiveUsernames(context.peer as Chat.channel);
    if(context.isTopic) {
      let url = 't.me/';
      const threadId = getServerMessageId(context.threadId);
      const username = usernames[0];
      if(username) {
        url += `${username}/${threadId}`;
      } else {
        url += `c/${context.peerId.toChatId()}/${threadId}`;
      }

      return {url};
    }

    if(usernames.length) {
      return {
        url: 't.me/' + usernames[0],
        also: getUsernamesAlso(usernames)
      };
    }

    const exportedInvite = (context.fullPeer as ChatFull.channelFull)?.exported_invite;
    if(exportedInvite?._ === 'chatInviteExported') {
      return {
        url: exportedInvite.link.slice(exportedInvite.link.indexOf('t.me/'))
      };
    }
  });

  const onClick = () => {
    const url = 'https://' + toFill().url;
    copyTextToClipboard(url);
    // Promise.resolve(appProfileManager.getChatFull(this.peerId.toChatId())).then((chatFull) => {
    // copyTextToClipboard(chatFull.exported_invite.link);
    const isPrivate = url.includes('/c/');
    toast(I18n.format(isPrivate ? 'LinkCopiedPrivateInfo' : 'LinkCopied', true));
    // });
  };

  return (
    <Show when={toFill()}>
      <Row
        clickable={onClick}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Text.CopyLabel_ShareLink',
            onClick
          }]
        }}
      >
        <Row.Icon icon="link" />
        <Row.Title>{toFill().url}</Row.Title>
        <Row.Subtitle>{toFill().also || i18n('SetUrlPlaceholder')}</Row.Subtitle>
      </Row>
    </Show>
  );
};

PeerProfile.BusinessHours = () => {
  const context = useContext(PeerProfileContext);
  const {rootScope, BusinessHours} = useHotReloadGuard();
  const [timezonesList] = createResource(() => {
    return rootScope.managers.apiManager.getTimezonesList() as Promise<HelpTimezonesList.helpTimezonesList>;
  });
  const [hours, setHours] = createSignal<BusinessWorkHours>();
  const [timezones, setTimezones] = createSignal<Timezone[]>();

  createEffect(() => {
    const fullPeer = context.fullPeer as UserFull;
    const timezones = timezonesList()?.timezones;
    batch(() => {
      if(!fullPeer || !timezones) {
        setHours();
        setTimezones();
        return;
      }

      setHours(fullPeer.business_work_hours);
      setTimezones(timezones);
    });
  });

  return (
    <Show when={hours() && timezones()}>
      {BusinessHours({hours, timezones}).container}
    </Show>
  );
};

PeerProfile.BusinessLocation = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, wrapPhoto, wrapEmojiText, confirmationPopup, toastNew} = useHotReloadGuard();
  const location = createMemo(() => (context.fullPeer as UserFull)?.business_location);

  const copyAddress = () => {
    copyTextToClipboard(location().address);
    toastNew({langPackKey: 'BusinessLocationCopied'});
  };

  const onClick = async() => {
    const _location = location();
    if(!_location.geo_point) {
      copyAddress();
      return;
    }

    await confirmationPopup({
      descriptionLangKey: 'Popup.OpenInGoogleMaps',
      button: {
        langKey: 'Open'
      }
    });

    safeWindowOpen(makeGoogleMapsUrl(_location.geo_point as GeoPoint.geoPoint));
  };

  return (
    <Show when={location()}>
      <Row
        class="business-location"
        clickable={onClick}
        contextMenu={{
          buttons: [{
            icon: 'copy',
            text: 'Copy',
            onClick: copyAddress
          }]
        }}
      >
        <Row.Icon icon="location" />
        <Row.Title>{wrapEmojiText(location().address)}</Row.Title>
        <Row.Subtitle>{i18n('BusinessProfileLocation')}</Row.Subtitle>
        <Show when={location().geo_point}>
          <Row.Media
            size="big"
            ref={(media) => {
              const loadPromises: Promise<any>[] = [];
              wrapPhoto({
                photo: getWebFileLocation(location().geo_point as GeoPoint.geoPoint, 48, 48, 16),
                container: media,
                middleware: createMiddleware().get(),
                loadPromises
              });
            }}
          />
        </Show>
      </Row>
    </Show>
  );
};

PeerProfile.Notifications = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, rootScope} = useHotReloadGuard();

  const options = {
    peerId: context.peerId,
    threadId: context.threadId
  };

  const [muted, {refetch}] = createResource(() => {
    return rootScope.managers.appNotificationsManager.isPeerLocalMuted({
      ...options,
      respectType: false
    });
  });

  subscribeOn(rootScope)('dialog_notify_settings', (dialog) => {
    if(context.peerId === dialog.peerId) {
      refetch();
    }
  });

  return (
    <Show when={(context.isDialog && context.canBeDetailed() && (!muted.loading || muted.latest !== undefined))}>
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={!muted()}
            onChange={(checked) => {
              rootScope.managers.appMessagesManager.togglePeerMute({
                peerId: context.peerId,
                threadId: context.threadId,
                mute: !checked
              });
            }}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Icon icon="unmute" />
        <Row.Title>{i18n('Notifications')}</Row.Title>
      </Row>
    </Show>
  );
};

PeerProfile.BotVerification = () => {
  const context = useContext(PeerProfileContext);
  const {wrapAdaptiveCustomEmoji, wrapEmojiText, i18n} = useHotReloadGuard();
  const verification = createMemo(() => (context.fullPeer as UserFull)?.bot_verification);
  const officialVerified = createMemo(() => (context.peer as User.user).pFlags.verified);

  const content = createMemo(() => {
    if(verification()) {
      return {
        icon: wrapAdaptiveCustomEmoji({
          docId: verification().icon,
          size: 32,
          wrapOptions: {
            middleware: createMiddleware().get(),
            textColor: 'secondary-text-color'
          }
        }).container,
        text: wrapEmojiText(verification().description)
      };
    } else if(officialVerified()) {
      const isBroadcast = (context.peer as Chat.channel).pFlags.broadcast;
      return {
        icon: generateVerifiedIcon(),
        text: i18n(context.peerId.isAnyChat() ? (isBroadcast ? 'Verified.Channel' : 'Verified.Group') : 'Verified.Bot')
      };
    }
  });

  return (
    <Show when={content()}>
      <div class="profile-bot-verification">
        {content().icon}
        <div class="profile-bot-verification-content">
          {content().text}
        </div>
      </div>
    </Show>
  );
};

PeerProfile.BotPermissions = () => {
  const context = useContext(PeerProfileContext);
  const {i18n, rootScope} = useHotReloadGuard();
  const botInfo = createMemo(() => (context.fullPeer as UserFull)?.bot_info);
  const canManageEmojiStatus = createMemo(() => botInfo() && (context.fullPeer as UserFull).pFlags.bot_can_manage_emoji_status);
  const seenEmojiStatusFlag = createMemo<boolean>((prev) => prev || canManageEmojiStatus());
  const [locationPermission] = createResource(botInfo, (botInfo) => {
    if(!botInfo) {
      return null;
    }

    return rootScope.managers.appBotsManager.readBotInternalStorage(
      context.peerId,
      'locationPermission'
    );
  });
  const shouldShow = createMemo(() => {
    return botInfo() && (
      seenEmojiStatusFlag() ||
      locationPermission() != null
    );
  });

  return (
    <Show when={shouldShow()}>
      <Section
        name={i18n('BotAllowAccessTo')}
        noDelimiter
      >
        <Show when={seenEmojiStatusFlag()}>
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                checked={canManageEmojiStatus()}
                onChange={(checked) => {
                  rootScope.managers.appBotsManager.toggleEmojiStatusPermission(
                    context.peerId,
                    checked
                  );
                }}
                toggle
              />
            </Row.CheckboxFieldToggle>
            <Row.Icon icon="smile" />
            <Row.Title>{i18n('BotAllowAccessToEmojiStatus')}</Row.Title>
          </Row>
        </Show>
        <Show when={locationPermission() != null}>
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                checked={locationPermission() === 'true'}
                onChange={(checked) => {
                  rootScope.managers.appBotsManager.writeBotInternalStorage(
                    context.peerId,
                    'locationPermission',
                    String(checked)
                  );
                }}
                toggle
              />
            </Row.CheckboxFieldToggle>
            <Row.Icon icon="location" />
            <Row.Title>{i18n('BotAllowAccessToLocation')}</Row.Title>
          </Row>
        </Show>
      </Section>
    </Show>
  );
};

PeerProfile.MainSection = () => {
  const context = useContext(PeerProfileContext);

  return (
    <Section
      noDelimiter
      contentProps={{class: classNames(context.needSimpleAvatar && 'has-simple-avatar')}}
    >
      <Show when={context.needSimpleAvatar}>
        <PeerProfile.AutoAvatar />
      </Show>
      <Show when={!(context.isBotforum && context.threadId)}>
        <PeerProfile.Phone />
        <PeerProfile.Username />
        <PeerProfile.Location />
        <PeerProfile.Bio />
        <PeerProfile.Link />
        <PeerProfile.Birthday />
        <PeerProfile.ContactNote />
        <PeerProfile.BusinessHours />
        <PeerProfile.BusinessLocation />
        <PeerProfile.Notifications />
      </Show>
    </Section>
  );
};

export const renderPeerProfile = (props: Parameters<typeof PeerProfile>[0], HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider) => {
  const ret = (
    <HotReloadGuardProvider>
      <PeerProfile {...props} />
    </HotReloadGuardProvider>
  );

  const resolved = resolveFirst(() => ret);
  return resolved() as HTMLElement;
};

export default PeerProfile;
