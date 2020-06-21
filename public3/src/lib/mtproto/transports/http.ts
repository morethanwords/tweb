import MTTransport from './transport';
import { bytesFromArrayBuffer } from '../../bin_utils';

export default class HTTP extends MTTransport {
  constructor(dcID: number, url: string) {
    super(dcID, url);
  }

  send = (data: Uint8Array) => {
    return fetch(this.url, {method: 'POST', body: data}).then(response => {
      //console.log('http response', response/* , response.arrayBuffer() */);

      if(response.status != 200) {
        response.arrayBuffer().then(buffer => {
          console.log('not 200', 
          new TextDecoder("utf-8").decode(new Uint8Array(bytesFromArrayBuffer(buffer))));
        })

        throw response;
      } 

      return response.arrayBuffer().then(buffer => {
        return new Uint8Array(bytesFromArrayBuffer(buffer));
      }); 
    });
  }
}
