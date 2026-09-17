import {LangPackKey} from '@lib/langPack';
import {ApiLimitType} from '@appManagers/apiManagerMethods';
import rootScope from '@lib/rootScope';
import showPeerPopup, {PopupPeerButton} from '@components/popups/peer';
import LimitLine from '@components/limit';
import showPremiumPopup from '@components/popups/premium';

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
    icon: 'limit_pin_filled'
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
    icon: 'limit_pin_filled'
  },
  channels: {
    title: 'LimitReached',
    description: 'LimitReachedCommunities',
    descriptionPremium: 'LimitReachedCommunitiesPremium',
    descriptionLocked: 'LimitReachedCommunitiesLocked',
    icon: 'limit_chat_filled'
  }
};

/** What `channelsTooMuch` needs to dress the popup: its own body, its buttons and the moment to show. */
export type LimitPopupContext = {
  body: HTMLElement,
  buttons: PopupPeerButton[],
  show: () => void,
  hide: () => void,
  onCloseAfterTimeout: (callback: () => void) => void
};

export default async function showLimitPopup(
  type: keyof typeof a,
  popupRef?: (context: LimitPopupContext) => void
) {
  const feature: PremiumPromoFeatureType = 'double_limits';

  const [appConfig, limit, limitPremium] = await Promise.all([
    rootScope.managers.apiManager.getAppConfig(),
    ...[false, true].map((v) => rootScope.managers.apiManager.getLimit(type, v))
  ]);
  const isLocked = appConfig.premium_purchase_blocked;
  const isPremium = isLocked ? undefined : rootScope.premium;
  const strings = a[type];

  const buttons: PopupPeerButton[] = isPremium === undefined ? [{
    langKey: 'LimitReached.Ok',
    isCancel: true
  }] : (isPremium ? [{
    langKey: 'OK',
    isCancel: true
  }] : [{
    langKey: 'IncreaseLimit',
    callback: () => {
      showPremiumPopup({feature});
    },
    iconRight: 'premium_double_filled'
  }, {
    langKey: 'Cancel',
    isCancel: true
  }]);

  const limitLine = new LimitLine({
    limitPremium,
    hint: {
      icon: strings.icon,
      content: '' + (isPremium ? limitPremium : limit)
    }
  });

  if(isPremium !== undefined) {
    limitLine.setProgress(isPremium ? 1 : 0.5);
  } else {
    limitLine.container.querySelector('.limit-line')?.remove();
  }

  // the picker `channelsTooMuch` builds lives here, where the popup body used to be
  const body = popupRef ? document.createElement('div') : undefined;
  body?.classList.add('popup-body');

  let onCloseAfterTimeout: () => void;
  const handle = showPeerPopup('popup-limit', {
    buttons,
    descriptionLangKey: isPremium === undefined ? strings.descriptionLocked : (isPremium ? strings.descriptionPremium : strings.description),
    descriptionLangArgs: isPremium ? [limitPremium] : [limit, limitPremium],
    titleLangKey: strings.title,
    contentBefore: limitLine.container,
    content: body,
    deferShow: !!popupRef,
    onCloseAfterTimeout: () => onCloseAfterTimeout?.()
  });

  limitLine._setHintActive();

  popupRef?.({
    body,
    buttons,
    show: handle.show,
    hide: handle.hide,
    onCloseAfterTimeout: (callback) => onCloseAfterTimeout = callback
  });
}
