import {createRoot} from 'solid-js';
import {createStore} from 'solid-js/store';
import type ChatInput from '../input';
import useDirectMessages from './useDirectMessages';
import useFileInput from './useFileInput';
import useStarsState from './useStarsState';

export interface ChatInputStateStore {
  // * stars
  starsBadgeInited: boolean;
  inputStarsCountEl: null | HTMLElement;
  hasSendButton: boolean;
  isRecording: boolean;
  messageCount: number;
  forwarding: number;
  starsAmount: number;

  // * file input
  isEditing: boolean;
  isSuggesting: boolean;

  // * direct messages
  isMonoforumAllChats: boolean;
  isReplying: boolean;
  isSuggestingUneditablePostChange: boolean;
}

export type ChatInputState = ReturnType<typeof createChatInputState>;

export default function createChatInputState(instance: ChatInput) {
  return createRoot((dispose) => {
    instance.getMiddleware()?.onDestroy(() => void dispose());

    const [store, set] = createStore<ChatInputStateStore>({
      starsBadgeInited: false,
      inputStarsCountEl: null,
      hasSendButton: false,
      isRecording: false,
      messageCount: 0,
      forwarding: 0,
      starsAmount: 0,

      isEditing: false,
      isSuggesting: false,

      isMonoforumAllChats: false,
      isReplying: false,
      isSuggestingUneditablePostChange: false
    });

    useStarsState(instance, store);
    useFileInput(instance, store);
    const {canPaste} = useDirectMessages(instance, store);

    return {store, set, canPaste};
  });
}
