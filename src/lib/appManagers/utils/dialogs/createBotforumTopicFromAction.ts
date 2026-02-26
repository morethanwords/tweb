import {ForumTopic, Message, MessageAction} from '@layer';

type CreateTopicFromActionArgs = {
  message: Message.messageService;
  action: MessageAction.messageActionTopicCreate;
};

export function createBotforumTopicFromAction({message, action}: CreateTopicFromActionArgs) {
  const newTopic: ForumTopic.forumTopic = {
    _: 'forumTopic',
    pFlags: {},
    date: message.date,
    peer: message.peer_id,
    from_id: message.peer_id,
    title: action.title,
    icon_color: action.icon_color,
    id: message.id,
    notify_settings: {
      _: 'peerNotifySettings'
    },
    icon_emoji_id: action.icon_emoji_id,
    top_message: message.id,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_count: 1,
    unread_mentions_count: 0,
    unread_reactions_count: 0
  };

  return newTopic;
};
