import {Show, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {InputFieldTsx} from '../inputFieldTsx';
import PopupElement from '../popups';

import Row from '../rowTsx';
import CheckboxField from '../checkboxField';

import imgRecordAudio from './assets/recordAudio.svg';
import imgVideoVertical from './assets/videoVertical.svg';
import imgVideoHorizontal from './assets/videoHorizontal.svg';

import {Transition} from 'solid-transition-group';
import {Ripple} from '../rippleTsx';
import classNames from '../../helpers/string/classNames';
import {CallRecordParams} from '../../lib/appManagers/appGroupCallsManager';
import {toastNew} from '../toast';
import rtmpCallsController from '../../lib/calls/rtmpCallsController';

import './recordPopup.css';
import {i18n} from '../../lib/langPack';

const cnPopup = (className = '') => `rtmp-record-popup${className}`;

export class RtmpRecordPopup extends PopupElement {
  private _dispose: () => void;

  constructor() {
    super(cnPopup(), {
      overlayClosable: true,
      closable: true,
      title: true,
      body: true
    });

    this.title.append(i18n('Rtmp.RecordPopup.Title'));
    this._dispose = render(() => (
      <RtmpRecordPopupContent onSubmit={this._onSubmit} />
    ), this.body);
    // if(!document.documentElement.classList.contains('night')) {
    //   this.element.classList.remove('night')
    // }
  }

  private _onSubmit = (params: CallRecordParams) => {
    this.forceHide();
    this.managers.appGroupCallsManager.startRecording(
      rtmpCallsController.currentCall.inputCall,
      params
    ).catch(() => {
      toastNew({
        langPackKey: 'Rtmp.RecordPopup.Failed'
      });
    });
  }

  cleanup() {
    super.cleanup();
    this._dispose();
  }
}

interface RtmpRecordPopupContentProps {
  onSubmit(params: CallRecordParams): void;
}

const TITLE_MAX_LENGTH = 40

const RtmpRecordPopupContent = (props: RtmpRecordPopupContentProps) => {
  const [name, setName] = createSignal('');
  const [recordVideo, setRecordVideo] = createSignal(false);
  const [videoHorizontal, setVideoHorizontal] = createSignal(true);

  const recordVideoCheck = new CheckboxField({
    toggle: true
  });
  recordVideoCheck.input.addEventListener('change', () => {
    setRecordVideo(recordVideoCheck.checked);
  });

  const onSubmit = () => {
    props.onSubmit({
      name: name(),
      recordVideo: recordVideo(),
      videoHorizontal: videoHorizontal()
    });
  };

  return (
    <div class={cnPopup('-content')}>
      <div class={cnPopup('-config')}>
        <InputFieldTsx
          class={cnPopup('-config-name')}
          value={name()}
          onRawInput={setName}
          labelText={i18n('Rtmp.RecordPopup.RecordingTitle').innerText}
          maxLength={TITLE_MAX_LENGTH}
        />

        <div class={cnPopup('-config-text')}>
          {i18n('Rtmp.RecordPopup.RecordingQuestion')}
          <br/><br/>
          {i18n('Rtmp.RecordPopup.RecordingHint')}
        </div>

        <Row>
          <Row.Title>{i18n('Rtmp.RecordPopup.AlsoRecordVideo')}</Row.Title>
          <Row.CheckboxField>{recordVideoCheck.label}</Row.CheckboxField>
          <Row.Icon icon="videocamera" />
        </Row>
      </div>

      <div class={cnPopup('-preview')}>
        <div class={cnPopup('-preview-shadow')} />
        <Transition name="fade" mode="outin">
          <Show when={!recordVideo()}>
            <div class={cnPopup('-preview-wrap')}>
              <img
                src={imgRecordAudio}
                alt={i18n('Rtmp.RecordPopup.RecordAudio').innerText}
                class={classNames(cnPopup('-preview-img'), cnPopup('-preview-img_audio'))}
              />
              <div class={cnPopup('-preview-title')}>
                {i18n('Rtmp.RecordPopup.RecordAudioHint')}
              </div>
            </div>
          </Show>
          <Show when={recordVideo()}>
            <div class={cnPopup('-preview-wrap')}>
              <div class={cnPopup('-preview-images')}>
                <img
                  src={imgVideoHorizontal}
                  alt={i18n('Rtmp.RecordPopup.Horizontal').innerText}
                  classList={{
                    [cnPopup('-preview-img')]: true,
                    [cnPopup('-preview-img_videoH')]: true,
                    [cnPopup('-preview-img_active')]: videoHorizontal()
                  }}
                  onClick={() => setVideoHorizontal(true)}
                />
                <img
                  src={imgVideoVertical}
                  alt={i18n('Rtmp.RecordPopup.Vertical').innerText}
                  classList={{
                    [cnPopup('-preview-img')]: true,
                    [cnPopup('-preview-img_videoV')]: true,
                    [cnPopup('-preview-img_active')]: !videoHorizontal()
                  }}
                  onClick={() => setVideoHorizontal(false)}
                />
              </div>
              <div class={cnPopup('-preview-title')}>
                {i18n('Rtmp.RecordPopup.RecordVideoHint')}
              </div>
            </div>
          </Show>
        </Transition>
      </div>

      <div>
        <Ripple>
          <button onClick={onSubmit}
            disabled={name().length > TITLE_MAX_LENGTH}
            class={cnPopup('-button')}
          >
            {i18n('Rtmp.RecordPopup.ButtonRecord')}
          </button>
        </Ripple>
      </div>
    </div>
  );
}
