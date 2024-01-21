/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {LangPackKey} from '../../lib/langPack';
import {RadioFormFromValues} from '../row';
import PopupPeer from './peer';

export default class PopupOutput extends PopupPeer {
  private id: string;
  constructor(callback: (val: string) => void) {
    super('popup-output-device', {
      titleLangKey: 'CallSettings.Output.Text',
      buttons: [{
        langKey: 'ChatList.Context.Mute',
        callback: () => callback(this.id)
      }],
      body: true,
      noCancel: true
    });
    this.renderDevices();
  }

  private async renderDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices().then(devices => devices
    .filter(device => device.kind === 'audiooutput')
    .map(device => ({value: device.deviceId, checked: device.deviceId === 'default', langPackKey: (device.deviceId === 'default' ? 'Default' :  device.label) as LangPackKey}))
    );
    const radioForm = RadioFormFromValues(devices, (value) => this.id = value);
    this.body.append(radioForm);
    this.show();
  }
}
