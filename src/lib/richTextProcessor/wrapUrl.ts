import type addAnchorListener from '@helpers/addAnchorListener';
import {PHONE_NUMBER_REG_EXP} from '.';
import {MOUNT_CLASS_TO} from '@config/debug';
import {normalizeUrlProtocol} from '@lib/richTextProcessor/matchUrlProtocol';
import matchTelegramUrlHost, {matchUrlHost, TELESCOPE_LINK_HOST} from '@lib/richTextProcessor/matchTelegramUrlHost';

export default function wrapUrl(url: string, safe?: boolean) {
  url = normalizeUrlProtocol(url);

  const out: {url: string, onclick?: Parameters<typeof addAnchorListener>[0]['name']} = {url};
  // parsed once for every branch below. a url the parser rejects (a port out of range, say) has to
  // leave here as a plain external link: `wrapRichText` does not catch, so a throw would take the
  // whole message render down with it
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch(err) {}

  const telegramUrlMatch = parsedUrl && matchTelegramUrlHost(parsedUrl);

  let tgMatch;
  let onclick: typeof out['onclick'];
  /* if(unsafe === 2) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
  } else  */if(telegramUrlMatch) {
    const {prefix} = telegramUrlMatch;
    if(prefix) {
      parsedUrl.pathname = prefix + (parsedUrl.pathname === '/' ? '' : parsedUrl.pathname);
    }

    const fullPath = parsedUrl.pathname.slice(1);
    const path = fullPath.split('/');

    if(path[0] && path[0][0] === '$' && path[0].length > 1) {
      onclick = 'invoice';
    } else if(path[0].toLowerCase() === 'getpremium') {
      // t.me/GetPremium is the Premium offer in any case and with any tail, never the profile @GetPremium
      onclick = 'premium_offer';
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
  } else if(
    // Telegram's own media mirror, `telesco.pe/<peer>/<id>` — the exact host, never a subdomain
    matchUrlHost(parsedUrl, [TELESCOPE_LINK_HOST])?.subdomain === '' &&
    /^\/[^/]+\/\d+/.test(parsedUrl.pathname)
  ) {
    onclick = 'im';
  } else if((tgMatch = url.match(/^tg:(?:\/\/)?(.+?)(?:\?|$)/))) {
    onclick = 'tg_' + tgMatch[1].split('/')[0] as any;

    switch(tgMatch[1]) {
      // * local
      case 'iv': {
        try {
          if(!safe) {
            throw 'unsafe';
          }

          // `safe` only means the wire said webpage_id != 0 — the decoded URL itself is unvetted,
          // so run it through the same protocol filter the incoming url got above
          out.url = normalizeUrlProtocol(decodeURIComponent(parsedUrl.searchParams.get('url')));
        } catch(err) {
          onclick = undefined;
        }
        break;
      }
    }
  }/*  else if(!safe) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
  } */

  if(!(window as any)[onclick]) {
    onclick = undefined;
  }

  out.onclick = onclick;
  return out;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.wrapUrl = wrapUrl);
