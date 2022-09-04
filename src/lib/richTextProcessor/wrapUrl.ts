/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PHONE_NUMBER_REG_EXP} from '.';
import {MOUNT_CLASS_TO} from '../../config/debug';
import matchUrlProtocol from './matchUrlProtocol';

export default function wrapUrl(url: string, unsafe?: number | boolean) {
  if(!matchUrlProtocol(url)) {
    url = 'https://' + url;
  }

  const out: {url: string, onclick?: string, onclickUrl?: string} = {url};
  let tgMeMatch, telescoPeMatch, tgMatch;
  let onclick: string, onclickUrl: string;
  /* if(unsafe === 2) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
  } else  */if((tgMeMatch = url.match(/^(?:https?:\/\/)?(?:(.+?)\.)?t(?:elegram)?\.me(?:\/(.+))?/))) {
    const u = new URL(url);
    if(tgMeMatch[1]) {
      u.pathname = tgMeMatch[1] + (u.pathname === '/' ? '' : u.pathname);
    }

    const fullPath = u.pathname.slice(1);
    const path = fullPath.split('/');

    if(path[0] && path[0][0] === '$' && path[0].length > 1) {
      onclick = 'invoice';
    } else if(/^\W/.test(fullPath) && !PHONE_NUMBER_REG_EXP.test(fullPath)) { // second regexp is for phone numbers (t.me/+38050...)
      onclick = 'joinchat';
    } else switch(path[0]) {
      case 'joinchat':
      case 'addstickers':
      case 'addemoji':
      case 'voicechat':
      case 'invoice':
        if(path.length !== 1) {
          onclick = path[0];
          break;
        }

      default:
        if((path[1] && path[1].match(/^\d+(?:\?(?:comment|thread)=\d+)?$/)) || path.length === 1) {
          onclick = 'im';
          break;
        }

        break;
    }
  } else if((telescoPeMatch = url.match(/^(?:https?:\/\/)?telesco\.pe\/([^/?]+)\/(\d+)/))) {
    onclick = 'im';
  } else if((tgMatch = url.match(/tg:(?:\/\/)?(.+?)(?:\?|$)/))) {
    onclick = 'tg_' + tgMatch[1];
  }/*  else if(unsafe) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
  } */

  if(!(window as any)[onclick]) {
    onclick = undefined;
  }

  out.onclick = onclick;
  return out;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.wrapUrl = wrapUrl);
