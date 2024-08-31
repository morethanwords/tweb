/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, JSX, For, untrack, Accessor, onCleanup, Ref, createMemo} from 'solid-js';
import {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import {AvatarNew} from '../avatarNew';
import PeerTitle from '../peerTitle';
import {ScrollableXTsx} from '../stories/list';
import formatNumber from '../../helpers/number/formatNumber';
import {Chat, MessagesChats, User} from '../../layer';
import computeLockColor from '../../helpers/computeLockColor';
import classNames from '../../helpers/string/classNames';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import PopupPremium from '../popups/premium';
import appImManager from '../../lib/appManagers/appImManager';
import anchorCallback from '../../helpers/dom/anchorCallback';
import PopupElement from '../popups';
import PopupPickUser from '../popups/pickUser';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {ButtonIconTsx} from '../buttonIconTsx';
import {IconTsx} from '../iconTsx';
import createMiddleware from '../../helpers/solid/createMiddleware';
import showTooltip from '../tooltip';
import {usePeer} from '../../stores/peers';

let canvas: HTMLCanvasElement, context: CanvasRenderingContext2D;
export function SimilarPeer(props: {
  peerId: PeerId,
  promises?: Promise<any>[],
  ref?: Ref<HTMLDivElement>,
  avatarSize: number,

  isLast?: boolean,
  count?: number,
  defaultLimit?: number,
  premium?: boolean
}) {
  if(!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    context = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
  }

  const [color, setColor] = createSignal<string>();
  const [badgeBackgroundUrl, setBadgeBackgroundUrl] = createSignal<string>();
  const onImageLoad = (image: HTMLImageElement) => {
    if(image.naturalWidth < 100) {
      return;
    }

    // const perf = performance.now();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    setBadgeBackgroundUrl(computeLockColor(canvas));
    // console.log('lock color', performance.now() - perf);
  };

  const avatar = untrack(() => {
    return AvatarNew({
      peerId: props.peerId,
      size: props.avatarSize,
      processImageOnLoad: onImageLoad
    });
  });
  avatar.node.classList.add('similar-channels-channel-avatar');
  const promises: Promise<any>[] = [];
  promises.push(avatar.readyThumbPromise);
  if(props.isLast) {
    avatar.node.classList.add('similar-channels-channel-avatar-stack-first');
  }

  avatar.readyThumbPromise.then(() => {
    setColor(avatar.color());
  });

  let nameElement: HTMLElement;
  if(!props.isLast) {
    const peerTitle = new PeerTitle();
    promises.push(peerTitle.update({peerId: untrack(() => props.peerId)}));
    nameElement = peerTitle.element;
  } else {
    nameElement = i18n('MoreSimilar');
  }
  nameElement.classList.add('similar-channels-channel-name');

  const icon = (
    <IconTsx
      icon={props.isLast ? 'premium_lock' : 'newprivate_filled'}
      class="similar-channels-channel-badge-icon"
    />
  );

  if(props.promises) {
    props.promises.push(...promises);
  }

  const peer = usePeer(props.peerId);
  const badge = (
    <span
      class="similar-channels-channel-badge"
      style={badgeBackgroundUrl() ? {'background-image': `url(${badgeBackgroundUrl()})`} : {'background-color': `var(--peer-avatar-${color()}-bottom)`}}
    >
      {props.isLast ? (
        <>
          {`+${props.count - props.defaultLimit}`}
          {!untrack(() => props.premium) && icon}
        </>
      ) : (
        <>
          {icon}
          {formatNumber((peer as User.user).bot_active_users || (peer as Chat.channel).participants_count || 1, 1)}
        </>
      )}
    </span>
  );

  const displayBadge = createMemo(() => (peer as User.user)._ !== 'user' || (peer as User.user).bot_active_users !== undefined);

  return (
    <div
      class={classNames('similar-channels-channel', props.isLast && 'is-last', !displayBadge() && 'no-badge')}
      ref={props.ref}
    >
      {props.isLast ? (
        <div class="similar-channels-channel-avatar-stack">
          {avatar.element}
          <div class="similar-channels-channel-avatar-stack-middle" />
          <div class="similar-channels-channel-avatar-stack-last" />
        </div>
      ) : avatar.element}
      {displayBadge() && badge}
      {nameElement}
    </div>
  );
}

export default function SimilarChannels(props: {
  chatId: ChatId,
  onClose: () => void,
  onAcked?: (cached: boolean) => void,
  onReady?: () => void,
  onEmpty?: () => void
}) {
  const [premium, setPremium] = createSignal(rootScope.premium);
  const [details, setDetails] = createSignal<Awaited<Awaited<ReturnType<typeof getDetails>>['results']>>();
  const [list, setList] = createSignal<JSX.Element>();

  let {onAcked, onReady, onEmpty} = props;

  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  const context = canvas.getContext('2d', {alpha: false, willReadFrequently: true});

  rootScope.addEventListener('premium_toggle', setPremium);

  const getDetails = async() => {
    const r = apiManagerProxy.isPremiumFeaturesHidden();
    const results = await Promise.all([
      rootScope.managers.acknowledged.appChatsManager.getChannelRecommendations(props.chatId),
      rootScope.managers.acknowledged.apiManager.getLimit('recommendedChannels', false),
      rootScope.managers.acknowledged.apiManager.getLimit('recommendedChannels', true),
      {cached: !(r instanceof Promise), result: Promise.resolve(r)}
    ]);

    return {
      cached: results.every((result) => result.cached),
      results: Promise.all(results.map((result) => result.result)) as Promise<[MessagesChats, number, number, boolean]>
    };
  };

  createEffect(async() => {
    premium();
    const middleware = createMiddleware().get();
    const {cached, results} = await getDetails();
    onAcked?.(cached);
    onAcked = undefined;
    if(!middleware()) {
      return;
    }

    const details = await results;
    if(!middleware()) {
      return;
    }

    if(!details[0].chats.length) {
      props.onEmpty?.();
      return;
    }

    setDetails(details);
  });

  createEffect(async() => {
    const d = details();
    if(!d) {
      return;
    }

    const [messagesChats, defaultLimit, premiumLimit, isPremiumFeaturesHidden] = d;
    const count = (messagesChats as MessagesChats.messagesChatsSlice).count ?? messagesChats.chats.length;
    const hasMore = count > defaultLimit && !isPremiumFeaturesHidden;
    const rendered: Map<HTMLElement, Chat.channel> = new Map();

    const Item = (chat: Chat.channel, idx: Accessor<number>) => {
      const [badgeBackgroundUrl, setBadgeBackgroundUrl] = createSignal<string>();
      const onImageLoad = (image: HTMLImageElement) => {
        if(image.naturalWidth < 100) {
          return;
        }

        // const perf = performance.now();
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setBadgeBackgroundUrl(computeLockColor(canvas));
        // console.log('lock color', performance.now() - perf);
      };
      const peerId = chat.id.toPeerId(true);
      const isLast = hasMore && idx() === defaultLimit - 1;

      const avatar = untrack(() => {
        return AvatarNew({
          peerId: peerId,
          size: 60,
          processImageOnLoad: onImageLoad
        });
      });
      avatar.node.classList.add('similar-channels-channel-avatar');
      promises.push(avatar.readyThumbPromise);
      if(isLast) {
        avatar.node.classList.add('similar-channels-channel-avatar-stack-first');
      }

      let nameElement: HTMLElement;
      if(!isLast) {
        const peerTitle = new PeerTitle();
        promises.push(peerTitle.update({peerId}));
        nameElement = peerTitle.element;
      } else {
        nameElement = i18n('MoreSimilar');
      }
      nameElement.classList.add('similar-channels-channel-name');

      const icon = (
        <IconTsx
          icon={isLast ? 'premium_lock' : 'newprivate_filled'}
          class="similar-channels-channel-badge-icon"
        />
      );

      return (
        <div
          class={classNames('similar-channels-channel', isLast && 'is-last')}
          ref={(el) => rendered.set(el, isLast ? undefined : chat)}
        >
          {isLast ? (
            <div class="similar-channels-channel-avatar-stack">
              {avatar.element}
              <div class="similar-channels-channel-avatar-stack-middle" />
              <div class="similar-channels-channel-avatar-stack-last" />
            </div>
          ) : avatar.element}
          <span
            class="similar-channels-channel-badge"
            style={badgeBackgroundUrl() && {'background-image': `url(${badgeBackgroundUrl()})`}}
          >
            {isLast ? (
              <>
                {`+${count - defaultLimit}`}
                {!untrack(premium) && icon}
              </>
            ) : (
              <>
                {icon}
                {formatNumber(chat.participants_count || 1, 1)}
              </>
            )}
          </span>
          {nameElement}
        </div>
      );
    };

    const middleware = createMiddleware().get();
    const promises: Promise<any>[] = [];
    let ref: HTMLDivElement;
    const list = (
      <div ref={ref} class="similar-channels-list">
        <For each={(messagesChats.chats as Chat.channel[]).slice(0, defaultLimit)}>
          {(chat, idx) => {
            const isLast = hasMore && idx() === defaultLimit - 1;
            return (
              <SimilarPeer
                peerId={chat.id.toPeerId(true)}
                promises={promises}
                isLast={isLast}
                ref={(el) => rendered.set(el, isLast ? undefined : chat)}
                count={count}
                defaultLimit={defaultLimit}
                premium={untrack(premium)}
                avatarSize={60}
              />
            );
          }}
        </For>
      </div>
    );

    const detach = attachClickEvent(ref, (e) => {
      const target = findUpClassName(e.target, 'similar-channels-channel');
      if(!target) {
        return;
      }

      cancelEvent(e);
      const chat = rendered.get(target);
      if(chat) {
        appImManager.setInnerPeer({peerId: chat.id.toPeerId(true)});
        return;
      }

      if(premium()) {
        PopupElement.createPopup(PopupPickUser, {
          onSelect: (peerId) => {
            appImManager.setInnerPeer({peerId});
          },
          peerType: ['custom'],
          getMoreCustom: async() => {
            return {
              result: messagesChats.chats.map((chat) => chat.id.toPeerId(true)),
              isEnd: true
            };
          },
          headerLangPackKey: 'SimilarChannels'
        });
        return;
      }

      const anchor = anchorCallback(() => {
        close();
        PopupPremium.show();
      });
      anchor.classList.add('primary');

      const {close} = showTooltip({
        element: target.querySelector('.similar-channels-channel-avatar-stack, .similar-channels-channel-avatar'),
        container: target.parentElement,
        vertical: 'top',
        textElement: i18n(
          'SimilarChannels.Unlock',
          [
            anchor,
            premiumLimit
          ]
        ),
        icon: 'star'
      });
    });
    onCleanup(detach);

    await Promise.all(promises);
    if(!middleware()) {
      return;
    }

    setList(list);
    onReady?.();
    onReady = undefined;
  });

  return (
    <div class="similar-channels-container">
      <svg class="similar-channels-notch" width="19" height="7" viewBox="0 0 19 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path class="similar-channels-notch-path" fill-rule="evenodd" clip-rule="evenodd" d="M19 7C16.8992 7 13.59 3.88897 11.5003 1.67424C10.7648 0.894688 10.397 0.50491 10.0434 0.385149C9.70568 0.270811 9.4225 0.270474 9.08456 0.38401C8.73059 0.50293 8.36133 0.892443 7.62279 1.67147C5.52303 3.88637 2.18302 7 0 7L19 7Z" />
      </svg>
      <div class="similar-channels-header">
        {i18n('SimilarChannels')}
        <ButtonIconTsx icon="close" onClick={props.onClose} />
      </div>
      <ScrollableXTsx>
        <div class="similar-channels-list-margin"></div>
        {list()}
        <div class="similar-channels-list-margin"></div>
      </ScrollableXTsx>
    </div>
  );
}
