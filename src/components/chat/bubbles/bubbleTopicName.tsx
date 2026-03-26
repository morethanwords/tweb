import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import wrapTopicNameButton from '@components/wrappers/topicNameButton';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import {ChatType} from '@components/chat/chatType';

/**
 * Bubble.TopicName — renders the forum topic name button.
 * Handles standalone media case (floating-part placement).
 */
export default function TopicName() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('topicName', undefined);
  }

  const isOut = ctx.isOut();
  const isAllMessagesForum = ctx.chat.isAllMessagesForum;
  const hashtagType = ctx.chat.hashtagType;

  if(!isAllMessagesForum && !(hashtagType === 'my' && isOut)) {
    return ctx.register('topicName', undefined);
  }

  return ctx.register('topicName', (() => {
    let ref: HTMLDivElement;

    onMount(async() => {
      const result = await wrapTopicNameButton({
        peerId: message.peerId,
        threadId: getMessageThreadId(message, {isForum: ctx.chat.isForum}),
        lastMsgId: message.mid,
        wrapOptions: {
          middleware: ctx.middleware
        },
        withIcons: true,
        dialog: true,
        noLink: ctx.chat.type === ChatType.Search
      });

      ref.append(result.element);

      // standalone media: add floating-part and place after attachment
      if(ctx.isStandaloneMedia()) {
        ref.classList.add('floating-part');
        const bubble = ref.closest('.bubble');
        const attachment = bubble?.querySelector('.attachment');
        if(attachment) {
          attachment.after(ref);
        }
      }

      // ensure name is visible when topic button exists
      ctx.setState({hideName: false});
    });

    return (
      <div ref={ref!} class="topic-name-button-container" />
    );
  })());
}
