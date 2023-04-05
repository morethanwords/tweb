/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import liteMode from '../../helpers/liteMode';
import {doubleRaf} from '../../helpers/schedulers';
import appImManager from '../../lib/appManagers/appImManager';
import {LangPackKey, _i18n, i18n} from '../../lib/langPack';
import {ApiLimitType} from '../../lib/mtproto/api_methods';
import rootScope from '../../lib/rootScope';
import PopupPeer from './peer';

const a: {[type in ApiLimitType]?: {
  title: LangPackKey,
  description: LangPackKey,
  descriptionPremium: LangPackKey,
  descriptionLocked: LangPackKey,
  icon: string
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
  chatlistInvites: {
    title: 'LimitReached',
    description: 'LimitReachedSharedFolderInvites',
    descriptionPremium: 'LimitReachedSharedFolderInvitesPremium',
    descriptionLocked: 'LimitReachedSharedFolderInvitesLocked',
    icon: 'limit_link'
  }
};

class P extends PopupPeer {
  constructor(options: {
    isPremium: boolean,
    limit: number,
    limitPremium: number
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
          appImManager.openPremiumBot();
        },
        noRipple: true
      }, {
        langKey: 'Cancel',
        isCancel: true
      }]),
      descriptionLangKey: options.isPremium === undefined ? _a.descriptionLocked : (options.isPremium ? _a.descriptionPremium : _a.description),
      descriptionLangArgs: options.isPremium ? [options.limitPremium] : [options.limit, options.limitPremium],
      titleLangKey: _a.title
    });

    const isLocked = options.isPremium === undefined;
    if(isLocked) {
      this.element.classList.add('is-locked');
    } else if(options.isPremium) {
      this.element.classList.add('is-premium');
    } else {
      const button = this.buttons.find((b) => !b.isCancel);
      button.element.classList.add('popup-limit-button', 'shimmer');
      const i = document.createElement('i');
      i.classList.add('popup-limit-button-icon', 'tgico-premium_double');
      button.element.append(i);
    }

    const limitContainer = document.createElement('div');
    limitContainer.classList.add('popup-limit-line');

    const hint = document.createElement('div');
    hint.classList.add('popup-limit-hint');
    const i = document.createElement('span');
    i.classList.add('popup-limit-hint-icon', 'tgico-' + _a.icon);
    hint.append(i, '' + (options.isPremium ? options.limitPremium : options.limit));

    limitContainer.append(hint);

    if(!isLocked) {
      const limit = document.createElement('div');
      limit.classList.add('limit-line');

      const free = document.createElement('div');
      free.classList.add('limit-line-free');

      const premium = document.createElement('div');
      premium.classList.add('limit-line-premium');

      limit.append(free, premium);

      _i18n(free, 'LimitFree');
      premium.append(i18n('LimitPremium'), '' + options.limitPremium);

      limitContainer.append(limit);
    }

    this.container.insertBefore(limitContainer, this.description);

    // if(options.isPremium === false) {
    //   this.buttons.pop().element.remove();
    // }

    const setHintActive = () => {
      hint.classList.add('active');
    };

    if(liteMode.isAvailable('animations')) {
      doubleRaf().then(setHintActive);
    } else {
      setHintActive();
    }
  }
}

export default async function showLimitPopup(type: keyof typeof a) {
  const _a = a[type];
  const [appConfig, limit, limitPremium] = await Promise.all([
    rootScope.managers.apiManager.getAppConfig(),
    ...[false, true].map((v) => rootScope.managers.apiManager.getLimit(type, v))
  ]);
  const isLocked = appConfig.premium_purchase_blocked;
  new P({
    isPremium: isLocked ? undefined : rootScope.premium,
    limit,
    limitPremium
  }, _a).show();
}
