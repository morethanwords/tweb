/**
 * Doesn't do anything, just annotates that something is tracked (in solid-js)
 *
 * @example
 * track(() => [props.size, props.color]);
 */
export default function track(cb: () => any) {
  cb();
}
