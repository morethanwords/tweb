import {useBubble} from '@components/chat/bubbles/context';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import wrapPoll from '@components/wrappers/poll';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {Message, MessageMedia} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import Icon from '@components/icon';
import {_i18n, i18n, LangPackKey} from '@lib/langPack';
import {avatarNew} from '@components/avatarNew';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import I18n from '@lib/langPack';
import {wrapCallDuration} from '@components/wrappers/wrapDuration';
import getGroupedText from '@appManagers/utils/messages/getGroupedText';
import TranslatableMessage from '@components/translatableMessage';
import {ChatType} from '@components/chat/chatType';
import getMediaDurationFromMessage from '@lib/appManagers/utils/messages/getMediaDurationFromMessage';

/**
 * Bubble.Text — renders message text + inline media (poll, contact, call).
 * Reads from BubbleContext. Registers into 'messageText' slot.
 */
export default function Text() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('messageText', undefined);
  }

  const media = message.media;
  const doc = (media as MessageMedia.messageMediaDocument)?.document as MyDocument;

  // stickers have no text div
  if(doc?.type === 'sticker') {
    return ctx.register('messageText', undefined);
  }

  // grouped text: for albums, text comes from getGroupedText
  const grouped = ctx.groupedMessages();
  let messageText: string;
  let totalEntities = message.totalEntities;
  if(grouped && grouped.length > 1) {
    const groupedTextMessage = getGroupedText(grouped);
    messageText = groupedTextMessage?.message || '';
    totalEntities = groupedTextMessage?.totalEntities || [];
  } else {
    messageText = message.message;
  }

  const hasText = !!messageText;

  // big emoji: text goes into attachment as oversized emoji, not messageDiv
  if(ctx.bigEmojis() > 0 && ctx.isStandaloneMedia()) {
    return ctx.register('messageText', undefined);
  }

  // check for inline media types (rendered inside messageDiv, not attachmentDiv)
  const isCall = media?._ === 'messageMediaCall';
  const isContact = media?._ === 'messageMediaContact';
  const isPoll = media?._ === 'messageMediaPoll';
  const isToDo = media?._ === 'messageMediaToDo';

  // if no text and no inline media, skip
  if(!hasText && !isCall && !isContact && !isPoll && !isToDo) {
    return ctx.register('messageText', undefined);
  }

  return ctx.register('messageText', (() => {
    let ref: HTMLDivElement;

    const setRef = (el: HTMLDivElement) => {
      ref = el;

      // margin adjustment when attachment is adjacent
      if(ctx.messageMedia()) {
        el.classList.add(ctx.invertMedia() ? 'mb-shorter' : 'mt-shorter');
      }

      // render text content
      if(hasText) {
        const our = ctx.chat.isOurMessage(message);
        const canTranslate = !ctx.bigEmojis() && (!our || message.summary_from_language) && ctx.chat.type !== ChatType.Search;
        const getRichTextOptions = () => ({
          entities: totalEntities,
          passEntities: ctx.bubbles.passEntities,
          loadPromises: ctx.loadPromises,
          lazyLoadQueue: ctx.lazyLoadQueue,
          customEmojiSize: ctx.wrapOptions.customEmojiSize,
          middleware: ctx.middleware,
          animationGroup: ctx.wrapOptions.animationGroup,
          textColor: 'primary-text-color' as const,
          maxMediaTimestamp: getMediaDurationFromMessage?.(message)
        });

        const richText = canTranslate ?
          TranslatableMessage({
            message: grouped ? (getGroupedText(grouped) || message) : message,
            peerId: message.peerId,
            middleware: ctx.middleware,
            observeElement: el.closest('.bubble') as HTMLElement || el,
            observer: ctx.bubbles.observer,
            richTextOptions: getRichTextOptions(),
            summarizing: ctx.summarizing,
            onTranslation: (set) => {
              ctx.bubbles.modifyBubble(() => {
                set();
                if(ctx.summarizing?.()) {
                  queueMicrotask(() => ctx.bubbles.scrollToBubble?.(el.closest('.bubble'), 'start'));
                }
              });
            }
          }) :
          wrapRichText(messageText, getRichTextOptions());

        setInnerHTML(el, richText);
      }

      // render inline media
      if(isPoll) {
        const pollElement = wrapPoll({
          message,
          managers: ctx.chat.appImManager.managers,
          middleware: ctx.middleware
        });
        el.prepend(pollElement);
      } else if(isContact) {
        renderContact(el, media as MessageMedia.messageMediaContact, ctx);
      } else if(isCall) {
        renderCall(el, media as MessageMedia.messageMediaCall, ctx);
      } else if(isToDo) {
        const content = document.createElement('div');
        content.classList.add('checklist-content');
        const {render} = require('solid-js/web');
        const {ChecklistBubble} = require('@components/chat/bubbles/checklist');
        const dispose = render(
          () => ChecklistBubble({
            message,
            chat: ctx.chat,
            out: ctx.chat.isOurMessage(message)
          }),
          content
        );
        ctx.middleware.onClean(dispose);
        el.prepend(content);
      }
    };

    return (
      <div
        ref={setRef}
        class="message spoilers-container"
      />
    );
  })());
}

function renderContact(
  container: HTMLElement,
  contact: MessageMedia.messageMediaContact,
  ctx: ReturnType<typeof useBubble>
) {
  const contactDiv = document.createElement('div');
  contactDiv.classList.add('contact');
  contactDiv.dataset.peerId = '' + contact.user_id;

  const contactDetails = document.createElement('div');
  contactDetails.className = 'contact-details';
  const contactNameDiv = document.createElement('div');
  contactNameDiv.className = 'contact-name';
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  contactNameDiv.append(
    fullName.trim() ? wrapEmojiText(fullName) : i18n('AttachContact')
  );

  const contactNumberDiv = document.createElement('div');
  contactNumberDiv.className = 'contact-number';
  contactNumberDiv.textContent = contact.phone_number ?
    '+' + formatPhoneNumber(contact.phone_number).formatted :
    'Unknown phone number';

  contactDiv.append(contactDetails);
  contactDetails.append(contactNameDiv, contactNumberDiv);

  const avatarElem = avatarNew({
    middleware: ctx.middleware,
    size: 54,
    lazyLoadQueue: ctx.lazyLoadQueue,
    peerId: contact.user_id.toPeerId(),
    peerTitle: contact.user_id ? undefined : (fullName.trim() ? fullName : I18n.format('AttachContact', true)[0])
  });
  contactDiv.prepend(avatarElem.node);

  container.append(contactDiv);
}

function renderCall(
  container: HTMLElement,
  callMedia: MessageMedia.messageMediaCall,
  ctx: ReturnType<typeof useBubble>
) {
  const action = callMedia.action;
  const div = document.createElement('div');
  div.classList.add('bubble-call');
  div.append(Icon(action.pFlags.video ? 'videocamera' : 'phone', 'bubble-call-icon'));

  const isOut = ctx.isOut();

  const title = document.createElement('div');
  title.classList.add('bubble-call-title');
  _i18n(title, isOut ?
    (action.pFlags.video ? 'CallMessageVideoOutgoing' : 'CallMessageOutgoing') :
    (action.pFlags.video ? 'CallMessageVideoIncoming' : 'CallMessageIncoming'));

  const subtitle = document.createElement('div');
  subtitle.classList.add('bubble-call-subtitle');

  if(action.duration !== undefined) {
    subtitle.append(wrapCallDuration(action.duration));
  } else {
    let langPackKey: LangPackKey;
    switch(action.reason?._) {
      case 'phoneCallDiscardReasonBusy':
        langPackKey = 'Call.StatusBusy';
        break;
      case 'phoneCallDiscardReasonMissed':
        langPackKey = 'Chat.Service.Call.Missed';
        break;
      default:
        langPackKey = 'Chat.Service.Call.Cancelled';
        break;
    }
    _i18n(subtitle, langPackKey);
    subtitle.classList.add('is-reason');
  }

  subtitle.prepend(Icon(
    'arrow_next',
    'bubble-call-arrow',
    'bubble-call-arrow-' + (action.duration !== undefined ? 'green' : 'red')
  ));

  div.append(title, subtitle);
  container.append(div);
}
