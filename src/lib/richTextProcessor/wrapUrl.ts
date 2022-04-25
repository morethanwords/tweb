/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { PHONE_NUMBER_REG_EXP } from ".";
import matchUrlProtocol from "./matchUrlProtocol";

export default function wrapUrl(url: string, unsafe?: number | boolean): {url: string, onclick: string} {
  if(!matchUrlProtocol(url)) {
    url = 'https://' + url;
  }

  let tgMeMatch, telescoPeMatch, tgMatch;
  let onclick: string;
  /* if(unsafe === 2) {
    url = 'tg://unsafe_url?url=' + encodeURIComponent(url);
  } else  */if((tgMeMatch = url.match(/^(?:https?:\/\/)?t(?:elegram)?\.me\/(.+)/))) {
    const fullPath = tgMeMatch[1];

    // second regexp is for phone numbers (t.me/+38050...)
    if(/^\W/.test(fullPath) && !PHONE_NUMBER_REG_EXP.test(fullPath)) {
      onclick = 'joinchat';
      return {url, onclick};
    }

    const path = fullPath.split('/');
    switch(path[0]) {
      case 'joinchat':
      case 'addstickers':
      case 'voicechat':
        onclick = path[0];
        break;

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

  return {url, onclick};
}
