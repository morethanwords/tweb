import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import confirmationPopup from '@components/confirmationPopup';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {appSettings, setAppSettings} from '@stores/appSettings';
import showOutputDevicePopup from '@components/rtmp/outputDevicePopup';
import shareUrlToPeers from '@components/popups/shareUrl';
import {toastNew} from '@components/toast';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import CallInstance from '@lib/calls/callInstance';
import {GroupCall} from '@layer';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import MicrophoneLevelMeter from '@components/call/microphoneLevelMeter';
import CallCameraSection from '@components/call/cameraSection';
import {IS_NOISE_SUPPRESSION_SUPPORTED} from '@lib/calls/p2P/utils';

import '@components/call/settingsPopup.scss';

// The shared in-call settings sheet. Both PopupGroupCall (legacy video chat)
// and PopupCall (P2P) open this — the only difference is which sections show:
//
//   group call:  [Mute new participants?] [Speakers] [Microphone+meter] [Share invite] [End]
//   P2P call:    .............................. [Speakers] [Microphone+meter] ........ [End]
//
// The settings popup owns no call-state; everything routes through the
// instance handed in. Closing the popup never tears down the call — only the
// explicit "End" footer button does.

export type CallSettingsPopupOptions = {
  mode: 'groupCall';
  instance: GroupCallInstance;
  canManage: boolean;
} | {
  mode: 'p2p';
  instance: CallInstance;
};

export default function showCallSettingsPopup(options: CallSettingsPopupOptions) {
  createPopup(() => {
    const isGroupCall = options.mode === 'groupCall';
    const groupCallInstance = isGroupCall ? options.instance : undefined;
    const p2pInstance = !isGroupCall ? options.instance : undefined;
    const canManage = isGroupCall ? options.canManage : false;

    // Local signals mirror the persisted callDevices store so row labels
    // update reactively after a picker close. We don't wire a Solid effect
    // on the store itself because (a) the popup is short-lived and (b) we
    // only need the signal to fire when *this* popup calls setAppSettings.
    const [speakerId, setSpeakerId] = createSignal(appSettings.callDevices?.speakerId || '');
    const [microphoneId, setMicrophoneId] = createSignal(appSettings.callDevices?.microphoneId || '');
    const [noiseSuppression, setNoiseSuppression] = createSignal(
      appSettings.callDevices?.noiseSuppression ?? true
    );

    const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);

    const [joinMuted, setJoinMuted] = createSignal(
      !!(groupCallInstance?.groupCall as GroupCall.groupCall)?.pFlags?.join_muted
    );

    const [show, setShow] = createSignal(true);

    const refreshDevices = () => {
      navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
    };

    const labelFor = (kind: MediaDeviceKind, id: string) => {
      if(!id) return i18n('CallSettings.DeviceDefault');
      const found = devices().find((d) => d.kind === kind && d.deviceId === id);
      // Fall back to deviceId when label is blank — Chrome blanks labels
      // until media permission is granted for that kind, which can race
      // with the popup opening before the call is fully joined.
      return found ? wrapEmojiText(found.label || found.deviceId) : i18n('CallSettings.DeviceDefault');
    };

    onMount(() => {
      refreshDevices();
      navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
      onCleanup(() => {
        navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
      });
    });

    if(groupCallInstance) {
      // Reflect remote `updateGroupCall` join_muted changes; a parallel
      // admin may flip the flag while this popup is open.
      subscribeOn(rootScope)('group_call_update', (call) => {
        if(call.id !== groupCallInstance.id) return;
        setJoinMuted(!!(call as GroupCall.groupCall)?.pFlags?.join_muted);
      });
    }

    // Each picker passes `onStaleCurrentId` to clear the matching appSettings
    // field when the saved device id no longer matches any enumerated device
    // (e.g. the user unplugged the USB mic since picking it). Without this
    // the picker would show Default unselected and the next call attempt
    // would still try the dead id.
    const onPickSpeaker = () => {
      showOutputDevicePopup({
        kind: 'audiooutput',
        currentId: speakerId(),
        titleLangKey: 'CallSettings.Speakers',
        onPick: (id) => {
          setSpeakerId(id);
          setAppSettings('callDevices', 'speakerId', id);
          options.instance.setOutputDeviceId(id);
        },
        onStaleCurrentId: () => {
          setSpeakerId('');
          setAppSettings('callDevices', 'speakerId', '');
        }
      });
    };

    const onPickMicrophone = () => {
      showOutputDevicePopup({
        kind: 'audioinput',
        currentId: microphoneId(),
        titleLangKey: 'CallSettings.Microphone',
        onPick: (id) => {
          setMicrophoneId(id);
          setAppSettings('callDevices', 'microphoneId', id);
          options.instance.setInputAudioDeviceId(id).catch(() => {});
        },
        onStaleCurrentId: () => {
          setMicrophoneId('');
          setAppSettings('callDevices', 'microphoneId', '');
        }
      });
    };

    const onToggleNoiseSuppression = (checked: boolean) => {
      setNoiseSuppression(checked);
      setAppSettings('callDevices', 'noiseSuppression', checked);
      // Re-acquire the mic so the new noiseSuppression constraint takes
      // effect mid-call. `setInputAudioDeviceId` rebuilds the constraints
      // from getAudioConstraints, which already reads the persisted flag.
      if(options.instance.isSharingAudio) {
        options.instance.setInputAudioDeviceId(microphoneId()).catch(() => {});
      }
    };

    const onToggleMuteNewParticipants = (checked: boolean) => {
      if(!groupCallInstance) return;
      setJoinMuted(checked);
      // Optimistic UI: server echoes via updateGroupCall and the
      // subscription above reconciles if it disagrees.
      rootScope.managers.appGroupCallsManager.toggleGroupCallSettings(
        groupCallInstance.id,
        {joinMuted: checked}
      ).catch((err) => {
        setJoinMuted(!checked);
        console.error('toggleGroupCallSettings failed', err);
      });
    };

    // The call's own invite link is the canonical choice — it deep-links
    // straight into the active video chat. If that export errors (network
    // hiccup, instance not yet hydrated server-side), fall back to the host
    // chat's general invite link so the user still has something shareable
    // rather than getting an "An error occurred" toast for a benign retry.
    const onShareInviteLink = async() => {
      if(!groupCallInstance) return;
      const {appGroupCallsManager, appProfileManager} = rootScope.managers;
      let link: string;
      try {
        link = await appGroupCallsManager.exportGroupCallInvite(groupCallInstance.id, true);
      } catch(err) {
        try {
          link = await appProfileManager.getChatInviteLink(groupCallInstance.chatId);
        } catch(fallbackErr) {
          console.error('share invite: both exports failed', err, fallbackErr);
          toastNew({langPackKey: 'Error.AnError'});
          return;
        }
      }

      shareUrlToPeers({
        url: link,
        multiSelect: true,
        toastKey: 'InviteLinkSentSingle',
        toastKeyForMany: 'InviteLinkSentMany'
      });
    };

    // End-of-call paths. For an admin in a group call we surface the same
    // "Also end the video chat for everyone" checkbox the legacy "leave"
    // button shows — routed through the generic `confirmationPopup`, which
    // handles the Cancel button, click-to-close, and rejection paths for us.
    const onEnd = () => {
      if(groupCallInstance) {
        if(canManage) {
          setShow(false);
          confirmationPopup({
            titleLangKey: 'VoiceChat.End.Title',
            descriptionLangKey: 'VoiceChat.End.Text',
            className: 'popup-end-video-chat',
            checkbox: {text: 'VoiceChat.End.Third'},
            button: {
              langKey: 'VoiceChat.End.OK',
              isDanger: true
            }
          }).then((discard) => {
            groupCallInstance.hangUp(!!discard);
          }).catch(() => {/* user cancelled */});
        } else {
          groupCallInstance.hangUp(false);
          setShow(false);
        }
      } else if(p2pInstance) {
        p2pInstance.hangUp('phoneCallDiscardReasonHangup');
        setShow(false);
      }
    };

    return (
      <PopupElement
        class="call-settings-popup"
        closable
        show={show()}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n('CallSettings.Title')}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body class="call-settings-popup-body">
          <PopupElement.Scrollable>
            <Show when={isGroupCall && canManage}>
              <Section>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      toggle
                      checked={joinMuted()}
                      onChange={onToggleMuteNewParticipants}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title>{i18n('CallSettings.MuteNewParticipants')}</Row.Title>
                </Row>
              </Section>
            </Show>

            <Section>
              <Row clickable={onPickSpeaker}>
                <Row.Icon icon="speaker" />
                <Row.Title titleRight={labelFor('audiooutput', speakerId())} titleRightSecondary>
                  {i18n('CallSettings.Speakers')}
                </Row.Title>
              </Row>
              <Row clickable={onPickMicrophone}>
                <Row.Icon icon="microphone" />
                <Row.Title titleRight={labelFor('audioinput', microphoneId())} titleRightSecondary>
                  {i18n('CallSettings.Microphone')}
                </Row.Title>
              </Row>
              <div class="call-settings-popup-meter-wrap">
                <MicrophoneLevelMeter deviceId={microphoneId()} />
              </div>
              <Show when={IS_NOISE_SUPPRESSION_SUPPORTED}>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      toggle
                      checked={noiseSuppression()}
                      onChange={onToggleNoiseSuppression}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title>{i18n('CallSettings.NoiseSuppression')}</Row.Title>
                </Row>
              </Show>
            </Section>

            <CallCameraSection />

            <Show when={isGroupCall}>
              <Section>
                <Row clickable={onShareInviteLink}>
                  <Row.Icon icon="forward" />
                  <Row.Title>{i18n('CallSettings.ShareInviteLink')}</Row.Title>
                </Row>
              </Section>
            </Show>

            <Section>
              <Row color="danger" clickable={onEnd}>
                <Row.Icon icon="stop" class="danger" />
                <Row.Title class="danger">{i18n(isGroupCall ? 'CallSettings.EndVideoChat' : 'CallSettings.EndCall')}</Row.Title>
              </Row>
            </Section>
          </PopupElement.Scrollable>
        </PopupElement.Body>
      </PopupElement>
    );
  });
}
