import PopupElement, {addCancelButton, createPopup, PopupButton} from '@components/popups/indexTsx';
import createBadge from '@helpers/createBadge';
import MediaHeader from '@components/mediaHeader';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import formatDuration from '@helpers/formatDuration';
import {PremiumBoostsStatus} from '@layer';
import appImManager from '@lib/appImManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import AppSelectPeers from '@components/appSelectPeers';
import confirmationPopup from '@components/confirmationPopup';
import LimitLine from '@components/limit';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import showPremiumPopup from '@components/popups/premium';
import showReassignBoostPopup from '@components/popups/reassignBoost';
import {toastNew} from '@components/toast';
import type {BoostReason} from '@components/openBoosts';
import {createEffect, createSignal, For, JSX, onCleanup} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';

const className = 'popup-boost';

export default async function showBoostPopup(peerId: PeerId, reason?: BoostReason) {
  const managers = rootScope.managers;
  const middlewareHelper = getMiddleware();

  const [boostsStatus, myBoosts, appConfig, isPremiumPurchaseBlocked, isBroadcast] = await Promise.all([
    managers.appBoostsManager.getBoostsStatus(peerId).catch(() => undefined as PremiumBoostsStatus),
    managers.appBoostsManager.getMyBoosts(),
    managers.apiManager.getAppConfig(),
    apiManagerProxy.isPremiumPurchaseBlocked(),
    managers.appPeersManager.isBroadcast(peerId)
  ]);

  if(!boostsStatus) {
    toastNew({langPackKey: 'CantBoostChat'});
    middlewareHelper.destroy();
    return;
  }

  const entity = AppSelectPeers.renderEntity({
    key: peerId,
    middleware: middlewareHelper.get(),
    avatarSize: 30
  });

  entity.element.classList.add(`${className}-entity`, 'selector-user-alone', 'hover-primary');

  const entityBoosts = createBadge('span', 20, 'premium');
  entityBoosts.classList.add(`${className}-entity-badge`);
  entity.element.append(entityBoosts);

  const descriptionPeerTitle = await wrapPeerTitle({peerId});
  await entity.avatar.readyThumbPromise;

  const limitLine = new LimitLine({
    progress: true,
    hint: {
      icon: 'boost_filled',
      noStartEnd: true
    }
  });

  const [show, setShow] = createSignal(true);
  const deferredCloseCallbacks: (() => void)[] = [];
  const hideWithCallback = (callback: () => void) => {
    deferredCloseCallbacks.push(callback);
    setShow(false);
  };

  createPopup(() => {
    // everything the copy and the buttons read; a boost applied in place updates them all
    const [status, setStatus] = createSignal(boostsStatus, {equals: false});
    const [boosts, setBoosts] = createSignal(myBoosts, {equals: false});
    const [updated, setUpdated] = createSignal(false);

    const hasStories = () => status().level > 0 || status().next_level_boosts === status().boosts;
    const needBoostsForNextLevel = () => status().next_level_boosts - status().boosts;
    const isMaxLevel = () => status().next_level_boosts === undefined;
    const hasMyBoost = () => !!status().pFlags.my_boost;
    const givenBoosts = () => boosts().my_boosts.filter((myBoost) => getPeerId(myBoost.peer) === peerId);

    // the reason only holds until the level is actually raised — after that the live
    // "you boosted it" / "reached level N" copy is the correct one again
    const showReason = () => !!reason && !isMaxLevel() && !updated();

    const title = (): JSX.Element => {
      if(showReason()) return i18n(reason.titleLangKey);
      if(hasMyBoost()) return i18n(isBroadcast ? 'YouBoostedChannel' : 'YouBoostedGroup');
      if(isMaxLevel()) return i18n('BoostsMaxLevelReached');
      if(hasStories()) return i18n(isBroadcast ? 'HelpUpgradeChannel' : 'HelpUpgradeGroup');
      return i18n('Boost.EnableStoriesFor');
    };

    const description = (): JSX.Element => {
      if(showReason()) {
        return i18n(reason.descriptionLangKey, reason.descriptionArgs);
      }

      if(updated() && status().level === 0 && hasStories()) {
        return i18n(isBroadcast ? 'Boost.DescriptionJustReachedLevel1' : 'Boost.DescriptionJustReachedLevel1.Group');
      }

      if(isMaxLevel() || (updated() && status().level > 0)) {
        return i18n(
          isBroadcast ? 'Boost.DescriptionJustReachedLevel' : 'Boost.DescriptionJustReachedLevel.Group',
          [
            status().level,
            i18n('Boost.StoriesCount', [status().level + 1])
          ]
        );
      }

      if(hasStories()) {
        return i18n(
          'ChannelNeedBoostsDescriptionForNewFeatures',
          [
            descriptionPeerTitle,
            i18n('MoreBoosts', [needBoostsForNextLevel()])
          ]
        );
      }

      return i18n(
        isBroadcast ? 'ChannelNeedBoostsDescriptionLevel1' : 'GroupNeedBoostsDescriptionLevel1',
        [i18n('MoreBoosts', [needBoostsForNextLevel()])]
      );
    };

    const handleErrorType = (type: ErrorType) => {
      if(type === 'PREMIUM_ACCOUNT_REQUIRED') {
        showPremiumNeeded();
      } else if(type.includes('FLOOD_WAIT')) {
        const wait = +type.split('_')[2];
        confirmationPopup({
          titleLangKey: 'CantBoostTooOften',
          descriptionLangKey: 'CantBoostTooOftenDescription',
          descriptionLangArgs: [wrapFormattedDuration(formatDuration(wait, 2), false)],
          button: {
            langKey: 'OK',
            isCancel: true
          }
        });
      } else if(type === 'PREMIUM_GIFTED_NOT_ALLOWED') {
        confirmationPopup({
          titleLangKey: 'CantBoostWithGiftedPremium',
          descriptionLangKey: 'CantBoostWithGiftedPremiumDescription',
          button: {
            langKey: 'OK',
            isCancel: true
          }
        });
      }
    };

    const showPremiumNeeded = () => {
      confirmationPopup({
        titleLangKey: 'PremiumNeeded',
        descriptionLangKey: 'PremiumNeededForBoosting',
        button: {
          langKey: 'Yes'
        }
      }).then(() => {
        showPremiumPopup();
      });
    };

    const onClick = async(e: MouseEvent) => {
      cancelEvent(e);
      try {
        const given = givenBoosts();
        const availableBoost = boosts().my_boosts.find((myBoost) => !myBoost.peer);
        let type: ApiError['type'];
        if(!rootScope.premium) {
          type = 'PREMIUM_ACCOUNT_REQUIRED';
        } else if(given.length === boosts().my_boosts.length) {
          await confirmationPopup({
            titleLangKey: 'BoostingMoreBoostsNeeded',
            descriptionLangKey: 'Boost.GetMoreBoosts',
            descriptionLangArgs: [
              appConfig.boosts_per_sent_gift ?? 1,
              await wrapPeerTitle({peerId})
            ],
            button: {
              langKey: 'GiftPremium'
            }
          });

          hideWithCallback(() => {
            appImManager.initGifting();
          });
          return;
        } else if(!availableBoost) {
          setShow(false);
          showReassignBoostPopup(peerId, boosts(), appConfig);
          return;
        }

        if(type) {
          throw {type};
        }

        await managers.appBoostsManager.applyBoost(peerId, [availableBoost.slot]);

        const [nextBoosts, nextStatus] = await Promise.all([
          managers.appBoostsManager.getMyBoosts(),
          managers.appBoostsManager.getBoostsStatus(peerId)
        ]);

        setUpdated(true);
        setBoosts(nextBoosts);
        setStatus(nextStatus);
      } catch(err) {
        handleErrorType((err as ApiError).type);
      }

      return false;
    };

    const buttons = () => {
      const button: PopupButton = isMaxLevel() || (givenBoosts().length === boosts().my_boosts.length && isPremiumPurchaseBlocked) ? {
        langKey: 'OK',
        isCancel: true
      } : {
        langKey: isBroadcast ? 'BoostChannel' : 'BoostGroup',
        iconLeft: 'boost_filled',
        callback: onClick
      };

      return addCancelButton([button]);
    };

    createEffect(() => {
      const status$ = status();
      const progress = isMaxLevel() ?
        1 :
        (status$.boosts - status$.current_level_boosts) / (status$.next_level_boosts - status$.current_level_boosts);

      limitLine.setProgress(
        progress,
        '' + status$.boosts,
        {
          from1: i18n('BoostsLevel', [status$.level]),
          to1: i18n('BoostsLevel', [status$.level + 1]),
          from2: i18n('BoostsLevel', [status$.level]),
          to2: i18n('BoostsLevel', [status$.level + 1])
        }
      );

      entityBoosts.textContent = `x${givenBoosts().length}`;
      entityBoosts.classList.toggle('is-badge-empty', !hasMyBoost());
    });

    const listenerSetter = new ListenerSetter();
    attachClickEvent(entity.element, () => {
      hideWithCallback(() => {
        appImManager.setInnerPeer({peerId});
      });
    }, {listenerSetter});

    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });
    limitLine._setHintActive();

    return (
      <PopupElement
        class={'popup-peer ' + className}
        closable
        old
        show={show()}
        onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
      >
        {limitLine.container}
        <MediaHeader.Title class={`${className}-title`} size={20}>{title()}</MediaHeader.Title>
        {entity.element}
        <MediaHeader.Subtitle class={`${className}-description`}>{description()}</MediaHeader.Subtitle>
        <PopupElement.Buttons>
          <For each={buttons()}>{(button) => (
            <PopupElement.Button
              langKey={button.langKey}
              danger={button.isDanger}
              cancel={button.isCancel}
              iconLeft={button.iconLeft}
              callback={button.callback}
            />
          )}</For>
        </PopupElement.Buttons>
      </PopupElement>
    );
  });
}
