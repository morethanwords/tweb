/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MTTransport from './transport';

export default class HTTP implements MTTransport {
  constructor(protected dcId: number, protected url: string) {
  }

  public send(data: Uint8Array) {
    return fetch(this.url, {method: 'POST', body: data}).then(response => {
      //console.log('http response', response/* , response.arrayBuffer() */);

      if(response.status !== 200) {
        response.arrayBuffer().then(buffer => {
          console.log('not 200', 
          new TextDecoder("utf-8").decode(new Uint8Array(buffer)));
        })

        throw response;
      } 

      return response.arrayBuffer().then(buffer => {
        return new Uint8Array(buffer);
      }); 
    });
  }
}
