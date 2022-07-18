/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import tsNow from "../../helpers/tsNow";
import { LangPackKey } from "../../lib/langPack";
import { MUTE_UNTIL } from "../../lib/mtproto/mtproto_config";
import RadioField from "../radioField";
import Row, { RadioFormFromRows } from "../row";
import PopupPeer from "./peer";

const ONE_HOUR = 3600;
const times: {time: number, langKey: LangPackKey}[] = [{
  time: ONE_HOUR, 
  langKey: 'ChatList.Mute.1Hour'
}, {
  time: ONE_HOUR * 4, 
  langKey: 'ChatList.Mute.4Hours'
}, {
  time: ONE_HOUR * 8, 
  langKey: 'ChatList.Mute.8Hours'
}, {
  time: ONE_HOUR * 24, 
  langKey: 'ChatList.Mute.1Day'
}, {
  time: ONE_HOUR * 24 * 3,
  langKey: 'ChatList.Mute.3Days'
}, {
  time: -1,
  langKey: 'ChatList.Mute.Forever'
}];

export default class PopupMute extends PopupPeer {
  constructor(peerId: PeerId) {
    super('popup-mute', {
      peerId,
      titleLangKey: 'Notifications',
      buttons: [{
        langKey: 'ChatList.Context.Mute',
        callback: () => {
          this.managers.appMessagesManager.mutePeer(peerId, time === -1 ? MUTE_UNTIL : tsNow(true) + time);
        }
      }],
      body: true
    });

    const name = 'mute-time';
    const rows = times.map((time) => {
      const row = new Row({
        radioField: new RadioField({
          langKey: time.langKey, 
          name, 
          value: '' + time.time
        })
      });

      return row;
    });

    let time: number;
    const radioForm = RadioFormFromRows(rows, (value) => {
      time = +value;
    });

    this.body.append(radioForm);

    rows[rows.length - 1].radioField.checked = true;

    this.show();
  }
}
