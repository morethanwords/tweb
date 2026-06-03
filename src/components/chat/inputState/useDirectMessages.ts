import {createEffect, onCleanup} from 'solid-js';
import type {ChatInputStateContext} from './index';


export default function useDirectMessages({instance, store}: ChatInputStateContext) {
  createEffect(() => {
    if(!store.isMonoforumAllChats) return;

    instance.getPlaceholderParams().then((params) => instance.updateMessageInputPlaceholder(params));

    if(store.isReplying) return;

    instance.messageInputField?.input?.classList.add('hide');
    instance.attachMenu?.classList.add('hide');
    instance.messageInputField?.setHidden(true);
    instance.btnToggleEmoticons?.setAttribute('disabled', '');
    instance.btnSend?.setAttribute('disabled', '');
    instance.btnSend?.classList.add('disabled');

    instance.autocompleteHelperController.hideOtherHelpers();

    onCleanup(() => {
      instance.messageInputField?.input?.classList.remove('hide');
      instance.attachMenu?.classList.remove('hide');
      instance.messageInputField?.setHidden(false);
      instance.btnToggleEmoticons?.removeAttribute('disabled');
      instance.btnSend?.removeAttribute('disabled');
      instance.btnSend?.classList.remove('disabled');
    });
  });

  createEffect(() => {
    instance.getPlaceholderParams().then((params) => instance.updateMessageInputPlaceholder(params));

    if(!store.isSuggestingUneditablePostChange) return;

    instance.messageInputField?.input?.classList.add('hide');
    instance.messageInputField?.setHidden(true);
    instance.btnToggleEmoticons?.setAttribute('disabled', '');
    instance.autocompleteHelperController.hideOtherHelpers();

    onCleanup(() => {
      instance.messageInputField?.input?.classList.remove('hide');
      instance.messageInputField?.setHidden(false);
      instance.btnToggleEmoticons?.removeAttribute('disabled');
    });
  });

  const canPaste = () => !store.isMonoforumAllChats || store.isReplying;

  return {canPaste};
}
