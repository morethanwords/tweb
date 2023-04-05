/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {T_ME_PREFIXES} from '../lib/mtproto/mtproto_config';
import cancelEvent from './dom/cancelEvent';
import parseUriParams from './string/parseUriParams';

export default function addAnchorListener<Params extends {pathnameParams?: any, uriParams?: any}>(options: {
  name: 'showMaskedAlert' | 'execBotCommand' | 'searchByHashtag' | 'addstickers' | 'im' |
        'resolve' | 'privatepost' | 'addstickers' | 'voicechat' | 'joinchat' | 'join' | 'invoice' |
        'addemoji' | 'setMediaTimestamp' | 'addlist',
  protocol?: 'tg',
  callback: (params: Params, element?: HTMLAnchorElement, masked?: boolean) => any,
  noPathnameParams?: boolean,
  noUriParams?: boolean,
  noCancelEvent?: boolean
}) {
  (window as any)[(options.protocol ? options.protocol + '_' : '') + options.name] = (element?: HTMLAnchorElement, e?: Event) => {
    !options.noCancelEvent && cancelEvent(null);

    let href = element.href;
    if(!href) {
      return;
    }

    let pathnameParams: any[];
    let uriParams: any;

    const u = new URL(href);
    const match = u.host.match(/(.+?)\.t(?:elegram)?\.me/);
    if(match && !T_ME_PREFIXES.has(match[1])) {
      u.pathname = match[1] + (u.pathname === '/' ? '' : u.pathname);
      href = u.toString();
    }

    if(!options.noPathnameParams) pathnameParams = new URL(href).pathname.split('/').slice(1);
    if(!options.noUriParams) uriParams = parseUriParams(href);

    const masked = element.href !== element.textContent && element.getAttribute('safe') === null;
    const result = options.callback(
      {pathnameParams, uriParams} as Params,
      element,
      masked
    );

    if(!e?.isTrusted) {
      return result;
    }
  };
}
