import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import ServiceBubbleDescription from '@components/chat/bubbles/serviceBubbleDescription';
import Chat from '@components/chat/chat';
import Icon from '@components/icon';
import {Message} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';

export function NoForwardsRequestContent(props: {
  peerTitle?: HTMLElement
}) {
  return (
    <ServiceBubbleDescription>
      <ServiceBubbleDescription.Title>
        {i18n(`EnableSharingRequested${props.peerTitle ? '' : '.You'}`, [props.peerTitle])}
      </ServiceBubbleDescription.Title>
      <ServiceBubbleDescription.List
        type="check"
        each={
          [
            'EnableSharingRequestedList1',
            'EnableSharingRequestedList2',
            'EnableSharingRequestedList3'
          ] as LangPackKey[]
        }
      >
        {(key) => i18n(key)}
      </ServiceBubbleDescription.List>
    </ServiceBubbleDescription>
  );
}

export function NoForwardsRequestReplyMarkup(props: {
  message: Message.messageService,
  chat: Chat
}) {
  const callback = (accept: boolean) => {
    props.chat.managers.appProfileManager.toggleNoForwards(
      props.message.peerId,
      !accept,
      props.message.mid
    );
  };

  return (
    <ReplyMarkupLayout>
      <ReplyMarkupLayout.Row>
        <ReplyMarkupLayout.Button textClass="reply-markup-suggested-action" onClick={() => callback(false)}>
          {Icon('crossround_filled')}{/* @once */i18n('EnableSharing.Reject')}
        </ReplyMarkupLayout.Button>
        <ReplyMarkupLayout.Button textClass="reply-markup-suggested-action" onClick={() => callback(true)}>
          {Icon('checkround_filled')}{/* @once */i18n('EnableSharing.Accept')}
        </ReplyMarkupLayout.Button>
      </ReplyMarkupLayout.Row>
    </ReplyMarkupLayout>
  );
}
