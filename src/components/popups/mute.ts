import tsNow from '@helpers/tsNow';
import I18n, {LangPackKey} from '@lib/langPack';
import {MUTE_UNTIL} from '@appManagers/constants';
import RadioFormTsx from '@components/radioFormTsx';
import showPeerPopup, {PopupPeerButton} from '@components/popups/peer';
import showDatePickerPopup from '@components/popups/datePicker';
import createCommunityAvatarElement from '@components/communities/communityAvatarElement';
import {createComponent} from 'solid-js';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

const ONE_HOUR = 3600;
const FOREVER = -1;
// * tdesktop's "Mute for...": a time of the user's own, picked in the date picker
const CUSTOM = 0;
const times: {value: number, langPackKey: LangPackKey, checked?: boolean}[] = [{
  value: ONE_HOUR,
  langPackKey: 'ChatList.Mute.1Hour'
}, {
  value: ONE_HOUR * 4,
  langPackKey: 'ChatList.Mute.4Hours'
}, {
  value: ONE_HOUR * 8,
  langPackKey: 'ChatList.Mute.8Hours'
}, {
  value: ONE_HOUR * 24,
  langPackKey: 'ChatList.Mute.1Day'
}, {
  value: ONE_HOUR * 24 * 3,
  langPackKey: 'ChatList.Mute.3Days'
}, {
  value: FOREVER,
  langPackKey: 'ChatList.Mute.Forever',
  checked: true
}, {
  value: CUSTOM,
  langPackKey: 'MuteForPopup'
}];

/**
 * Every "Mute" of a chat, a topic or a Community — the chat list, the top bar, the profile — as tdesktop's mute
 * menu (`menu/menu_mute.cpp`): a duration, one of the user's own, and the chat's sound off or back on
 */
export default function showMutePopup(
  peerId?: PeerId,
  threadId?: number,
  communityId?: ChatId
) {
  const managers = bindManagersToSession(rootScope.managers);

  // a Community can't go through `peerId`: its avatar is the decorated one, built here
  // so the popup looks like every other mute popup instead of a bare title
  const communityAvatar = communityId ?
    createCommunityAvatarElement(communityId, 32) :
    undefined;

  let time = times.find((option) => option.checked).value;

  const mute = (muteUntil: number) => {
    if(communityId) {
      managers.appCommunitiesManager.muteCommunity(communityId, muteUntil);
    } else {
      managers.appMessagesManager.mutePeer({peerId, muteUntil, threadId});
    }
  };

  const buttons: PopupPeerButton[] = [{
    langKey: 'ChatList.Context.Mute',
    callback: () => {
      if(time !== CUSTOM) {
        mute(time === FOREVER ? MUTE_UNTIL : tsNow(true) + time);
        return;
      }

      showDatePickerPopup({
        initDate: new Date(),
        addMinutes: true,
        minDate: new Date(),
        withTime: true,
        btnConfirmLangKey: 'ChatList.Context.Mute',
        onPick: (muteUntil) => {
          // * a time already gone mutes nothing, as iOS's picker closes then: sent, it would end the chat's mute
          if(muteUntil > tsNow(true)) {
            mute(muteUntil);
          }
        }
      });
    }
  }];

  // * a Community's sound is its chats' own
  const soundTarget = communityId ? undefined : {peerId, threadId};
  let soundOff: boolean;
  const soundLabel = soundTarget && new I18n.IntlElement();
  if(soundTarget) {
    buttons.push({
      text: soundLabel.element,
      callback: () => {
        managers.appNotificationsManager.setPeerSoundOff(soundTarget, !soundOff);
      }
    });
  }

  const popup = showPeerPopup('popup-mute', {
    peerId: communityId ? undefined : peerId,
    avatar: communityAvatar?.element,
    titleLangKey: 'Notifications',
    // * shown once the sound button knows which way it goes
    deferShow: !!soundTarget,
    buttons,
    content: createComponent(RadioFormTsx<number | string>, {
      values: times,
      onChange: (value) => {
        time = +value;
      }
    }),
    onCloseAfterTimeout: communityAvatar?.dispose
  });

  if(soundTarget) {
    managers.appNotificationsManager.isPeerSoundOff(soundTarget)
    .catch(() => false)
    .then((off) => {
      soundOff = !!off;
      soundLabel.update({key: soundOff ? 'SoundOn' : 'SoundOff'});
      popup.show();
    });
  }
}
