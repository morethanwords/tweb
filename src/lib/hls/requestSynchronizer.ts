export class RequestSynchronizer<Key, Response> {
  private ongoingRequests = new Map<Key, Promise<Response>>();

  async performRequest(
    key: Key,
    requestFn: () => Promise<Response>
  ) {
    let request = this.ongoingRequests.get(key);
    if(!request) this.ongoingRequests.set(key, request = requestFn());

    const result = await request;
    this.ongoingRequests.delete(key);
    return result;
  }
}
