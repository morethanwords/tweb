/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import tsNow from '@helpers/tsNow';
import {MUTE_UNTIL} from '@appManagers/constants';
import {RadioFormFromValues} from '@components/row';
import PopupPeer from '@components/popups/peer';

const ONE_HOUR = 3600;
const times: {value: number | string, langPackKey: any, checked?: boolean}[] = [{
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

export default class PopupBulkMute extends PopupPeer {
  constructor(peerIds: PeerId[], onMuted?: () => void) {
    let time: number;

    super('popup-mute', {
      titleLangKey: 'Notifications',
      buttons: [{
        langKey: 'ChatList.Context.Mute',
        callback: () => {
          const muteUntil = time === -1 ? MUTE_UNTIL : tsNow(true) + time;
          for(const peerId of peerIds) {
            this.managers.appMessagesManager.mutePeer({peerId, muteUntil});
          }
          onMuted?.();
        }
      }],
      body: true
    });

    const radioForm = RadioFormFromValues(times, (value) => {
      time = +value;
    }, true);

    this.body.append(radioForm);

    this.show();
  }
}
