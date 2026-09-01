import {createSignal, onMount, Show} from 'solid-js';
import PopupElement, {createPopup, useSnitchedPopupContext} from '@components/popups/indexTsx';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import shareGroupCallInviteLink from '@components/call/shareInviteLink';
import {toastNew} from '@components/toast';
import {GroupCall} from '@layer';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import ListenerSetter from '@helpers/listenerSetter';
import MicrophoneLevelMeter from '@components/call/microphoneLevelMeter';
import CallCameraSection from '@components/call/cameraSection';
import {
  CallDeviceRow,
  useCallDeviceSettings
} from '@components/call/callDeviceSettings';
import {IS_NOISE_SUPPRESSION_SUPPORTED} from '@lib/calls/p2P/utils';
import {changeCallDevice} from '@lib/calls/applyDeviceToActiveCall';
import type CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import callsController from '@lib/calls/callsController';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import groupCallsController from '@lib/calls/groupCallsController';
import requestGroupCallLeave from '@components/groupCall/requestLeave';

import '@components/call/settingsPopup.scss';

// The shared in-call settings sheet. Both PopupGroupCall (legacy video chat)
// and PopupCall (P2P) open this — the only difference is which sections show:
//
//   group call:  [Mute new participants?] [Speakers] [Microphone+meter] [Share invite] [Leave]
//   P2P call:    .............................. [Speakers] [Microphone+meter] ........ [End]
//
// The settings popup owns no call-state; everything routes through the
// instance handed in. It follows that instance's lifecycle so a closed or
// replaced call cannot leave its independent mic/camera previews capturing.
// Closing the popup never tears down the call — only the explicit footer
// action does.

export type CallSettingsPopupOptions = {
  mode: 'groupCall',
  instance: GroupCallInstance,
  canManage: boolean
} | {
  mode: 'p2p',
  instance: CallInstance
};

export default function showCallSettingsPopup(options: CallSettingsPopupOptions) {
  createPopup(() => {
    const isGroupCall = options.mode === 'groupCall';
    const groupCallInstance = isGroupCall ? options.instance : undefined;
    const p2pInstance = !isGroupCall ? options.instance : undefined;
    const canManage = isGroupCall ? options.canManage : false;
    const [appSettings, setAppSettings] = useAppSettings();
    const callDevices = useCallDeviceSettings();
    const {SnitchPopupContext, popupContext} = useSnitchedPopupContext();
    const shareInviteMiddleware = () => {
      const popup = popupContext();
      return !!popup && !popup.destroyed && popup.middlewareHelper.get()() &&
        groupCallsController.groupCall === groupCallInstance &&
        groupCallInstance?.state !== GROUP_CALL_STATE.CLOSED;
    };

    const [joinMuted, setJoinMuted] = createSignal(
      !!(groupCallInstance?.groupCall as GroupCall.groupCall)?.pFlags?.join_muted
    );
    const [shareInviteBusy, setShareInviteBusy] = createSignal(false);

    const closePopup = () => popupContext()?.hide();

    onMount(() => {
      const popup = popupContext();
      if(!popup) return;

      const listenerSetter = new ListenerSetter();
      popup.middlewareHelper.get().onClean(() => listenerSetter.removeAll());
      let closed = false;
      const closeOnce = () => {
        if(closed || popup.destroyed) return;
        closed = true;
        listenerSetter.removeAll();
        popup.hide();
      };

      if(options.mode === 'groupCall') {
        const instance = options.instance;
        if(instance.state === GROUP_CALL_STATE.CLOSED ||
          (groupCallsController.groupCall && groupCallsController.groupCall !== instance)) {
          closeOnce();
          return;
        }

        listenerSetter.add(instance)('state', (state) => {
          if(state === GROUP_CALL_STATE.CLOSED) closeOnce();
        });
        listenerSetter.add(groupCallsController)('instance', (replacement) => {
          if(replacement !== instance) closeOnce();
        });
        listenerSetter.add(callsController)('accepting', closeOnce);
        return;
      }

      const instance = options.instance;
      if(instance.connectionState === CALL_STATE.CLOSED ||
        (callsController.currentCall && callsController.currentCall !== instance) ||
        groupCallsController.groupCall) {
        closeOnce();
        return;
      }

      listenerSetter.add(instance)('state', (state) => {
        if(state === CALL_STATE.CLOSED) closeOnce();
      });
      listenerSetter.add(callsController)('accepting', (replacement) => {
        if(replacement !== instance) closeOnce();
      });
      listenerSetter.add(callsController)('instance', ({instance: replacement, hasCurrent}) => {
        if(!hasCurrent && replacement !== instance) closeOnce();
      });
      listenerSetter.add(groupCallsController)('instance', closeOnce);
    });

    if(groupCallInstance) {
      // Reflect remote `updateGroupCall` join_muted changes; a parallel
      // admin may flip the flag while this popup is open.
      subscribeOn(rootScope)('group_call_update', (call) => {
        if(call.id !== groupCallInstance.id) return;
        setJoinMuted(!!(call as GroupCall.groupCall)?.pFlags?.join_muted);
      });
    }

    const onToggleNoiseSuppression = (checked: boolean) => {
      const previous = appSettings.callDevices?.noiseSuppression ?? true;
      setAppSettings('callDevices', 'noiseSuppression', checked);
      // Re-acquire the mic so the new noiseSuppression constraint takes
      // effect mid-call. Sharing the same transaction path as picker changes
      // prevents an older failure from rolling back a newer device choice.
      if(options.instance.isSharingAudio) {
        void changeCallDevice('microphone', callDevices.deviceId('microphone')).catch((err) => {
          setAppSettings('callDevices', 'noiseSuppression', previous);
          console.error('apply noise suppression failed', err);
          toastNew({langPackKey: 'ConferenceCall.Media.MicrophoneError'});
        });
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

    let shareInvitePromise: Promise<void> | undefined;
    const onShareInviteLink = () => {
      if(!groupCallInstance || shareInvitePromise || !shareInviteMiddleware()) return;

      setShareInviteBusy(true);
      const operation = shareGroupCallInviteLink(groupCallInstance, shareInviteMiddleware);
      const tracked = operation.finally(() => {
        if(shareInvitePromise === tracked) shareInvitePromise = undefined;
        if(shareInviteMiddleware()) setShareInviteBusy(false);
      });
      shareInvitePromise = tracked;
    };

    const leaveP2pCall = async() => {
      try {
        await p2pInstance!.hangUp('phoneCallDiscardReasonHangup');
      } catch(err) {
        console.error('leave call failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
    };

    const onEnd = () => {
      if(groupCallInstance) {
        closePopup();
        void requestGroupCallLeave(groupCallInstance, canManage);
      } else if(p2pInstance) {
        closePopup();
        void leaveP2pCall();
      }
    };

    const endActionLabel = !isGroupCall ?
      'CallSettings.EndCall' :
      'VoiceChat.Leave';

    return (
      <PopupElement
        class="call-settings-popup"
        closable
      >
        <SnitchPopupContext />
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
              <CallDeviceRow
                settings={callDevices}
                kind="speaker"
                icon="speaker_filled"
              />
              <CallDeviceRow
                settings={callDevices}
                kind="microphone"
                icon="microphone_filled"
              />
              <div class="call-settings-popup-meter-wrap">
                <MicrophoneLevelMeter deviceId={callDevices.deviceId('microphone')} />
              </div>
              <Show when={IS_NOISE_SUPPRESSION_SUPPORTED}>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx
                      toggle
                      checked={appSettings.callDevices?.noiseSuppression ?? true}
                      onChange={onToggleNoiseSuppression}
                    />
                  </Row.CheckboxFieldToggle>
                  <Row.Title>{i18n('CallSettings.NoiseSuppression')}</Row.Title>
                </Row>
              </Show>
            </Section>

            <CallCameraSection settings={callDevices} />

            <Show when={isGroupCall}>
              <Section>
                <Row
                  clickable={shareInviteBusy() ? false : onShareInviteLink}
                  disabled={shareInviteBusy()}
                  role="button"
                  tabIndex={shareInviteBusy() ? -1 : 0}
                >
                  <Row.Icon icon="forward_filled" />
                  <Row.Title>{i18n('CallSettings.ShareInviteLink')}</Row.Title>
                </Row>
              </Section>
            </Show>

            <Section>
              <Row color="danger" clickable={onEnd} role="button" tabIndex={0}>
                <Row.Icon icon="stop" class="danger" />
                <Row.Title class="danger">{i18n(endActionLabel)}</Row.Title>
              </Row>
            </Section>
          </PopupElement.Scrollable>
        </PopupElement.Body>
      </PopupElement>
    );
  });
}
