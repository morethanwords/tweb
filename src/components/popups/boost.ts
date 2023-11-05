/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {addCancelButton} from '.';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import formatDuration from '../../helpers/formatDuration';
import {PremiumBoostsStatus} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import AppSelectPeers from '../appSelectPeers';
import confirmationPopup from '../confirmationPopup';
import LimitLine from '../limit';
import wrapPeerTitle from '../wrappers/peerTitle';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import PopupPeer from './peer';
import PopupPremium from './premium';

const className = 'popup-boost';

export default class PopupBoost extends PopupPeer {
  constructor(
    private peerId: PeerId
  ) {
    super(className, {
      closable: true,
      overlayClosable: true,
      title: ' ',
      description: true
    });

    this.btnClose.remove();

    this.construct();
  }

  private async construct() {
    let [boostsStatus] = await Promise.all([
      this.managers.appBoostsManager.getBoostsStatus(this.peerId)
    ]);

    console.log(boostsStatus);

    const entity = AppSelectPeers.renderEntity({
      key: this.peerId,
      middleware: this.middlewareHelper.get(),
      avatarSize: 30
    });

    entity.element.classList.add('popup-boost-entity', 'selector-user-alone', 'hover-primary');

    attachClickEvent(entity.element, () => {
      this.addEventListener('closeAfterTimeout', () => {
        appImManager.setInnerPeer({peerId: this.peerId});
      });
      this.hide();
    }, {listenerSetter: this.listenerSetter});

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
        this.title.replaceChildren(i18n('YouBoostedChannel2', [entity.element]));
      } else if(isMaxLevel) {
        this.title.replaceChildren(i18n('BoostsMaxLevelReached'));
      } else if(hasStories) {
        this.title.replaceChildren(i18n('HelpUpgradeChannel'));
      } else {
        this.title.replaceChildren(i18n('Boost.EnableStoriesFor'), entity.element);
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
            'Boost.DescriptionNextLevel',
            [
              descriptionPeerTitle,
              i18n('MoreBoosts', [needBoostsForNextLevel]),
              i18n('Boost.StoriesCount', [boostsStatus.level + 1])
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
    this.description.before(limitLine.container);

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
    };

    const setButtons = () => {
      this.setButtons(addCancelButton([isMaxLevel || (hasMyBoost && updated) ? {
        langKey: 'OK'
      } : {
        langKey: 'BoostChannel',
        iconLeft: 'boost',
        callback: onClick
      }]));
    };

    const handleErrorType = (type: ApiError['type']) => {
      if(type === 'PREMIUM_ACCOUNT_REQUIRED') {
        showPremiumNeeded();
      } else if(type === 'BOOST_NOT_MODIFIED') {
        showAlreadyBoosting();
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
        PopupPremium.show();
      });
    };

    const showAlreadyBoosting = () => {
      confirmationPopup({
        titleLangKey: 'Boost.Already',
        descriptionLangKey: 'Boost.AlreadyDescription',
        button: {
          langKey: 'OK',
          isCancel: true
        }
      });
    };

    const onClick = async(e: MouseEvent) => {
      cancelEvent(e);
      try {
        let type: ApiError['type'];
        if(!rootScope.premium) {
          type = 'PREMIUM_ACCOUNT_REQUIRED';
        } else if(hasMyBoost) {
          type = 'BOOST_NOT_MODIFIED';
        }

        if(type) {
          throw {type};
        }

        // const canApplyBoostResult = await this.managers.appStoriesManager.canApplyBoost(this.peerId);
        // console.log(canApplyBoostResult);
        // if(canApplyBoostResult._ === 'stories.canApplyBoostReplace') {
        //   await confirmationPopup({
        //     titleLangKey: 'Boost.Replace',
        //     descriptionLangKey: 'ReplaceBoostChannelDescription',
        //     descriptionLangArgs: [
        //       await wrapPeerTitle({peerId: getPeerId(canApplyBoostResult.current_boost)}),
        //       await wrapPeerTitle({peerId: this.peerId})
        //     ],
        //     button: {
        //       langKey: 'Boost.Replace'
        //     }
        //   });
        // }

        await this.managers.appBoostsManager.applyBoost(this.peerId);
        // boostsStatus = await this.managers.appStoriesManager.getBoostsStatus(this.peerId);
        // setBoostsStatus(boostsStatus);
        updated = true;
        setBoostsStatus({
          ...boostsStatus,
          boosts: boostsStatus.boosts + 1,
          pFlags: {
            ...boostsStatus.pFlags,
            my_boost: true
          }
          // level: boostsStatus.level + 1,
          // next_level_boosts: boostsStatus.next_level_boosts + 1,
          // current_level_boosts: boostsStatus.current_level_boosts + 1
        });
        setInfo();

        // if(canApplyBoostResult._ === 'stories.canApplyBoostOk') {
        // await this.managers.appStoriesManager.applyBoost(this.peerId);
        // }
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
