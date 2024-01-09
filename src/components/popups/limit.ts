/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey} from '../../lib/langPack';
import {ApiLimitType} from '../../lib/mtproto/api_methods';
import rootScope from '../../lib/rootScope';
import PopupPeer from './peer';
import LimitLine from '../limit';
import PopupPremium from './premium';

const a: {[type in ApiLimitType]?: {
  title: LangPackKey,
  description: LangPackKey,
  descriptionPremium: LangPackKey,
  descriptionLocked: LangPackKey,
  icon: Icon
}} = {
  pin: {
    title: 'LimitReached',
    description: 'LimitReachedPinDialogs',
    descriptionPremium: 'LimitReachedPinDialogsPremium',
    descriptionLocked: 'LimitReachedPinDialogsLocked',
    icon: 'limit_pin'
  },
  folders: {
    title: 'LimitReached',
    description: 'LimitReachedFolders',
    descriptionPremium: 'LimitReachedFoldersPremium',
    descriptionLocked: 'LimitReachedFoldersLocked',
    icon: 'limit_folders'
  },
  folderPeers: {
    title: 'LimitReached',
    description: 'LimitReachedChatInFolders',
    descriptionPremium: 'LimitReachedChatInFoldersPremium',
    descriptionLocked: 'LimitReachedChatInFoldersLocked',
    icon: 'limit_folders'
  },
  chatlistInvites: {
    title: 'LimitReached',
    description: 'LimitReachedSharedFolderInvites',
    descriptionPremium: 'LimitReachedSharedFolderInvitesPremium',
    descriptionLocked: 'LimitReachedSharedFolderInvitesLocked',
    icon: 'limit_link'
  },
  savedPin: {
    title: 'LimitReached',
    description: 'LimitReachedPinDialogs',
    descriptionPremium: 'LimitReachedPinDialogsPremium',
    descriptionLocked: 'LimitReachedPinDialogsLocked',
    icon: 'limit_pin'
  }
};

class P extends PopupPeer {
  constructor(options: {
    isPremium: boolean,
    limit: number,
    limitPremium: number,
    feature?: PremiumPromoFeatureType
  }, _a: typeof a[keyof typeof a]) {
    super('popup-limit', {
      buttons: options.isPremium === undefined ? [{
        langKey: 'LimitReached.Ok',
        isCancel: true
      }] : (options.isPremium ? [{
        langKey: 'OK',
        isCancel: true
      }] : [{
        langKey: 'IncreaseLimit',
        callback: () => {
          PopupPremium.show({feature: options.feature});
        },
        iconRight: 'premium_double'
      }, {
        langKey: 'Cancel',
        isCancel: true
      }]),
      descriptionLangKey: options.isPremium === undefined ? _a.descriptionLocked : (options.isPremium ? _a.descriptionPremium : _a.description),
      descriptionLangArgs: options.isPremium ? [options.limitPremium] : [options.limit, options.limitPremium],
      titleLangKey: _a.title
    });

    const limit = new LimitLine({
      limitPremium: options.limitPremium,
      hint: {
        icon: _a.icon,
        content: '' + (options.isPremium ? options.limitPremium : options.limit)
      }
    });

    if(options.isPremium !== undefined) {
      limit.setProgress(options.isPremium ? 1 : 0.5);
    } else {
      const limitLine = limit.container.querySelector('.limit-line');
      limitLine?.remove();
    }

    this.description.before(limit.container);

    // if(options.isPremium === false) {
    //   this.buttons.pop().element.remove();
    // }

    limit._setHintActive();
  }
}

export default async function showLimitPopup(type: keyof typeof a) {
  // const featureMap: {[type in keyof typeof a]?: PremiumPromoFeatureType} = {
  //   folders: 'double_limits',
  //   pin: 'double_limits',
  //   chatlistInvites: 'double_limits'
  // };
  const feature: PremiumPromoFeatureType = 'double_limits';

  const _a = a[type];
  const [appConfig, limit, limitPremium] = await Promise.all([
    rootScope.managers.apiManager.getAppConfig(),
    ...[false, true].map((v) => rootScope.managers.apiManager.getLimit(type, v))
  ]);
  const isLocked = appConfig.premium_purchase_blocked;
  new P({
    isPremium: isLocked ? undefined : rootScope.premium,
    limit,
    limitPremium,
    // feature: featureMap[type]
    feature
  }, _a).show();
}
