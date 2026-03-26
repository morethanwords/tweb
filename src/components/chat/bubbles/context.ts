import {Accessor, onCleanup, Setter, useContext} from 'solid-js';
import {createStore, SetStoreFunction} from 'solid-js/store';
import createComponentContext, {ComponentContextValue} from '@helpers/solid/createComponentContext';
import type {Middleware} from '@helpers/middleware';
import type LazyLoadQueue from '@components/lazyLoadQueue';
import type Chat from '@components/chat/chat';
import type ChatBubbles from '@components/chat/bubbles';
import type {Message, MessageMedia} from '@layer';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

export type BubbleSlot =
  'name' | 'topicName' | 'reply' | 'attachment' |
  'messageText' | 'time' | 'reactions' | 'tail' | 'factCheck' |
  'replyMarkup' | 'besideButtons' | 'spoilerOverlay' | 'sendingStatus';

export type BubbleContextState = ComponentContextValue<BubbleSlot> & {
  bubble: HTMLElement,

  // message data
  message: Accessor<Message.message | Message.messageService>,
  groupedMessages: Accessor<Message.message[] | undefined>,
  reactionsMessage: Accessor<Message.message | Message.messageService | undefined>,

  // computed values
  isOut: Accessor<boolean>,
  isOutgoing: Accessor<boolean>,
  isService: boolean,
  isStandaloneMedia: Accessor<boolean>,
  isRound: boolean,
  isSticker: boolean,
  isSponsored: boolean,
  isMessage: boolean,
  canHaveTail: Accessor<boolean>,
  isMessageEmpty: Accessor<boolean>,
  invertMedia: Accessor<boolean>,
  bigEmojis: Accessor<number>,
  messageMedia: Accessor<MessageMedia | undefined>,

  // environment
  chat: Chat,
  middleware: Middleware,
  wrapOptions: WrapSomethingOptions,
  lazyLoadQueue: LazyLoadQueue,
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider

  // ChatBubbles instance — for imperative methods (wrapSticker, wrapStory, etc.)
  bubbles: ChatBubbles,

  // shared signals
  summarizing?: Accessor<boolean>,
  setSummarizing?: Setter<boolean>,

  // accumulator
  loadPromises: Promise<any>[],

  state: {
    // name
    hideName?: boolean,
    isHiddenProfile?: boolean,
    isForwarded?: boolean,
    mustHaveName?: boolean

    // attachment
    mediaClass?: string,
    mediaCanHideName?: boolean
  },

  setState?: SetStoreFunction<BubbleContextState['state']>
};

export type BubbleContextActions = {
  setState: SetStoreFunction<BubbleContextState>
};

// export type BubbleContextValue = [
//   state: BubbleContextState,
//   actions: BubbleContextActions
// ];

export type BubbleContextValue = BubbleContextState;

const {
  context: BubbleContext,
  createValue: createBubbleRegistration
} = createComponentContext<BubbleContextState, BubbleSlot>();

export const useBubble = () => useContext(BubbleContext);
export {BubbleContext, createBubbleRegistration};

/**
 * Input args for createBubbleContext — pre-computed values from renderMessage.
 */
export type CreateBubbleContextArgs = {
  bubble: HTMLElement,
  message: Message.message | Message.messageService,
  groupedMessages?: Message.message[],
  reactionsMessage?: Message.message | Message.messageService,
  isOut: boolean,
  isOutgoing: boolean,
  isService: boolean,
  isStandaloneMedia: boolean,
  isRound: boolean,
  isSticker: boolean,
  isSponsored: boolean,
  isMessage: boolean,
  canHaveTail: boolean,
  isMessageEmpty: boolean,
  invertMedia: boolean,
  bigEmojis: number,
  messageMedia?: MessageMedia,
  chat: Chat,
  middleware: Middleware,
  wrapOptions: WrapSomethingOptions,
  lazyLoadQueue: LazyLoadQueue,
  bubbles: ChatBubbles,
  summarizing?: Accessor<boolean>,
  setSummarizing?: Setter<boolean>,
  loadPromises: Promise<any>[],
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
};

/**
 * Factory: creates a BubbleContextValue from pre-computed values.
 * Wraps each value as an Accessor for Solid reactivity.
 * Includes the slot registration mechanism from createComponentContext.
 */
export function createBubbleContext(args: CreateBubbleContextArgs): BubbleContextValue {
  const [state, setState] = createStore<BubbleContextState['state']>({});
  const ctx: BubbleContextState = {
    ...createBubbleRegistration(),
    bubble: args.bubble,
    message: () => args.message,
    groupedMessages: () => args.groupedMessages,
    reactionsMessage: () => args.reactionsMessage,
    isOut: () => args.isOut,
    isOutgoing: () => args.isOutgoing,
    isService: args.isService,
    isStandaloneMedia: () => args.isStandaloneMedia,
    isRound: args.isRound,
    isSticker: args.isSticker,
    isSponsored: args.isSponsored,
    isMessage: args.isMessage,
    canHaveTail: () => args.canHaveTail,
    isMessageEmpty: () => args.isMessageEmpty,
    invertMedia: () => args.invertMedia,
    bigEmojis: () => args.bigEmojis,
    messageMedia: () => args.messageMedia,
    chat: args.chat,
    middleware: args.middleware,
    wrapOptions: args.wrapOptions,
    lazyLoadQueue: args.lazyLoadQueue,
    bubbles: args.bubbles,
    summarizing: args.summarizing,
    setSummarizing: args.setSummarizing,
    loadPromises: args.loadPromises,
    HotReloadGuard: args.HotReloadGuard,
    state,
    setState
  };

  return ctx;
  // return [state, {setState}];
}
