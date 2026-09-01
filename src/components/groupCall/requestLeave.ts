import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import type GroupCallInstance from '@lib/calls/groupCallInstance';

export default async function requestGroupCallLeave(
  instance: GroupCallInstance,
  canManage: boolean
): Promise<boolean> {
  let discard = false;
  if(canManage) {
    try {
      discard = !!await confirmationPopup({
        titleLangKey: 'VoiceChat.End.Title',
        descriptionLangKey: 'VoiceChat.End.Text',
        className: 'popup-end-video-chat',
        checkbox: {text: 'VoiceChat.End.Third'},
        button: {
          langKey: 'VoiceChat.End.OK',
          isDanger: true
        }
      });
    } catch{
      return false;
    }
  }

  try {
    await instance.hangUp(discard);
    return true;
  } catch(err) {
    console.error('leave group call failed', err);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}
