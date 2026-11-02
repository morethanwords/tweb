import forgetSettledRequest from '@helpers/forgetSettledRequest';

export class RequestSynchronizer<Key, Response> {
  private ongoingRequests = new Map<Key, Promise<Response>>();

  async performRequest(
    key: Key,
    requestFn: () => Promise<Response>
  ) {
    let request = this.ongoingRequests.get(key);
    if(!request) {
      this.ongoingRequests.set(key, request = requestFn());
      // * a failed request goes too: kept, it would hand its error to every retry of the key
      forgetSettledRequest(this.ongoingRequests, key, request);
    }

    return request;
  }
}
