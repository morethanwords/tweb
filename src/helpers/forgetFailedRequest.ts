/**
 * A request kept for whoever asks next - while it is on its way, and once answered - but not once it has failed:
 * then it is forgotten, if it is still the one kept, and the next ask goes to the server again instead of getting
 * that failure for the rest of the session (one dropped connection or flood wait would leave a panel empty until a
 * reload). The failure still reaches whoever waits for it.
 *
 *   return this.x ??= forgetFailedRequest(this.apiManager.invokeApi(...), () => this.x, () => this.x = undefined);
 */
export default function forgetFailedRequest<T>(
  promise: Promise<T>,
  kept: () => unknown,
  forget: () => void
): Promise<T> {
  promise.catch(() => {
    if(kept() === promise) forget();
  });

  return promise;
}
