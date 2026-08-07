import type {MyDraftMessage} from '@appManagers/appDraftsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import Icon from '@components/icon';
import type {
  WrapMessageForReplyOptions
} from '@components/wrappers/messageForReply';
import type {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import {i18n} from '@lib/langPack';

type MiddlewarePromise = <T>(value: T) => T;
type MessageRenderer = typeof import(
  '@components/wrappers/messageForReply'
)['default'];
type PeerTitleRenderer = typeof import(
  '@components/wrappers/peerTitle'
)['default'];

export default async function renderDialogSubtitleParts(options: {
  peerId: PeerId,
  isSaved: boolean,
  lastMessage?: MyMessage,
  draftMessage?: MyDraftMessage,
  highlightWord?: string,
  noForwardIcon?: boolean,
  mediaParts?: (Promise<HTMLElement> | HTMLElement)[],
  withoutMediaType?: boolean,
  prependPeerId?: PeerId,
  middleware: MiddlewarePromise,
  textColor: string,
  messageRenderer?: MessageRenderer,
  peerTitleRenderer?: PeerTitleRenderer
}) {
  const {
    peerId,
    isSaved,
    lastMessage,
    draftMessage,
    highlightWord,
    noForwardIcon,
    middleware,
    textColor
  } = options;
  const wrapMessageForReply = options.messageRenderer ||
    (await import('@components/wrappers/messageForReply')).default;
  const willPrepend: (Promise<HTMLElement> | HTMLElement)[] = [];
  let icon: Icon;

  if(draftMessage) {
  } else if(
    lastMessage?._ === 'message' &&
    lastMessage.fwdFromId &&
    !isSaved &&
    !noForwardIcon
  ) {
    icon = 'forward_filled';
  } else if(
    lastMessage?._ === 'message' &&
    lastMessage.reply_to?._ === 'messageReplyStoryHeader'
  ) {
    icon = 'storyreply';
  }

  if(icon) {
    willPrepend.push(Icon(
      icon,
      'dialog-subtitle-ico',
      'dialog-subtitle-ico-' + icon
    ));
  }
  if(options.mediaParts?.length) {
    willPrepend.push(...options.mediaParts);
  }

  if(draftMessage) {
    const span = document.createElement('span');
    span.classList.add('danger');
    span.append(i18n('Draft'), ': ');
    willPrepend.unshift(span);
  } else if(
    lastMessage &&
    peerId.isAnyChat() &&
    peerId !== lastMessage.fromId &&
    lastMessage._ === 'message'
  ) {
    const span = document.createElement('span');
    span.classList.add('primary-text');

    if(lastMessage.fromId === rootScope.myId) {
      span.append(i18n('FromYou'));
      willPrepend.unshift(span);
    } else {
      const title = Promise.resolve(options.peerTitleRenderer)
      .then(async(wrapPeerTitle) => {
        return wrapPeerTitle ||
          (await import('@components/wrappers/peerTitle')).default;
      })
      .then((wrapPeerTitle) => {
        return middleware(wrapPeerTitle({
          peerId: lastMessage.fromId,
          onlyFirstName: true
        }));
      })
      .then((element) => {
        span.prepend(element);
        return span;
      });

      willPrepend.unshift(title);
    }

    span.append(': ');
  }

  if(options.prependPeerId) {
    const span = document.createElement('span');
    span.classList.add('primary-text');
    const title = Promise.resolve(options.peerTitleRenderer)
    .then(async(wrapPeerTitle) => {
      return wrapPeerTitle ||
        (await import('@components/wrappers/peerTitle')).default;
    })
    .then((wrapPeerTitle) => {
      return middleware(wrapPeerTitle({
        peerId: options.prependPeerId,
        dialog: true
      }));
    })
    .then((element) => {
      span.prepend(element);
      return span;
    });
    span.append(': ');
    willPrepend.unshift(title);
  }

  const wrapOptions: Partial<
    WrapMessageForReplyOptions & WrapRichTextOptions
  > = {textColor};
  let fragment: DocumentFragment;
  let wrapResult: ReturnType<typeof wrapMessageForReply>;
  if(highlightWord && lastMessage?._ === 'message' && lastMessage.message) {
    wrapResult = wrapMessageForReply({
      ...wrapOptions,
      message: lastMessage,
      highlightWord,
      withoutMediaType: options.withoutMediaType
    });
  } else if(draftMessage) {
    wrapResult = wrapMessageForReply({
      ...wrapOptions,
      message: draftMessage
    });
  } else if(lastMessage) {
    wrapResult = wrapMessageForReply({
      ...wrapOptions,
      message: lastMessage,
      withoutMediaType: options.withoutMediaType
    });
  } else {
    fragment = document.createDocumentFragment();
  }

  if(wrapResult) {
    fragment = await middleware(wrapResult);
  }
  const resolvedPrepend: HTMLElement[] = willPrepend.length ?
    await middleware(Promise.all(willPrepend)) :
    [];

  return [...resolvedPrepend, fragment].map((part, idx, parts) => {
    const span = document.createElement('span');
    span.classList.add(
      'dialog-subtitle-span',
      'dialog-subtitle-span-overflow'
    );
    if(idx === parts.length - 1) {
      span.classList.add('dialog-subtitle-span-last');
      span.dir = 'auto';
    }
    span.append(part);
    return span;
  });
}
