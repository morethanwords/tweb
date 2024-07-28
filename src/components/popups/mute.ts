/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import tsNow from '../../helpers/tsNow';
import {LangPackKey} from '../../lib/langPack';
import {MUTE_UNTIL} from '../../lib/mtproto/mtproto_config';
import {RadioFormFromValues} from '../row';
import PopupPeer from './peer';

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
  constructor(peerId: PeerId, threadId?: number) {
    super('popup-mute', {
      peerId,
      titleLangKey: 'Notifications',
      buttons: [{
        langKey: 'ChatList.Context.Mute',
        callback: () => {
          this.managers.appMessagesManager.mutePeer({peerId, muteUntil: time === -1 ? MUTE_UNTIL : tsNow(true) + time, threadId});
        }
      }],
      body: true
    });

    let time: number;
    const radioForm = RadioFormFromValues(times, (value) => {
      time = +value;
    }, true);

    this.body.append(radioForm);

    this.show();
  }
}
