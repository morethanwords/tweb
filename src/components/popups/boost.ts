/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement, {addCancelButton} from '.';
import createBadge from '../../helpers/createBadge';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import formatDuration from '../../helpers/formatDuration';
import {PremiumBoostsStatus} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import rootScope from '../../lib/rootScope';
import AppSelectPeers from '../appSelectPeers';
import confirmationPopup from '../confirmationPopup';
import LimitLine from '../limit';
import wrapPeerTitle from '../wrappers/peerTitle';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import PopupPeer from './peer';
import PopupPremium from './premium';
import PopupReassignBoost from './reassignBoost';

const className = 'popup-boost';

export default class PopupBoost extends PopupPeer {
  constructor(
    private peerId: PeerId
  ) {
    super(className, {
      closable: true,
      overlayClosable: true,
      description: true
    });

    this.btnClose.remove();
    this.header.remove();

    this.construct();
  }

  private async construct() {
    let [boostsStatus, myBoosts, appConfig, isPremiumPurchaseBlocked] = await Promise.all([
      this.managers.appBoostsManager.getBoostsStatus(this.peerId),
      this.managers.appBoostsManager.getMyBoosts(),
      this.managers.apiManager.getAppConfig(),
      apiManagerProxy.isPremiumPurchaseBlocked()
    ]);

    const entity = AppSelectPeers.renderEntity({
      key: this.peerId,
      middleware: this.middlewareHelper.get(),
      avatarSize: 30
    });

    entity.element.classList.add(`${className}-entity`, 'selector-user-alone', 'hover-primary');

    const entityBoosts = createBadge('span', 20, 'premium');
    entityBoosts.classList.add(`${className}-entity-badge`);
    entity.element.append(entityBoosts);

    attachClickEvent(entity.element, () => {
      this.hideWithCallback(() => {
        appImManager.setInnerPeer({peerId: this.peerId});
      });
    }, {listenerSetter: this.listenerSetter});

    const title = document.createElement('div');
    title.classList.add(`${className}-title`);

    const descriptionPeerTitle = await wrapPeerTitle({peerId: this.peerId});
    await entity.avatar.readyThumbPromise;

    let hasStories: boolean,
      needBoostsForNextLevel: number,
      isMaxLevel: boolean,
      hasMyBoost: boolean,
      updated = false;

    const setBoostsStatus = (_boostsStatus: PremiumBoostsStatus) => {
      boostsStatus = _boostsStatus;
      hasStories = boostsStatus.level > 0 || boostsStatus.next_level_boosts === boostsStatus.boosts;
      needBoostsForNextLevel = boostsStatus.next_level_boosts - boostsStatus.boosts;
      isMaxLevel = boostsStatus.next_level_boosts === undefined;
      hasMyBoost = !!boostsStatus.pFlags.my_boost;
    };

    const setTitle = () => {
      if(hasMyBoost) {
        title.replaceChildren(i18n('YouBoostedChannel'));
      } else if(isMaxLevel) {
        title.replaceChildren(i18n('BoostsMaxLevelReached'));
      } else if(hasStories) {
        title.replaceChildren(i18n('HelpUpgradeChannel'));
      } else {
        title.replaceChildren(i18n('Boost.EnableStoriesFor'));
      }
    };

    const setDescription = () => {
      if(updated && boostsStatus.level === 0 && hasStories) {
        this.description.replaceChildren(
          i18n(
            'Boost.DescriptionJustReachedLevel1'
          )
        );
      } else if(isMaxLevel || (updated && boostsStatus.level > 0)) {
        this.description.replaceChildren(
          i18n(
            'Boost.DescriptionJustReachedLevel',
            [
              boostsStatus.level,
              i18n('Boost.StoriesCount', [boostsStatus.level + 1])
            ]
          )
        );
      } else if(hasStories) {
        this.description.replaceChildren(
          i18n(
            'ChannelNeedBoostsDescriptionForNewFeatures',
            [
              descriptionPeerTitle,
              i18n('MoreBoosts', [needBoostsForNextLevel])
            ]
          )
        );
      } else {
        this.description.replaceChildren(
          i18n(
            'ChannelNeedBoostsDescriptionLevel1',
            [
              i18n('MoreBoosts', [needBoostsForNextLevel])
            ]
          )
        );
      }
    };

    const limitLine = new LimitLine({
      progress: true,
      hint: {
        icon: 'boost',
        noStartEnd: true
      }
    });
    this.description.before(limitLine.container, title, entity.element);

    const getGivenBoosts = () => {
      return myBoosts.my_boosts.filter((myBoost) => getPeerId(myBoost.peer) === this.peerId);
    };

    const setInfo = () => {
      const progress = isMaxLevel ?
        1 :
        (boostsStatus.boosts - boostsStatus.current_level_boosts) / (boostsStatus.next_level_boosts - boostsStatus.current_level_boosts);

      limitLine.setProgress(
        progress,
        '' + boostsStatus.boosts,
        {
          from1: i18n('BoostsLevel', [boostsStatus.level]),
          to1: i18n('BoostsLevel', [boostsStatus.level + 1]),
          from2: i18n('BoostsLevel', [boostsStatus.level]),
          to2: i18n('BoostsLevel', [boostsStatus.level + 1])
        }
      );
      setTitle();
      setDescription();
      setButtons();
      entityBoosts.textContent = `x${getGivenBoosts().length}`;
      entityBoosts.classList.toggle('is-badge-empty', !hasMyBoost);
    };

    const setButtons = () => {
      this.setButtons(addCancelButton([isMaxLevel || (getGivenBoosts().length === myBoosts.my_boosts.length && isPremiumPurchaseBlocked) ? {
        langKey: 'OK',
        isCancel: true
      } : {
        langKey: 'BoostChannel',
        iconLeft: 'boost',
        callback: onClick
      }]));
    };

    const handleErrorType = (type: ErrorType) => {
      if(type === 'PREMIUM_ACCOUNT_REQUIRED') {
        showPremiumNeeded();
      }/*  else if(type === 'BOOST_NOT_MODIFIED') {
        showAlreadyBoosting();
      } */ else if(type.includes('FLOOD_WAIT')) {
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
        PopupPremium.show();
      });
    };

    // const showAlreadyBoosting = () => {
    //   confirmationPopup({
    //     titleLangKey: 'Boost.Already',
    //     descriptionLangKey: 'Boost.AlreadyDescription',
    //     button: {
    //       langKey: 'OK',
    //       isCancel: true
    //     }
    //   });
    // };

    const onClick = async(e: MouseEvent) => {
      cancelEvent(e);
      try {
        const givenBoosts = getGivenBoosts();
        const availableBoost = myBoosts.my_boosts.find((myBoost) => !myBoost.peer);
        let type: ApiError['type'];
        if(!rootScope.premium) {
          type = 'PREMIUM_ACCOUNT_REQUIRED';
        } else if(givenBoosts.length === myBoosts.my_boosts.length) {
          await confirmationPopup({
            titleLangKey: 'BoostingMoreBoostsNeeded',
            descriptionLangKey: 'Boost.GetMoreBoosts',
            descriptionLangArgs: [
              await wrapPeerTitle({peerId: this.peerId}),
              appConfig.boosts_per_sent_gift ?? 1
            ],
            button: {
              langKey: 'GiftPremium'
            }
          });

          this.hideWithCallback(() => {
            appImManager.initGifting();
          });
          return;
        } else if(!availableBoost) {
          this.hide();
          PopupElement.createPopup(PopupReassignBoost, this.peerId, myBoosts, appConfig);
          return;
        }/*  else if(hasMyBoost) {
          type = 'BOOST_NOT_MODIFIED';
        } */

        if(type) {
          throw {type};
        }

        // const slots = [...givenBoosts, availableBoost].filter(Boolean).map((myBoost) => myBoost.slot);
        await this.managers.appBoostsManager.applyBoost(
          this.peerId,
          [availableBoost.slot]
        );

        [myBoosts, boostsStatus] = await Promise.all([
          this.managers.appBoostsManager.getMyBoosts(),
          this.managers.appBoostsManager.getBoostsStatus(this.peerId)
        ]);

        updated = true;
        setBoostsStatus(boostsStatus);
        setInfo();
      } catch(err) {
        handleErrorType((err as ApiError).type);
      }

      return false;
    };

    setBoostsStatus(boostsStatus);
    setInfo();
    limitLine._setHintActive();

    this.show();
  }
}
