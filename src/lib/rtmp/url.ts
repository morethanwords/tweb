import {IS_SAFARI} from '@environment/userAgent';
import {Chat, InputGroupCall} from '@layer';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';

// * the service worker fetches the stream for `accountNumber`, whichever account the tab shows by then
export function getRtmpStreamUrl(call: InputGroupCall, accountNumber = getCurrentAccount()): string {
  const base = `/rtmp/${encodeURIComponent(JSON.stringify({...call, accountNumber}))}`;

  if(IS_SAFARI) return `${base}?hls=playlist&t=${Date.now()}`;
  return `${base}?t=${Date.now()}`;
}

// * `chat`: the stream's account's - the tab may show another one, whose mirrors know nothing of it
export function getRtmpShareUrl(chat: Chat) {
  if(chat?._ !== 'channel') throw new Error('Not a channel');

  if(chat.username || chat.usernames?.length) {
    const username = chat.username || chat.usernames[0];
    return `https://t.me/${username}?livestream`;
  }

  return `https://t.me/c/${chat.id}?livestream`;
}
