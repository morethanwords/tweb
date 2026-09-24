import {Show, createSignal} from 'solid-js';
import {InputFieldTsx} from '@components/inputFieldTsx';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import rootScope from '@lib/rootScope';

import Row from '@components/rowTsx';
import CheckboxField from '@components/checkboxField';

import imgRecordAudio from '@components/rtmp/assets/recordAudio.svg';
import imgVideoVertical from '@components/rtmp/assets/videoVertical.svg';
import imgVideoHorizontal from '@components/rtmp/assets/videoHorizontal.svg';

import {Transition} from 'solid-transition-group';
import {Ripple} from '@components/rippleTsx';
import classNames from '@helpers/string/classNames';
import {CallRecordParams} from '@appManagers/appGroupCallsManager';
import {toastNew} from '@components/toast';
import rtmpCallsController from '@lib/calls/rtmpCallsController';

import '@components/rtmp/recordPopup.css';
import {i18n} from '@lib/langPack';

const cnPopup = (className = '') => `rtmp-record-popup${className}`;

export function showRtmpRecordPopup() {
  const [show, setShow] = createSignal(true);

  const onSubmit = (params: CallRecordParams) => {
    setShow(false);
    rootScope.managers.appGroupCallsManager.startRecording(
      rtmpCallsController.currentCall.inputCall,
      params
    ).catch(() => {
      toastNew({
        langPackKey: 'Rtmp.RecordPopup.Failed'
      });
    });
  };

  createPopup(() => (
    <PopupElement class={cnPopup()} closable show={show()}>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title>{i18n('Rtmp.RecordPopup.Title')}</PopupElement.Title>
      </PopupElement.Header>
      <PopupElement.Body>
        <RtmpRecordPopupContent onSubmit={onSubmit} />
      </PopupElement.Body>
    </PopupElement>
  ));
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
            <Row.CheckboxFieldToggle>{recordVideoCheck.label}</Row.CheckboxFieldToggle>
            <Row.Icon icon="videocamera_filled" />
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
              <div class={cnPopup('-preview-images')} role="group" aria-label={i18n('Rtmp.RecordPopup.RecordVideoHint').textContent}>
                <button type="button" aria-pressed={videoHorizontal()} onClick={() => setVideoHorizontal(true)}>
                <img
                  src={imgVideoHorizontal}
                  alt={i18n('Rtmp.RecordPopup.Horizontal').innerText}
                  classList={{
                    [cnPopup('-preview-img')]: true,
                    [cnPopup('-preview-img_videoH')]: true,
                    [cnPopup('-preview-img_active')]: videoHorizontal()
                  }}
                />
                </button>
                <button type="button" aria-pressed={!videoHorizontal()} onClick={() => setVideoHorizontal(false)}>
                <img
                  src={imgVideoVertical}
                  alt={i18n('Rtmp.RecordPopup.Vertical').innerText}
                  classList={{
                    [cnPopup('-preview-img')]: true,
                    [cnPopup('-preview-img_videoV')]: true,
                    [cnPopup('-preview-img_active')]: !videoHorizontal()
                  }}
                />
                </button>
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
