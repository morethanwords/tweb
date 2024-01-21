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
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import InputField from '../inputField';
import CheckboxField from '../checkboxField';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';

let currentPopup: PopupRecordStream;

export default class PopupRecordStream extends PopupElement {
  private video = true;
  private videoMode: 'landscape' | 'portrait' = 'landscape';
  constructor(private callback?: (params: { title: string, video: boolean, videoMode?: 'landscape' | 'portrait' }) => void) {
    super('popup-rtmp-record-setup', {
      closable: true,
      withConfirm: 'VoiceChat.StartRecording',
      body: true,
      title: 'VoiceChat.StartRecording'
    });

    void this.construct();
  }

  private async construct() {
    const titleInputField = new InputField({
      label: 'VoiceChat.RTMP.Record.Stream.Title',
      name: 'create-record-title',
      required: true
    });
    this.body.append(titleInputField.container);

    titleInputField.input.addEventListener('input', () => {
      console.log(titleInputField.isValid());
      if(titleInputField.isValid()) {
        this.btnConfirm.classList.remove('disabled');
      } else {
        this.btnConfirm.classList.add('disabled');
      }
    });

    this.addText('VoiceChat.RTMP.Record.Stream');
    this.addText('VoiceChat.RTMP.Record.Stream.Participants.Info');
    const [preview, label] = this.createRecordPreview();
    this.addRow(video => {
      this.video = video;
      this.renderVisuals(preview, label, video);
    });

    this.btnConfirm.classList.add('popup-confirm', 'disabled');
    this.body.append(this.btnConfirm);
    attachClickEvent(this.btnConfirm, () => this.hideWithCallback(() => this.callback({title: titleInputField.value, video: this.video, ...(this.video && {videoMode: this.videoMode})})), {listenerSetter: this.listenerSetter});

    currentPopup = this;
  }

  private createRecordPreview() {
    const visuals = document.createElement('div');
    visuals.classList.add('record-preview');
    const preview = document.createElement('div');
    preview.classList.add('preview');
    preview.append('test');

    const labelPreview = document.createElement('div');
    labelPreview.classList.add('lpreview-label');
    const label = document.createElement('span');
    label.classList.add('popup-info');
    label.append('-');
    labelPreview.append(label);

    visuals.append(preview);
    visuals.append(labelPreview);
    this.body.append(visuals)
    return [preview, label];
  }

  private renderVisual(svg: string, className: string) {
    const div = document.createElement('div');
    div.classList.add(className);
    const img = document.createElement('img');
    renderImageFromUrl(img, svg);
    div.append(img);
    return div;
  }

  private renderVisuals(preview: HTMLElement, label: HTMLElement, video: boolean) {
    console.log('render visuals');

    if(video) {
      const landscape = this.renderVisual('assets/img/recording/recording_info_video_landscape.svg', 'record-preview-video-landscape');
      const portrait = this.renderVisual('assets/img/recording/recording_info_video_portrait.svg', 'record-preview-video-portrait');
      if(this.videoMode === 'landscape') {
        landscape.classList.add('active');
      } else {
        portrait.classList.add('active');
      }
      landscape.addEventListener('click', () => {
        this.videoMode = 'landscape';
        landscape.classList.add('active');
        portrait.classList.remove('active');
      });
      portrait.addEventListener('click', () => {
        this.videoMode = 'portrait';
        landscape.classList.remove('active');
        portrait.classList.add('active');
      });
      preview.replaceChildren(landscape, portrait);
    } else {
      const div = this.renderVisual('assets/img/recording/recording_info_audio.svg', 'record-preview-audio');
      preview.replaceChildren(div);
    }

    label.replaceChildren(i18n(video ? 'VoiceChat.RTMP.Record.Stream.Choose.Orientation' : 'VoiceChat.RTMP.Record.Stream.Audio'));
  }

  private addText(...keys: LangPackKey[]) {
    const node = document.createElement('section');
    node.classList.add('popup-info');
    keys.forEach(key => node.append(i18n(key), ' '));
    this.body.append(node);
  }

  private addRow(onChange: (video: boolean) => void) {
    const node = document.createElement('section');
    node.classList.add('popup-data-row');
    const iconNode = Icon('videocamera');
    const label = document.createElement('div');
    label.classList.add('label-row');
    label.append(i18n('VoiceChat.RTMP.Record.Stream.Also.Video'));

    const checkboxField = new CheckboxField({toggle: true, listenerSetter: this.listenerSetter});
    checkboxField.input.addEventListener('change', () => onChange(checkboxField.checked));
    onChange(checkboxField.checked);

    node.append(iconNode);
    node.append(label);
    node.append(checkboxField.label);
    this.body.lastElementChild.before(node);
  }
}

(window as any).PopupRecordStream = PopupRecordStream;
