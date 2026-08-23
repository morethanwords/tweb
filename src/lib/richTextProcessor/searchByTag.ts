export default async function searchByTag<T>(options: {
  query: string,
  username?: string,
  activateSearch: (query: string) => void,
  resolveUsername: (username: string) => MaybePromise<T>,
  openPeer: (peer: T) => MaybePromise<unknown>,
  isCurrent: () => boolean,
  onResolveError: (err: unknown) => void
}) {
  options.activateSearch(options.query);
  if(!options.username) {
    return;
  }

  let peer: T;
  try {
    peer = await options.resolveUsername(options.username);
  } catch(err) {
    if(options.isCurrent()) {
      options.onResolveError(err);
    }

    return;
  }

  if(!options.isCurrent()) {
    return;
  }

  await options.openPeer(peer);
  if(options.isCurrent()) {
    options.activateSearch(options.query);
  }
}
