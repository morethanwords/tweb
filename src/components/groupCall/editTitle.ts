import confirmationPopup from '@components/confirmationPopup';
import InputField from '@components/inputField';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {GroupCall} from '@layer';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';

// tdesktop kMaxGroupCallLength (calls_group_recording_box.cpp)
const GROUP_CALL_TITLE_MAX_LENGTH = 40;

/**
 * "Edit Video Chat Title" — tdesktop's EditGroupCallTitleBox: one field, the chat's name for its
 * label (an empty title gives the call that name back), and a toast once the server took it.
 * `isAlive` says whether the call it was asked for is still the one on screen.
 */
export default async function editGroupCallTitle(options: {
  instance: GroupCallInstance,
  isBroadcast: boolean,
  isAlive: () => boolean
}): Promise<void> {
  const {instance, isBroadcast, isAlive} = options;
  const {managers, accountNumber} = instance;
  const chatTitle = await getPeerTitle({peerId: instance.chatId.toPeerId(true), plainText: true, accountNumber});
  if(!isAlive()) {
    return;
  }

  const currentTitle = (instance.groupCall as GroupCall.groupCall)?.title || '';
  const inputField = new InputField({
    labelText: chatTitle,
    maxLength: GROUP_CALL_TITLE_MAX_LENGTH
  });
  inputField.setOriginalValue(currentTitle, true);

  try {
    await confirmationPopup({
      titleLangKey: isBroadcast ? 'VoipChannelEditTitle' : 'VoipGroupEditTitle',
      inputField,
      button: {langKey: 'Save'}
    });
  } catch{
    return;
  }

  const title = inputField.value.trim();
  if(title === currentTitle || !isAlive()) {
    return;
  }

  try {
    await managers.appGroupCallsManager.editGroupCallTitle(instance.id, title);
  } catch(err) {
    console.error('edit group call title failed', err);
    if(isAlive()) {
      toastNew({langPackKey: 'Error.AnError'});
    }

    return;
  }

  if(isAlive()) {
    toastNew({
      langPackKey: isBroadcast ? 'VoiceChat.TitleChanged.Channel' : 'VoiceChat.TitleChanged',
      langPackArguments: [wrapEmojiText(title || chatTitle)]
    });
  }
}
