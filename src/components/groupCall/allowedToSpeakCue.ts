import getGroupCallAudioAsset from '@components/groupCall/getAudioAsset';
import {toastNew} from '@components/toast';

// An admin lifted our forced mute. We stay muted until the user unmutes, so
// without a cue the lifted restriction is invisible — the sound and the toast
// are the only signal that the microphone button works again (tdesktop
// GroupCall::notifyAboutAllowedToSpeak + Toasts::setupAllowedToSpeak).
export default function notifyAllowedToSpeak() {
  getGroupCallAudioAsset().play({name: 'allowtalk'});
  toastNew({langPackKey: 'VoiceChat.YouCanNowSpeak'});
}
