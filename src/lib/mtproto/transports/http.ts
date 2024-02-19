/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type MTPNetworker from '../networker';
import type {DcId, TrueDcId} from '../../../types';
import pause from '../../../helpers/schedulers/pause';
import {logger, LogTypes} from '../../logger';
import MTTransport from './transport';
import Modes from '../../../config/modes';
import transportController from './controller';
// import networkStats from '../networkStats';

const TEST_DROPPING_REQUESTS: TrueDcId = undefined;

export default class HTTP implements MTTransport {
  public networker: MTPNetworker;
  private log: ReturnType<typeof logger>;

  private pending: Array<{
    resolve: (body: Uint8Array) => void,
    reject: any,
    body: Uint8Array
  }> = [];
  private releasing: boolean;

  public connected: boolean;
  private destroyed: boolean;
  private debug: boolean;

  constructor(protected dcId: DcId, protected url: string, logSuffix: string) {
    this.debug = Modes.debug && false;

    let logTypes = LogTypes.Error | LogTypes.Log;
    if(this.debug) logTypes |= LogTypes.Debug;

    this.log = logger(`HTTP-${dcId}` + logSuffix, logTypes);
    this.log('constructor');

    this.connected = false;
  }

  public _send(body: Uint8Array, mode?: RequestMode) {
    this.debug && this.log.debug('-> body length to send:', body.length);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30e3);

    // networkStats.addSent(this.dcId, length);
    return fetch(this.url, {method: 'POST', body, mode, signal: controller.signal}).then(async(response) => {
      if(response.status !== 200 && !mode) {
        response.arrayBuffer().then((buffer) => {
          this.log.error('not 200',
            new TextDecoder('utf-8').decode(new Uint8Array(buffer)));
        });

        throw response;
      }

      this.setConnected(true);

      // * test resending by dropping random request
      if(TEST_DROPPING_REQUESTS && this.dcId === TEST_DROPPING_REQUESTS && Math.random() > .5) {
        controller.abort();
        throw 'test';
      }

      const buffer = await response.arrayBuffer();
      // networkStats.addReceived(this.dcId, buffer.byteLength);
      return new Uint8Array(buffer);
    }).catch((err) => {
      this.setConnected(false);
      throw err;
    }).finally(() => {
      clearTimeout(timeout);
    });
  }

  private setConnected(connected: boolean) {
    if(this.connected === connected || this.destroyed) {
      return;
    }

    this.connected = connected;

    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      transportController.setTransportValue('https', connected);
    }
  }

  public destroy() {
    this.setConnected(false);
    this.destroyed = true;
    this.pending.forEach((pending) => pending.reject());
    this.pending.length = 0;
  }

  public send(body: Uint8Array) {
    if(this.networker) {
      return this._send(body);
    } else {
      const promise = new Promise<typeof body>((resolve, reject) => {
        this.pending.push({resolve, reject, body});
      });

      this.releasePending();

      return promise;
    }
  }

  private async releasePending() {
    if(this.releasing) return;

    this.releasing = true;
    // this.log('-> messages to send:', this.pending.length);
    for(let i = 0; i < this.pending.length; ++i) {
      const pending = this.pending[i];
      const {body, resolve} = pending;

      try {
        const result = await this._send(body);
        resolve(result);
        this.pending.splice(i, 1);
      } catch(err) {
        this.log.error('Send plain request error:', err);
        await pause(5000);
      }

      --i;
    }

    this.releasing = false;
  }
}
