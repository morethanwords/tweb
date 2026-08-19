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

  // * the names the preview opens with: who wrote, then the chat they wrote in.
  // * The arrow points from the one into the next and the last of them hands the
  // * line over to the message with a colon — so a lone chat name keeps the
  // * arrow (it is not someone speaking) while a lone sender keeps the colon.
  const names: (Promise<HTMLElement> | HTMLElement)[] = [];
  const withChatName = !!options.prependPeerId;
  let draftLabel: HTMLElement;

  if(draftMessage) {
    const span = document.createElement('span');
    span.classList.add('danger');
    span.append(i18n('Draft'), ': ');
    // * not a name — it labels the message and stays right in front of it
    draftLabel = span;
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
      names.push(span);
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

      names.push(title);
    }

    if(!withChatName) span.append(': ');
  }

  if(withChatName) {
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
    // * the arrow is a part of its own so it keeps sitting BETWEEN the names —
    // * inside a name's own isolate an RTL title would push it to the front
    const arrow = Icon(
      'next',
      'inline-icon',
      'dialog-subtitle-arrow',
      'primary-text'
    );

    if(names.length) {
      names.push(arrow, title);
      span.append(': ');
    } else {
      names.push(title, arrow);
    }
  }

  if(draftLabel) {
    names.push(draftLabel);
  }

  willPrepend.unshift(...names);

  const wrapOptions: Partial<
    WrapMessageForReplyOptions & WrapRichTextOptions
  > = {textColor};
  let fragment: DocumentFragment;
  let wrapResult: ReturnType<typeof wrapMessageForReply>;
  if(draftMessage) {
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
    span.classList.add('dialog-subtitle-span');
    // * every part isolates its own direction, so an RTL name or message reads
    // * correctly without reordering the parts around it — that is what the
    // * subtitle used a flex row for, at the cost of a separate ellipsis per
    // * part; as one inline line it is elided once, at the end
    span.dir = 'auto';
    if(idx === parts.length - 1) {
      span.classList.add('dialog-subtitle-span-last');
    }
    span.append(part);
    return span;
  });
}
