/**
 * A request kept in a map while it is on its way, and forgotten once it settles - answered or failed - if the map
 * still keeps this very one (a newer request for the key stays): the next ask makes a new request.
 */
export default function forgetSettledRequest<K, T>(
  map: Pick<Map<K, Promise<T>>, 'get' | 'delete'>,
  key: K,
  promise: Promise<T>
): Promise<T> {
  const forget = () => {
    if(map.get(key) === promise) {
      map.delete(key);
    }
  };
  promise.then(forget, forget);

  return promise;
}
