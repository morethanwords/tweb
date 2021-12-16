/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { pause } from '../../../helpers/schedulers/pause';
import { DcId } from '../../../types';
import { logger } from '../../logger';
import type MTPNetworker from '../networker';
import MTTransport from './transport';

export default class HTTP implements MTTransport {
  public networker: MTPNetworker;
  private log: ReturnType<typeof logger>;

  private pending: Array<{
    resolve: (body: Uint8Array) => void, 
    reject: any, 
    body: Uint8Array
  }> = [];
  private releasing: boolean;
  
  constructor(protected dcId: DcId, protected url: string, logSuffix: string) {
    this.log = logger(`HTTP-${dcId}` + logSuffix);
  }

  private _send(body: Uint8Array) {
    return fetch(this.url, {method: 'POST', body}).then(response => {
      if(response.status !== 200) {
        response.arrayBuffer().then(buffer => {
          this.log.error('not 200', 
            new TextDecoder("utf-8").decode(new Uint8Array(buffer)));
        });

        throw response;
      }

      // * test resending by dropping random request
      // if(Math.random() > .5) {
      //   throw 'asd';
      // }

      return response.arrayBuffer().then(buffer => {
        return new Uint8Array(buffer);
      }); 
    });
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
