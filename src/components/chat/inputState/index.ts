import {createRoot} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import type ChatInput from '../input';
import {useAiEditorButton} from './useAiEditorButton';
import useDirectMessages from './useDirectMessages';
import useFileInput from './useFileInput';
import {useInputMessageContainerHeight} from './useInputMessageContainerHeight';
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

  inputMessageContainerInited: boolean;
  inputMessageContainerHeight: number;
}

export type ChatInputState = ReturnType<typeof createChatInputState>;

export type ChatInputStateContext = {
  instance: ChatInput;
  store: ChatInputStateStore;
  setStore: SetStoreFunction<ChatInputStateStore>;
};

const DEFAULT_STORE: ChatInputStateStore = {
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
  isSuggestingUneditablePostChange: false,

  inputMessageContainerInited: false,
  inputMessageContainerHeight: 0
};

export default function createChatInputState(instance: ChatInput, initial: ChatInputStateStore = DEFAULT_STORE) {
  return createRoot((dispose) => {
    instance.getMiddleware()?.onDestroy(() => void dispose());

    const [store, set] = createStore<ChatInputStateStore>({...initial});

    const context: ChatInputStateContext = {instance, store, setStore: set};

    useStarsState(context);
    useFileInput(context);
    useInputMessageContainerHeight(context);
    const {canPaste} = useDirectMessages(context);
    useAiEditorButton(context);

    return {store, set, canPaste, dispose};
  });
}
