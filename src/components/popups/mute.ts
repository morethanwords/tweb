import tsNow from '@helpers/tsNow';
import {LangPackKey} from '@lib/langPack';
import {MUTE_UNTIL} from '@appManagers/constants';
import {RadioFormFromValues} from '@components/row';
import PopupPeer from '@components/popups/peer';
import createCommunityAvatarElement
from '@components/communities/communityAvatarElement';

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

export default class PopupMute extends PopupPeer {
  constructor(
    peerId?: PeerId,
    threadId?: number,
    communityId?: ChatId
  ) {
    // a Community can't go through `peerId`: its avatar is the decorated one, built here
    // so the popup looks like every other mute popup instead of a bare title
    const communityAvatar = communityId ?
      createCommunityAvatarElement(communityId, 32) :
      undefined;
    super('popup-mute', {
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
            this.managers.appCommunitiesManager.muteCommunity(
              communityId,
              muteUntil
            );
          } else {
            this.managers.appMessagesManager.mutePeer({
              peerId,
              muteUntil,
              threadId
            });
          }
        }
      }],
      body: true
    });

    if(communityAvatar) {
      this.addEventListener('closeAfterTimeout', communityAvatar.dispose);
    }

    let time: number;
    const radioForm = RadioFormFromValues(times, (value) => {
      time = +value;
    }, true);

    this.body.append(radioForm);

    this.show();
  }
}
