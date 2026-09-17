import tsNow from '@helpers/tsNow';
import {LangPackKey} from '@lib/langPack';
import {MUTE_UNTIL} from '@appManagers/constants';
import RadioFormTsx from '@components/radioFormTsx';
import showPeerPopup from '@components/popups/peer';
import createCommunityAvatarElement from '@components/communities/communityAvatarElement';
import {createComponent} from 'solid-js';
import rootScope from '@lib/rootScope';

const ONE_HOUR = 3600;
const times: {value: number | string, langPackKey: LangPackKey, checked?: boolean}[] = [{
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
  value: -1,
  langPackKey: 'ChatList.Mute.Forever',
  checked: true
}];

export default function showMutePopup(
  peerId?: PeerId,
  threadId?: number,
  communityId?: ChatId
) {
  // a Community can't go through `peerId`: its avatar is the decorated one, built here
  // so the popup looks like every other mute popup instead of a bare title
  const communityAvatar = communityId ?
    createCommunityAvatarElement(communityId, 32) :
    undefined;

  let time = +times.find((option) => option.checked).value;

  showPeerPopup('popup-mute', {
    peerId: communityId ? undefined : peerId,
    avatar: communityAvatar?.element,
    titleLangKey: 'Notifications',
    buttons: [{
      langKey: 'ChatList.Context.Mute',
      callback: () => {
        const muteUntil = time === -1 ?
          MUTE_UNTIL :
          tsNow(true) + time;
        if(communityId) {
          rootScope.managers.appCommunitiesManager.muteCommunity(
            communityId,
            muteUntil
          );
        } else {
          rootScope.managers.appMessagesManager.mutePeer({
            peerId,
            muteUntil,
            threadId
          });
        }
      }
    }],
    content: createComponent(RadioFormTsx<number | string>, {
      values: times,
      onChange: (value) => {
        time = +value;
      }
    }),
    onCloseAfterTimeout: communityAvatar?.dispose
  });
}
