import {IS_SAFARI} from '@environment/userAgent';
import {InputGroupCall} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';

export function getRtmpStreamUrl(call: InputGroupCall): string {
  const base = `/rtmp/${encodeURIComponent(JSON.stringify(call))}`;

  if(IS_SAFARI) return `${base}?hls=playlist&t=${Date.now()}`;
  return `${base}?t=${Date.now()}`;
}

const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 't.me';
export function getRtmpShareUrl(peerId: PeerId) {
  const chat = apiManagerProxy.getChat(peerId);
  if(chat._ !== 'channel') throw new Error('Not a channel');

  if(chat.username || chat.usernames?.length) {
    const username = chat.username || chat.usernames[0];
    return `https://${shortDomain}/${username}?livestream`;
  }

  return `https://${shortDomain}/c/${chat.id}?livestream`;
}
