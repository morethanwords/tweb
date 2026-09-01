/*
 * The click a call preview offers. It exists so surfaces without a rendered
 * message around them — the pinned bar's "Join call" button — can dispatch the
 * same internal link a bubble's preview does. That is exactly why the sender
 * has to travel on the anchor: there is no bubble to climb to from a button,
 * and the join confirmation names whoever invited you.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

import getWebPageActionOnClick from '@components/chat/getWebPageActionOnClick';
import type {WebPage} from '@layer';

const SENDER = (61004386).toPeerId();
const CALL_URL = 'https://t.me/call/ON9EHGLaogOp2uBOt1R6C7XOunc';

const makeWebPage = (type: string, url = CALL_URL) => ({
  _: 'webPage',
  id: '1',
  hash: 0,
  type,
  url,
  display_url: url
}) as any as WebPage;

describe('web page action on click', () => {
  let dispatched: HTMLAnchorElement[];

  beforeEach(() => {
    dispatched = [];
    (window as any).call = (element: HTMLAnchorElement) => dispatched.push(element);
  });

  it('hands the internal handler an anchor carrying the message sender', () => {
    const onClick = getWebPageActionOnClick(makeWebPage('telegram_call'), ['telegram_call'], SENDER);
    expect(onClick).toBeTypeOf('function');

    onClick(new Event('click'));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].href).toContain('/call/');
    expect(dispatched[0].getAttribute('safe')).toBe('1');
    expect(dispatched[0].dataset.fromId).toBe('' + SENDER);
  });

  it('leaves the anchor unstamped when the caller has no sender to name', () => {
    getWebPageActionOnClick(makeWebPage('telegram_call'), ['telegram_call'])(new Event('click'));

    expect(dispatched[0].dataset.fromId).toBeUndefined();
  });

  it('offers nothing for a preview type that is not actionable here', () => {
    expect(getWebPageActionOnClick(makeWebPage('photo'), ['telegram_call'], SENDER)).toBeUndefined();
  });
});
