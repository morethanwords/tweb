import type addAnchorListener from '@helpers/addAnchorListener';
import {PHONE_NUMBER_REG_EXP} from '.';
import {MOUNT_CLASS_TO} from '@config/debug';
import matchUrlProtocol from '@lib/richTextProcessor/matchUrlProtocol';
import {T_ME_PREFIXES} from '@appManagers/constants';

const shortDomain = import.meta.env.VITE_SHORT_DOMAIN || 't.me';
const customProtocol = import.meta.env.VITE_APP_PROTOCOL || 'tg';

export default function wrapUrl(url: string, safe?: boolean) {
  if(!matchUrlProtocol(url)) {
    url = 'https://' + url;
  }

  const out: {url: string, onclick?: Parameters<typeof addAnchorListener>[0]['name']} = {url};
  let tgMeMatch, telescoPeMatch, tgMatch;
  let onclick: typeof out['onclick'];
  if((tgMeMatch = url.match(new RegExp(`^(?:${customProtocol}:(?:\\/\\/)?|(?:https?:\\/\\/)?(?:www\\.)?${shortDomain.replace(/\./g, '\\.')}\\/)(.+?)(?:\\?|$)`, 'i')))) {
    const u = new URL(url);
    let prefix = tgMeMatch[1];
    if(prefix && T_ME_PREFIXES.has(tgMeMatch[1])) {
      prefix = undefined;
    }

    if(prefix) {
      u.pathname = prefix + (u.pathname === '/' ? '' : u.pathname);
    }

    const fullPath = u.pathname.slice(1);
    const path = fullPath.split('/');

    if(path[0] && path[0][0] === '$' && path[0].length > 1) {
      onclick = 'invoice';
    } else if(/^\+/.test(fullPath) && !PHONE_NUMBER_REG_EXP.test(fullPath)) { // second regexp is for phone numbers (t.me/+38050...)
      onclick = 'joinchat';
    } else if(path[0]) switch(path[0]) {
      case 'm':
      case 'addlist':
      case 'joinchat':
      case 'addstickers':
      case 'addemoji':
      case 'voicechat':
      case 'call':
      case 'invoice':
      case 'boost':
      case 'giftcode':
      case 'share':
      case 'nft':
      case 'addstyle':
        if(path.length !== 1 && !prefix) {
          onclick = path[0];
          break;
        }

      default:
        if(path.length <= 2 || path[1]?.match(/^\d+(?:\?(?:comment|thread)=\d+)?$/) || ['s', 'c', 'a'].includes(path[1])) {
          onclick = 'im';
          break;
        }

        break;
    }
  } else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {
    onclick = 'im';
  } else if((tgMatch = url.match(new RegExp(`${customProtocol}:(?:\\/\\/)?(.+?)(?:\\?|$)`)))) {
    onclick = 'tg_' + tgMatch[1].split('/')[0] as any;

    switch(tgMatch[1]) {
      // * local
      case 'iv': {
        try {
          if(!safe) {
            throw 'unsafe';
          }

          out.url = decodeURIComponent(new URL(url).searchParams.get('url'));
        } catch(err) {
          onclick = undefined;
        }
        break;
      }
    }
  }

  if(!(window as any)[onclick]) {
    onclick = undefined;
  }

  out.onclick = onclick;
  return out;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.wrapUrl = wrapUrl);
