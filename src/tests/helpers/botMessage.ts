import type {Message, ReplyMarkup} from '@layer';

/** An empty message a bot sent to a private chat (id and mid alike), carrying `reply_markup` */
export function makeBotMessage(mid: number, peerId: PeerId, botId: UserId, reply_markup: ReplyMarkup): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    peerId,
    peer_id: {_: 'peerUser', user_id: botId},
    from_id: {_: 'peerUser', user_id: botId},
    date: 1,
    message: '',
    reply_markup
  } as Message.message;
}
