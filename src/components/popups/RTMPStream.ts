/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {i18n, LangPackKey} from '../../lib/langPack';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import {AppImManager} from '../../lib/appManagers/appImManager';
import ButtonIcon from '../buttonIcon';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {attachClickEvent} from '../../helpers/dom/clickEvent';

let currentPopup: PopupRTMPStream;

export default class PopupRTMPStream extends PopupElement {
  private urlNode: HTMLSpanElement;
  private keyNode: HTMLSpanElement;
  private hidden = true;
  private savedCredentials: { key: string, url: string } = null;
  private randomHiddenKey = [...Array(10 + Math.floor(Math.random() * 20))].map(() => '.').join('');

  constructor(private peerId: number, private manager: AppImManager) {
    super('popup-rtmp-setup', {
      closable: true,
      withConfirm: 'CreateExternalStream.StartStreaming',
      body: true,
      title: 'VoiceChat.RTMP.Title'
    });

    void this.construct();
  }

  // this.chat.appImManager.joinGroupCall(this.peerId);

  private async construct() {
    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'flip',
        text: 'VoiceChat.RTMP.StreamKey.Revoke',
        onClick: () => this.getCredentials(true)
      }]
    });

    this.header.append(btnMenu);

    this.addText('VoiceChat.RTMP.Info', 'VoiceChat.RTMP.Desc');

    this.urlNode = this.addDataRow('link', 'VoiceChat.RTMP.ServerURL');
    this.keyNode = this.addDataRow('lock', 'VoiceChat.RTMP.StreamKey', true);

    this.addText('CreateExternalStream.StartStreamingInfo');

    this.btnConfirm.classList.add('popup-confirm')
    this.body.append(this.btnConfirm);

    attachClickEvent(this.btnConfirm, () => this.startRMPStream(), {listenerSetter: this.listenerSetter});

    this.getCredentials();
    currentPopup = this;
  }

  private startRMPStream() {
    console.log('started stream');
    this.manager.joinRTMPStream(this.peerId).then(console.warn);
  }

  private getCredentials(revoke = false) {
    this.manager.getRTMPCredentials(this.peerId, revoke).then(({key, url}) => {
      this.savedCredentials = {url, key};
      this.renderCredentials();
    });
  }

  private renderCredentials() {
    this.keyNode.innerText = this.hidden ? this.randomHiddenKey : this.savedCredentials.key;
    this.urlNode.innerText = this.savedCredentials.url;
  }

  private addText(...keys: LangPackKey[]) {
    const node = document.createElement('section');
    node.classList.add('popup-info');
    keys.forEach(key => node.append(i18n(key), ' '));
    this.body.append(node);
  }

  private addDataRow(icon: Icon, key: LangPackKey, password = false): HTMLSpanElement {
    const iconNode = Icon(icon);
    const copyNode = ButtonIcon('copy', {asDiv: true});
    copyNode.classList.add('copy');
    copyNode.addEventListener('click', () => {
      copyTextToClipboard(password ? this.savedCredentials.key : this.savedCredentials.url);
    });
    const eyeNode = Icon('eye1', 'eye'); // eye2
    eyeNode.addEventListener('click', () => {
      this.hidden = !this.hidden;
      const tempEye = Icon(this.hidden ? 'eye1' : 'eye2');
      eyeNode.innerHTML = tempEye.innerHTML;
      this.renderCredentials();
    })
    const middle = document.createElement('div');
    middle.classList.add('popup-data-row-info');
    const dataNode = document.createElement('span');
    dataNode.classList.add('data-node')
    dataNode.append('-');
    middle.append(dataNode);
    const label = document.createElement('div');
    label.classList.add('label-row');
    label.append(i18n(key));
    if(password) {
      label.append(eyeNode);
    }
    middle.append(label);

    const node = document.createElement('section');
    node.classList.add('popup-data-row');
    node.append(iconNode);
    node.append(middle);
    node.append(copyNode);
    this.body.append(node);
    return dataNode;
  }
}

(window as any).PopupRTMPStream = PopupRTMPStream;
