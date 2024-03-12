import {IS_SAFARI} from '../../environment/userAgent';
import {InputGroupCall} from '../../layer';
import apiManagerProxy from '../mtproto/mtprotoworker';

export function getRtmpStreamUrl(call: InputGroupCall): string {
  const base = `/rtmp/${encodeURIComponent(JSON.stringify(call))}`;

  if(IS_SAFARI) return `${base}?hls=playlist&t=${Date.now()}`;
  return `${base}?t=${Date.now()}`;
}

export function getRtmpShareUrl(peerId: PeerId) {
  const chat = apiManagerProxy.getChat(peerId);
  if(chat._ !== 'channel') throw new Error('Not a channel');

  if(chat.username || chat.usernames?.length) {
    const username = chat.username || chat.usernames[0];
    return `https://t.me/${username}?livestream`;
  }

  return `https://t.me/c/${chat.id}?livestream`;
}
